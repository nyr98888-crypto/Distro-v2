import type { VercelRequest, VercelResponse } from '@vercel/node'
import { assertGoogleConfigured, env } from '../../env'
import { verifyOAuthState } from '../../lib/crypto'
import { createSessionToken, setSessionCookie } from '../../lib/session'
import { upsertUserFromOAuth } from '../../db'

type GoogleTokenResponse = {
  access_token?: string
  error?: string
  error_description?: string
}

type GoogleUserInfo = {
  id?: string
  email?: string
  name?: string
  picture?: string
}

function homeOrigin(): string {
  return env.appUrl.replace(/\/$/, '')
}

function wantsJson(req: VercelRequest): boolean {
  const accept = req.headers.accept
  const value = Array.isArray(accept) ? accept[0] : accept
  return Boolean(value && value.includes('application/json'))
}

function fail(
  req: VercelRequest,
  res: VercelResponse,
  status: number,
  message: string,
  authCode?: string,
) {
  console.error('[api/auth/google/callback]', message)
  if (wantsJson(req)) {
    return res.status(status).json({ error: message })
  }
  const code = authCode || 'error'
  return res.redirect(302, `${homeOrigin()}/?auth=${encodeURIComponent(code)}`)
}

/** GET /api/auth/google/callback */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'method_not_allowed' })
    }

    const home = homeOrigin()
    const code = typeof req.query.code === 'string' ? req.query.code : ''
    const state = typeof req.query.state === 'string' ? req.query.state : ''
    const oauthError = typeof req.query.error === 'string' ? req.query.error : ''

    if (oauthError) {
      return fail(req, res, 400, `Google OAuth error: ${oauthError}`, 'error')
    }

    const statePayload = verifyOAuthState(state)
    if (!code || !statePayload || statePayload.provider !== 'google') {
      return fail(req, res, 400, 'Invalid or expired OAuth state.', 'invalid_state')
    }

    assertGoogleConfigured()

    const body = new URLSearchParams({
      code,
      client_id: env.googleClientId,
      client_secret: env.googleClientSecret,
      redirect_uri: env.googleRedirectUri,
      grant_type: 'authorization_code',
    })

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    const tokenJson = (await tokenRes.json()) as GoogleTokenResponse
    if (!tokenRes.ok || !tokenJson.access_token) {
      const detail =
        tokenJson.error_description || tokenJson.error || `HTTP ${tokenRes.status}`
      return fail(req, res, 400, `Google token exchange failed: ${detail}`, 'token_failed')
    }

    const meRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    })
    const me = (await meRes.json()) as GoogleUserInfo
    if (!meRes.ok || !me.id) {
      return fail(req, res, 400, 'Failed to load Google user profile.', 'profile_failed')
    }

    const user = await upsertUserFromOAuth({
      provider: 'google',
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
    })
    setSessionCookie(res, req, sessionToken)
    return res.redirect(302, `${home}/?auth=connected`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return fail(req, res, 500, message, 'error')
  }
}
