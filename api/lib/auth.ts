/**
 * Shared HMAC session verification for Distro V2 API routes.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

const SESSION_COOKIE = 'distro_session'

export type ApiReq = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
  query?: Record<string, string | string[] | undefined>
}

export type ApiRes = {
  status: (code: number) => ApiRes
  json: (body: unknown) => unknown
  setHeader: (name: string, value: string) => void
  end?: () => unknown
}

export type SessionPayload = {
  sub: string
  email: string
  name: string
  picture: string | null
  provider: 'google' | 'facebook'
  iat: number
  exp: number
}

export function readEnv(key: string, fallback = ''): string {
  const value = process.env[key]
  if (typeof value !== 'string') return fallback
  return value.trim().replace(/^["']+|["']+$/g, '')
}

export function readCookie(req: ApiReq, name: string): string | null {
  const raw = req.headers.cookie
  if (!raw || typeof raw !== 'string') return null
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) {
      try {
        return decodeURIComponent(rest.join('='))
      } catch {
        return rest.join('=')
      }
    }
  }
  return null
}

export function verifySessionToken(token: string, authSecret: string): SessionPayload | null {
  try {
    const [body, sig] = token.split('.')
    if (!body || !sig) return null
    const expected = createHmac('sha256', authSecret).update(body).digest('base64url')
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload
    if (!payload.sub || !payload.email || !payload.exp) return null
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

export function getSession(req: ApiReq): SessionPayload | null {
  const authSecret = readEnv('AUTH_SECRET')
  if (!authSecret || authSecret.length < 32) return null

  const fromCookie = readCookie(req, SESSION_COOKIE)
  if (fromCookie) {
    const session = verifySessionToken(fromCookie, authSecret)
    if (session) return session
  }

  const auth = req.headers.authorization
  const value = Array.isArray(auth) ? auth[0] : auth
  if (value?.startsWith('Bearer ')) {
    return verifySessionToken(value.slice(7).trim(), authSecret)
  }
  return null
}

export function setCors(req: ApiReq, res: ApiRes, methods = 'GET, POST, OPTIONS'): void {
  const origin = req.headers.origin
  const originVal = Array.isArray(origin) ? origin[0] : origin
  res.setHeader('Access-Control-Allow-Origin', originVal || '*')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, x-extension-sync-secret, x-extension-id, x-cron-secret',
  )
  res.setHeader('Access-Control-Allow-Methods', methods)
  res.setHeader('Cache-Control', 'no-store')
}

export function parseJsonBody(req: ApiReq): Record<string, unknown> {
  const raw = req.body
  if (raw == null) return {}
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw || '{}') as Record<string, unknown>
    } catch {
      return {}
    }
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
    try {
      return JSON.parse(raw.toString('utf8') || '{}') as Record<string, unknown>
    } catch {
      return {}
    }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>
  return {}
}

export function requireSession(req: ApiReq, res: ApiRes): SessionPayload | null {
  const authSecret = readEnv('AUTH_SECRET')
  if (!authSecret || authSecret.length < 32) {
    res.status(401).json({ error: 'AUTH_SECRET missing on Vercel' })
    return null
  }
  const session = getSession(req)
  if (!session) {
    res.status(401).json({ error: 'unauthorized' })
    return null
  }
  return session
}

export function isValidCron(req: ApiReq): boolean {
  const secret = readEnv('CRON_SECRET')
  if (!secret) return false
  const auth = req.headers.authorization
  const authValue = Array.isArray(auth) ? auth[0] : auth
  if (authValue === `Bearer ${secret}`) return true
  const header = req.headers['x-cron-secret']
  const headerValue = Array.isArray(header) ? header[0] : header
  return headerValue === secret
}

export function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
