import { createHmac, timingSafeEqual } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { assertAuthSecrets, env } from '../env'

export const SESSION_COOKIE = 'distro_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days

export type AuthProvider = 'google' | 'facebook'

export interface SessionPayload {
  sub: string
  email: string
  name: string
  picture: string | null
  provider: AuthProvider
  iat: number
  exp: number
}

function b64url(input: Buffer | string): string {
  const buf = typeof input === 'string' ? Buffer.from(input, 'utf8') : input
  return buf.toString('base64url')
}

function sign(body: string): string {
  assertAuthSecrets()
  return createHmac('sha256', env.authSecret).update(body).digest('base64url')
}

/** Create a signed session / extension token (HMAC JWT-style: body.sig). */
export function createSessionToken(input: {
  id: string
  email: string
  name: string
  picture: string | null
  provider: AuthProvider
}): string {
  const now = Math.floor(Date.now() / 1000)
  const payload: SessionPayload = {
    sub: input.id,
    email: input.email,
    name: input.name,
    picture: input.picture,
    provider: input.provider,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  }
  const body = b64url(JSON.stringify(payload))
  return `${body}.${sign(body)}`
}

export function verifySessionToken(token: string): SessionPayload | null {
  try {
    assertAuthSecrets()
    const [body, sig] = token.split('.')
    if (!body || !sig) return null
    const expected = sign(body)
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload
    if (!payload.sub || !payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

function isSecureRequest(req: VercelRequest): boolean {
  const proto = req.headers['x-forwarded-proto']
  const value = Array.isArray(proto) ? proto[0] : proto
  if (value === 'https') return true
  try {
    return new URL(env.appUrl).protocol === 'https:'
  } catch {
    return false
  }
}

export function buildSessionCookie(token: string, req: VercelRequest): string {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ]
  if (isSecureRequest(req)) parts.push('Secure')
  return parts.join('; ')
}

export function clearSessionCookie(req: VercelRequest): string {
  const parts = [`${SESSION_COOKIE}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0']
  if (isSecureRequest(req)) parts.push('Secure')
  return parts.join('; ')
}

export function readCookie(req: VercelRequest, name: string): string | null {
  const raw = req.headers.cookie
  if (!raw || typeof raw !== 'string') return null
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

export function getSessionFromRequest(req: VercelRequest): SessionPayload | null {
  const token = readCookie(req, SESSION_COOKIE)
  if (!token) return null
  return verifySessionToken(token)
}

/** Accept session from cookie OR Authorization: Bearer <token> (extension). */
export function getSessionFromRequestOrBearer(req: VercelRequest): SessionPayload | null {
  const fromCookie = getSessionFromRequest(req)
  if (fromCookie) return fromCookie
  const auth = req.headers.authorization
  const value = Array.isArray(auth) ? auth[0] : auth
  if (!value?.startsWith('Bearer ')) return null
  return verifySessionToken(value.slice(7).trim())
}

export function setSessionCookie(res: VercelResponse, req: VercelRequest, token: string): void {
  res.setHeader('Set-Cookie', buildSessionCookie(token, req))
}

export function clearSessionOnResponse(res: VercelResponse, req: VercelRequest): void {
  res.setHeader('Set-Cookie', clearSessionCookie(req))
}
