/**
 * GET /api/auth/me — fully self-contained (no Turso / db / shared session imports).
 * Validates httpOnly cookie `distro_session` OR `Authorization: Bearer <token>`
 * using the same HMAC scheme as /api/auth/google/callback.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

type Req = {
  method?: string
  headers: Record<string, string | string[] | undefined>
}

type Res = {
  status: (code: number) => Res
  json: (body: unknown) => unknown
  setHeader: (name: string, value: string) => void
  end?: () => unknown
}

const SESSION_COOKIE = 'distro_session'

function readEnv(key: string, fallback = ''): string {
  const value = process.env[key]
  if (typeof value !== 'string') return fallback
  return value.trim().replace(/^["']+|["']+$/g, '')
}

function readCookie(req: Req, name: string): string | null {
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

type SessionPayload = {
  sub: string
  email: string
  name: string
  picture: string | null
  provider: 'google' | 'facebook'
  iat: number
  exp: number
}

function verifySessionToken(token: string, authSecret: string): SessionPayload | null {
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

function getSession(req: Req, authSecret: string): SessionPayload | null {
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

export default async function handler(req: Req, res: Res) {
  try {
    res.setHeader('Access-Control-Allow-Origin', (req.headers.origin as string) || '*')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Cache-Control', 'no-store')

    if (req.method === 'OPTIONS') {
      return res.status(204).json({})
    }
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'method_not_allowed' })
    }

    const authSecret = readEnv('AUTH_SECRET')
    if (!authSecret || authSecret.length < 32) {
      return res.status(401).json({
        authenticated: false,
        error: 'AUTH_SECRET is missing or too short on Vercel.',
      })
    }

    const session = getSession(req, authSecret)
    if (!session) {
      return res.status(401).json({ authenticated: false })
    }

    return res.status(200).json({
      authenticated: true,
      user: {
        id: session.sub,
        email: session.email,
        name: session.name || session.email,
        picture: session.picture,
        provider: session.provider || 'google',
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/auth/me]', message)
    return res.status(401).json({ authenticated: false, error: message })
  }
}
