import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { syncSessionToExtension, broadcastAuthToExtension } from '../lib/extensionBridge'
import { REQUIRED_OAUTH_ENV_VARS } from '../lib/config'
import {
  authHeaders,
  captureSessionFromUrl,
  clearStoredSession,
  getStoredSessionToken,
  getStoredSessionUser,
  peekSessionPayload,
  saveSessionToken,
} from '../lib/sessionStore'

export type AuthUserView = {
  id: string
  email: string
  name: string
  picture: string | null
  provider: 'google' | 'facebook'
}

interface AuthContextValue {
  user: AuthUserView | null
  loading: boolean
  extensionHandshakeOk: boolean | null
  refresh: () => Promise<void>
  logout: () => Promise<void>
  loginWithGoogle: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export const HANDSHAKE_FLAG = 'distro_ext_handshake'

function extractErrorMessage(body: string): string | null {
  const text = body.trim()
  if (!text) return null
  try {
    const json = JSON.parse(text) as { error?: string; message?: string }
    if (json.message) return json.message
    if (json.error) return json.error
  } catch {
    /* not JSON — likely SW-served HTML */
  }
  if (/FUNCTION_INVOCATION_FAILED/i.test(text)) {
    return (
      'Google auth function crashed on Vercel (FUNCTION_INVOCATION_FAILED). ' +
      'Check GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, AUTH_SECRET, APP_URL on Vercel.'
    )
  }
  if (text.length < 280 && !text.includes('<')) return text
  return null
}

function userFromLocalToken(): AuthUserView | null {
  const token = getStoredSessionToken()
  if (!token) return null
  const peeked = peekSessionPayload(token) || getStoredSessionUser()
  if (!peeked?.email) return null
  return {
    id: peeked.id || 'local',
    email: peeked.email,
    name: peeked.name || peeked.email,
    picture: peeked.picture,
    provider: peeked.provider || 'google',
  }
}

async function startGoogleOAuth(): Promise<void> {
  if (typeof window === 'undefined' || !window.location?.origin) {
    throw new Error('Auth client is uninitialized (window.location.origin unavailable).')
  }

  const origin = window.location.origin
  const redirectTo = `${origin}/api/auth/google`

  console.info('[Distro Auth] Starting Google OAuth', { redirectTo, origin })
  console.info('[Distro Auth] Required Vercel env vars:', REQUIRED_OAUTH_ENV_VARS.join(', '))

  let res: Response
  try {
    res = await fetch(redirectTo, {
      method: 'GET',
      redirect: 'manual',
      credentials: 'include',
      cache: 'no-store',
    })
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err)
    throw new Error(
      `Cannot reach Google auth endpoint (${redirectTo}). ${detail}. ` +
        `Set on Vercel: ${REQUIRED_OAUTH_ENV_VARS.join(', ')}`,
    )
  }

  if (
    res.type === 'opaqueredirect' ||
    res.status === 0 ||
    (res.status >= 300 && res.status < 400)
  ) {
    window.location.assign(redirectTo)
    return
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const extracted = extractErrorMessage(body)
    throw new Error(
      extracted ||
        `Google OAuth failed (HTTP ${res.status}). Check Vercel: ${REQUIRED_OAUTH_ENV_VARS.join(', ')}`,
    )
  }

  window.location.assign(redirectTo)
}

async function fetchMeUser(): Promise<AuthUserView | null> {
  try {
    const res = await fetch('/api/auth/me', {
      credentials: 'include',
      cache: 'no-store',
      headers: {
        Accept: 'application/json',
        ...authHeaders(),
      },
    })
    const contentType = res.headers.get('content-type') || ''
    // Service worker may wrongly return index.html for /api/*
    if (!contentType.includes('application/json')) return null
    if (!res.ok) return null
    const json = (await res.json()) as {
      authenticated?: boolean
      user?: AuthUserView
    }
    if (json.authenticated && json.user) return json.user
    return null
  } catch {
    return null
  }
}

async function handshakeExtension(): Promise<boolean> {
  const synced = await syncSessionToExtension()
  if (synced) return true
  const token = getStoredSessionToken()
  if (!token) return false
  return broadcastAuthToExtension(token, window.location.origin)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  // Seed from localStorage immediately so Login never flashes after OAuth bridge
  const [user, setUser] = useState<AuthUserView | null>(() => userFromLocalToken())
  const [loading, setLoading] = useState(() => !userFromLocalToken())
  const [extensionHandshakeOk, setExtensionHandshakeOk] = useState<boolean | null>(null)

  const refresh = useCallback(async () => {
    try {
      captureSessionFromUrl()

      // Hash handoff from HTML bridge: /#auth=connected
      if (window.location.hash.includes('auth=connected')) {
        try {
          sessionStorage.setItem(HANDSHAKE_FLAG, '1')
        } catch {
          /* ignore */
        }
        window.history.replaceState({}, '', '/')
      }

      const local = userFromLocalToken()
      if (local) {
        setUser(local)
        setLoading(false)
      }

      const next = await fetchMeUser()
      if (next) {
        setUser(next)
        const token = getStoredSessionToken()
        if (token) {
          saveSessionToken(token, {
            id: next.id,
            email: next.email,
            name: next.name,
            picture: next.picture,
            provider: next.provider,
          })
        }
        const ok = await handshakeExtension()
        setExtensionHandshakeOk(ok)
      } else if (local) {
        // Stay in the app with local session even if /api/auth/me is blocked by SW
        const ok = await handshakeExtension()
        setExtensionHandshakeOk(ok)
      } else if (!getStoredSessionToken()) {
        setUser(null)
        setExtensionHandshakeOk(null)
      }
    } catch {
      const local = userFromLocalToken()
      if (local) setUser(local)
      else setUser(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (
      params.get('session') ||
      params.get('auth') === 'connected' ||
      window.location.hash.includes('auth=connected')
    ) {
      try {
        sessionStorage.setItem(HANDSHAKE_FLAG, '1')
      } catch {
        /* ignore */
      }
    }
    void refresh()
  }, [refresh])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
        headers: { ...authHeaders() },
      })
    } catch {
      /* ignore */
    }
    clearStoredSession()
    setUser(null)
    setExtensionHandshakeOk(null)
    try {
      sessionStorage.removeItem(HANDSHAKE_FLAG)
    } catch {
      /* ignore */
    }
  }, [])

  const loginWithGoogle = useCallback(async () => {
    try {
      await startGoogleOAuth()
    } catch (err) {
      console.error('[Distro Auth] Google login failed', err)
      throw err
    }
  }, [])

  const value = useMemo(
    () => ({
      user,
      loading,
      extensionHandshakeOk,
      refresh,
      logout,
      loginWithGoogle,
    }),
    [user, loading, extensionHandshakeOk, refresh, logout, loginWithGoogle],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}

export function consumeHandshakeFlag(): boolean {
  try {
    const v = sessionStorage.getItem(HANDSHAKE_FLAG)
    if (v) {
      sessionStorage.removeItem(HANDSHAKE_FLAG)
      return true
    }
  } catch {
    /* ignore */
  }
  return false
}
