import type { VercelRequest, VercelResponse } from '@vercel/node'
import { assertGoogleConfigured, env } from '../../env'
import { verifyOAuthState } from '../../lib/crypto'

type GoogleTokenResponse = {
  access_token?: string
  id_token?: string
  error?: string
  error_description?: string
}

type GoogleUserInfo = {
  id?: string
  email?: string
  verified_email?: boolean
  name?: string
  picture?: string
}

/**
 * GET /api/auth/google/callback — exchange code and complete "Continue with Google".
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const code = typeof req.query.code === 'string' ? req.query.code : ''
  const state = typeof req.query.state === 'string' ? req.query.state : ''
  const oauthError = typeof req.query.error === 'string' ? req.query.error : ''

  const redirectHome = (query = '') => {
    const target = `${env.appUrl.replace(/\/$/, '')}/${query}`
    return res.redirect(302, target)
  }

  if (oauthError) {
    return redirectHome('?google=error')
  }

  const statePayload = verifyOAuthState(state)
  if (!code || !statePayload || statePayload.provider !== 'google') {
    return redirectHome('?google=invalid_state')
  }

  try {
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
      return redirectHome('?google=token_exchange_failed')
    }

    const meRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
    })
    const meJson = (await meRes.json()) as GoogleUserInfo

    if (!meRes.ok || !meJson.id) {
      return redirectHome('?google=profile_failed')
    }

    // Session cookie / user persistence can be expanded later; surface identity in redirect for now.
    const label = encodeURIComponent(meJson.name || meJson.email || meJson.id)
    return redirectHome(`?google=connected&user=${label}`)
  } catch {
    return redirectHome('?google=error')
  }
}
