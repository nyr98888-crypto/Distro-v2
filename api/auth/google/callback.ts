/**
 * GET /api/auth/google/callback
 * Sets httpOnly cookie, then returns a tiny HTML bridge that writes the session
 * token into localStorage and redirects to `/` — survives PWA/SW cookie drops.
 */
import { createClient } from '@libsql/client/web'
import { createHash, createHmac } from 'node:crypto'

type Req = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  query?: Record<string, string | string[] | undefined>
}

type Res = {
  status: (code: number) => Res
  json: (body: unknown) => unknown
  redirect: (code: number, url: string) => unknown
  setHeader: (name: string, value: string) => void
  send: (body: string) => unknown
}

const SESSION_COOKIE = 'distro_session'
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30

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

function q(req: Req, key: string): string {
  const v = req.query?.[key]
  return typeof v === 'string' ? v : ''
}

function verifyOAuthState(state: string, authSecret: string): Record<string, string> | null {
  try {
    const [body, sig] = state.split('.')
    if (!body || !sig) return null
    const expected = createHash('sha256').update(`${body}.${authSecret}`).digest('base64url')
    if (sig !== expected) return null
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<string, string>
  } catch {
    return null
  }
}

function createSessionToken(input: {
  id: string
  email: string
  name: string
  picture: string | null
  provider: 'google'
  authSecret: string
}): string {
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
  const sig = createHmac('sha256', input.authSecret).update(body).digest('base64url')
  return `${body}.${sig}`
}

function setSessionCookie(req: Req, res: Res, token: string): void {
  const proto = req.headers['x-forwarded-proto']
  const protoVal = Array.isArray(proto) ? proto[0] : proto
  const secure = protoVal === 'https' || appUrl().startsWith('https://')
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${SESSION_TTL_SECONDS}`,
  ]
  if (secure) parts.push('Secure')
  res.setHeader('Set-Cookie', parts.join('; '))
}

async function upsertGoogleUser(input: {
  providerSub: string
  email: string
  name: string
  picture: string | null
}): Promise<{ id: string; email: string; name: string; picture: string | null }> {
  const fallback = {
    id: `usr_google_${input.providerSub}`,
    email: input.email,
    name: input.name,
    picture: input.picture,
  }

  const url = readEnv('TURSO_DATABASE_URL')
  const authToken = readEnv('TURSO_AUTH_TOKEN')
  if (!url || !authToken) return fallback

  try {
    const now = new Date().toISOString()
    const client = createClient({ url, authToken })
    await client.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        google_sub TEXT NOT NULL UNIQUE,
        email TEXT NOT NULL,
        name TEXT NOT NULL DEFAULT '',
        picture TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_login_at TEXT NOT NULL
      )
    `)
    const existing = await client.execute({
      sql: 'SELECT id FROM users WHERE google_sub = ? LIMIT 1',
      args: [input.providerSub],
    })
    const id =
      (existing.rows[0]?.id as string | undefined) ||
      `usr_${Math.random().toString(36).slice(2, 10)}`
    await client.execute({
      sql: `INSERT INTO users (id, google_sub, email, name, picture, created_at, updated_at, last_login_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(google_sub) DO UPDATE SET
              email = excluded.email,
              name = excluded.name,
              picture = excluded.picture,
              updated_at = excluded.updated_at,
              last_login_at = excluded.last_login_at`,
      args: [id, input.providerSub, input.email, input.name, input.picture, now, now, now],
    })
    return { id, email: input.email, name: input.name, picture: input.picture }
  } catch (err) {
    console.warn('[google/callback] Turso upsert failed; using fallback user id', err)
    return fallback
  }
}

function escapeJs(value: string): string {
  return JSON.stringify(value)
}

/** HTML bridge: write localStorage then enter the SPA dashboard. */
function sendSessionBridge(
  res: Res,
  token: string,
  user: { email: string; name: string; picture: string | null },
): unknown {
  const userJson = escapeJs(
    JSON.stringify({
      email: user.email,
      name: user.name,
      picture: user.picture,
      provider: 'google',
    }),
  )
  const html = `<!doctype html>
<html lang="he" dir="rtl">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Distro — מתחבר…</title>
  <style>
    body{font-family:Heebo,system-ui,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;background:#f6f8fa;color:#0f172a;margin:0}
    .card{background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:1.5rem 1.75rem;box-shadow:0 8px 30px rgba(15,23,42,.06)}
  </style>
</head>
<body>
  <div class="card">מתחבר ל־Distro V2…</div>
  <script>
    (function () {
      try {
        localStorage.setItem('distro_session_token', ${escapeJs(token)});
        localStorage.setItem('distro_session_user', ${userJson});
        sessionStorage.setItem('distro_ext_handshake', '1');
      } catch (e) {}
      // Prefer hash so service workers / proxies don't strip the token
      location.replace('/#auth=connected');
    })();
  </script>
</body>
</html>`
  res.setHeader('Content-Type', 'text/html; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  return res.status(200).send(html)
}

export default async function handler(req: Req, res: Res) {
  const home = appUrl()
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'method_not_allowed' })
    }

    const code = q(req, 'code')
    const state = q(req, 'state')
    const oauthError = q(req, 'error')
    const authSecret = readEnv('AUTH_SECRET')
    const clientId = readEnv('GOOGLE_CLIENT_ID')
    const clientSecret = readEnv('GOOGLE_CLIENT_SECRET')
    const redirectUri = googleRedirectUri()

    if (oauthError) return res.redirect(302, `${home}/?auth=error`)
    if (!authSecret || authSecret.length < 32) {
      return res.status(400).json({ error: 'AUTH_SECRET must be set (32+ chars) on Vercel.' })
    }
    if (!clientId || !clientSecret) {
      return res.status(400).json({
        error: 'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set on Vercel.',
      })
    }

    const statePayload = verifyOAuthState(state, authSecret)
    if (!code || !statePayload || statePayload.provider !== 'google') {
      return res.redirect(302, `${home}/?auth=invalid_state`)
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
      }),
    })
    const tokenJson = (await tokenRes.json()) as {
      access_token?: string
      error?: string
      error_description?: string
    }
    if (!tokenRes.ok || !tokenJson.access_token) {
      console.error('[google/callback] token', tokenJson)
      return res.redirect(302, `${home}/?auth=token_failed`)
    }

    const meRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    })
    const me = (await meRes.json()) as {
      id?: string
      email?: string
      name?: string
      picture?: string
    }
    if (!meRes.ok || !me.id) {
      return res.redirect(302, `${home}/?auth=profile_failed`)
    }

    const user = await upsertGoogleUser({
      providerSub: me.id,
      email: me.email || `${me.id}@google.user`,
      name: me.name || me.email || 'Google User',
      picture: me.picture || null,
    })

    const sessionToken = createSessionToken({
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      provider: 'google',
      authSecret,
    })
    setSessionCookie(req, res, sessionToken)
    return sendSessionBridge(res, sessionToken, user)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/auth/google/callback]', message)
    return res.redirect(302, `${home}/?auth=error`)
  }
}
