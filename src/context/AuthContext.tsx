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
import { appConfig } from '../lib/config'

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
  refresh: () => Promise<void>
  logout: () => Promise<void>
  loginWithGoogle: () => void
  loginWithFacebook: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUserView | null>(null)
  const [loading, setLoading] = useState(true)

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
        void syncSessionToExtension()
      } else {
        setUser(null)
      }
    } catch {
      setUser(null)
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
      void refresh().then(() => {
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
  }, [])

  const loginWithGoogle = useCallback(() => {
    window.location.href = `${appConfig.apiBaseUrl}/auth/google`
  }, [])

  const loginWithFacebook = useCallback(() => {
    window.location.href = `${appConfig.apiBaseUrl}/auth/meta`
  }, [])

  const value = useMemo(
    () => ({ user, loading, refresh, logout, loginWithGoogle, loginWithFacebook }),
    [user, loading, refresh, logout, loginWithGoogle, loginWithFacebook],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
