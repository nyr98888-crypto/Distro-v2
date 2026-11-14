/**
 * GET /api/auth/google — start Google OAuth.
 * Self-contained: no Turso, no src/, no shared api modules (avoids Vercel cold-start crashes).
 */
import { createHash } from 'node:crypto'

type Req = {
  method?: string
  query?: Record<string, string | string[] | undefined>
}

type Res = {
  status: (code: number) => Res
  json: (body: unknown) => unknown
  redirect: (code: number, url: string) => unknown
}

function readEnv(key: string, fallback = ''): string {
  const value = process.env[key]
  if (typeof value !== 'string') return fallback
  return value.trim().replace(/^["']+|["']+$/g, '')
}

function appUrl(): string {
  const explicit = readEnv('APP_URL') || readEnv('VITE_APP_URL')
  if (explicit) return explicit.replace(/\/$/, '')
  const vercel = readEnv('VERCEL_URL')
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '').replace(/\/$/, '')}`
  return 'http://localhost:5173'
}

function googleRedirectUri(): string {
  const derived = `${appUrl()}/api/auth/google/callback`
  const explicit = readEnv('GOOGLE_REDIRECT_URI')
  if (!explicit) return derived
  try {
    if (new URL(explicit).host !== new URL(appUrl()).host) return derived
  } catch {
    return derived
  }
  return explicit
}

/** Same format as api/lib/crypto signOAuthState (sha256 body.secret). */
function signOAuthState(payload: Record<string, string>, authSecret: string): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHash('sha256').update(`${body}.${authSecret}`).digest('base64url')
  return `${body}.${sig}`
}

export default async function handler(req: Req, res: Res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'method_not_allowed' })
    }

    const clientId = readEnv('GOOGLE_CLIENT_ID')
    const clientSecret = readEnv('GOOGLE_CLIENT_SECRET')
    const authSecret = readEnv('AUTH_SECRET')
    const redirectUri = googleRedirectUri()

    if (!clientId || !clientSecret) {
      return res.status(400).json({
        error: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in Vercel env.',
      })
    }
    if (!authSecret || authSecret.length < 32) {
      return res.status(400).json({
        error: 'AUTH_SECRET must be a random string of at least 32 characters.',
      })
    }

    const state = signOAuthState(
      {
        provider: 'google',
        nonce: Math.random().toString(36).slice(2),
        ts: String(Date.now()),
      },
      authSecret,
    )

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      access_type: 'online',
      include_granted_scopes: 'true',
      prompt: 'select_account',
      state,
    })

    return res.redirect(302, `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/auth/google]', message)
    return res.status(500).json({ error: message })
  }
}
