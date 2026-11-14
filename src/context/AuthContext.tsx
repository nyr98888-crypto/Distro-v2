import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import { syncSessionToExtension } from '../lib/extensionBridge'
import { REQUIRED_OAUTH_ENV_VARS } from '../lib/config'

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

const HANDSHAKE_FLAG = 'distro_ext_handshake'

function extractErrorMessage(body: string): string | null {
  const text = body.trim()
  if (!text) return null
  try {
    const json = JSON.parse(text) as { error?: string; message?: string }
    if (json.message) return json.message
    if (json.error) return json.error
  } catch {
    /* not JSON */
  }
  const pMatch = text.match(/<p>([^<]+)<\/p>/i)
  if (pMatch?.[1]) return pMatch[1].trim()
  const hMatch = text.match(/<h1>([^<]+)<\/h1>/i)
  if (hMatch?.[1]) return hMatch[1].trim()
  if (text.length < 280 && !text.includes('<')) return text
  return null
}

/** Google OAuth only — uses window.location.origin (never Meta). */
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUserView | null>(null)
  const [loading, setLoading] = useState(true)
  const [extensionHandshakeOk, setExtensionHandshakeOk] = useState<boolean | null>(null)

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' })
      if (!res.ok) {
        setUser(null)
        return
      }
      const json = (await res.json()) as {
        authenticated?: boolean
        user?: AuthUserView
      }
      if (json.authenticated && json.user) {
        setUser(json.user)
        const ok = await syncSessionToExtension()
        setExtensionHandshakeOk(ok)
      } else {
        setUser(null)
        setExtensionHandshakeOk(null)
      }
    } catch {
      setUser(null)
      setExtensionHandshakeOk(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('auth') === 'connected') {
      try {
        sessionStorage.setItem(HANDSHAKE_FLAG, '1')
      } catch {
        /* ignore */
      }
      void refresh().then(async () => {
        const ok = await syncSessionToExtension()
        setExtensionHandshakeOk(ok)
        window.history.replaceState({}, '', window.location.pathname)
      })
    }
  }, [refresh])

  const logout = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' })
    } catch {
      /* ignore */
    }
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
