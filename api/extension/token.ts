/**
 * GET /api/extension/token — self-contained (no Turso/db imports).
 * Returns a signed session token for Distro extension v1.0.9 handshake.
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
}

const SESSION_COOKIE = 'distro_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30

function readEnv(key: string, fallback = ''): string {
  const value = process.env[key]
  if (typeof value !== 'string') return fallback
  return value.trim().replace(/^["']+|["']+$/g, '')
}

function appUrl(req: Req): string {
  const host = req.headers['x-forwarded-host']
  const proto = req.headers['x-forwarded-proto']
  const hostVal = Array.isArray(host) ? host[0] : host
  const protoVal = Array.isArray(proto) ? proto[0] : proto
  if (hostVal) return `${protoVal === 'http' ? 'http' : 'https'}://${hostVal}`.replace(/\/$/, '')
  const explicit = readEnv('APP_URL') || readEnv('VITE_APP_URL')
  if (explicit) return explicit.replace(/\/$/, '')
  const vercel = readEnv('VERCEL_URL')
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '').replace(/\/$/, '')}`
  return 'http://localhost:5173'
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

function createSessionToken(
  input: {
    id: string
    email: string
    name: string
    picture: string | null
    provider: 'google' | 'facebook'
  },
  authSecret: string,
): string {
  const now = Math.floor(Date.now() / 1000)
  const payload = {
    sub: input.id,
    email: input.email,
    name: input.name,
    picture: input.picture,
    provider: input.provider,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  }
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url')
  const sig = createHmac('sha256', authSecret).update(body).digest('base64url')
  return `${body}.${sig}`
}

export default async function handler(req: Req, res: Res) {
  try {
    res.setHeader('Access-Control-Allow-Origin', (req.headers.origin as string) || '*')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Cache-Control', 'no-store')

    if (req.method === 'OPTIONS') return res.status(204).json({})
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' })

    const authSecret = readEnv('AUTH_SECRET')
    if (!authSecret || authSecret.length < 32) {
      return res.status(401).json({ error: 'AUTH_SECRET missing on Vercel' })
    }

    const session = getSession(req, authSecret)
    if (!session) return res.status(401).json({ error: 'unauthorized' })

    const user = {
      id: session.sub,
      email: session.email,
      name: session.name || session.email,
      picture: session.picture,
      provider: session.provider || 'google',
    }

    const token = createSessionToken(user, authSecret)

    return res.status(200).json({
      token,
      apiUrl: appUrl(req),
      user,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/extension/token]', message)
    return res.status(401).json({ error: message })
  }
}
