/** Client-side session token persistence (URL handoff + localStorage). */

export const SESSION_STORAGE_KEY = 'distro_session_token'
export const SESSION_USER_KEY = 'distro_session_user'

export type StoredSessionUser = {
  id?: string
  email: string
  name: string
  picture: string | null
  provider: 'google' | 'facebook'
}

export function getStoredSessionToken(): string | null {
  try {
    const token = localStorage.getItem(SESSION_STORAGE_KEY)
    return token && token.length > 10 ? token : null
  } catch {
    return null
  }
}

export function getStoredSessionUser(): StoredSessionUser | null {
  try {
    const raw = localStorage.getItem(SESSION_USER_KEY)
    if (!raw) return null
    return JSON.parse(raw) as StoredSessionUser
  } catch {
    return null
  }
}

export function saveSessionToken(token: string, user?: StoredSessionUser | null): void {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, token)
    if (user) {
      localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user))
    }
  } catch {
    /* ignore quota / private mode */
  }
}

export function clearStoredSession(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY)
    localStorage.removeItem(SESSION_USER_KEY)
  } catch {
    /* ignore */
  }
}

/** Decode unsigned payload for optimistic UI (server still verifies). */
export function peekSessionPayload(token: string): StoredSessionUser | null {
  try {
    const [body] = token.split('.')
    if (!body) return null
    const padded =
      body.replace(/-/g, '+').replace(/_/g, '/') +
      '==='.slice((body.length + 3) % 4)
    const json = JSON.parse(atob(padded)) as {
      sub?: string
      email?: string
      name?: string
      picture?: string | null
      provider?: 'google' | 'facebook'
      exp?: number
    }
    if (!json.email || !json.name) return null
    if (json.exp && json.exp < Math.floor(Date.now() / 1000)) return null
    return {
      id: json.sub,
      email: json.email,
      name: json.name,
      picture: json.picture ?? null,
      provider: json.provider || 'google',
    }
  } catch {
    return null
  }
}

/**
 * Capture ?session= from OAuth redirect (legacy), persist, and clean the URL.
 * Primary handoff is now the HTML bridge writing localStorage directly.
 */
export function captureSessionFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  const params = new URLSearchParams(window.location.search)
  const token = params.get('session')
  if (token && token.length > 10) {
    const peeked = peekSessionPayload(token)
    const email = params.get('email') || peeked?.email || ''
    const name = params.get('name') || peeked?.name || email || 'User'
    const picture = params.get('picture') || peeked?.picture || null
    saveSessionToken(token, {
      id: peeked?.id,
      email,
      name,
      picture,
      provider: peeked?.provider || 'google',
    })
    params.delete('session')
    params.delete('email')
    params.delete('name')
    params.delete('picture')
    const qs = params.toString()
    window.history.replaceState({}, '', qs ? `/?${qs}` : '/')
    return token
  }
  return getStoredSessionToken()
}

export function authHeaders(): HeadersInit {
  const token = getStoredSessionToken()
  const headers: Record<string, string> = {}
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}
