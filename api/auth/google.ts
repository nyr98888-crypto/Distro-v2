import type { VercelRequest, VercelResponse } from '@vercel/node'
import { assertGoogleConfigured, env } from '../env'
import { signOAuthState } from '../lib/crypto'

/**
 * GET /api/auth/google — start Google OAuth ("Continue with Google").
 * Always returns JSON `{ error }` on failure so the login card can show the message.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ error: 'method_not_allowed' })
    }

    assertGoogleConfigured()

    const state = signOAuthState({
      provider: 'google',
      nonce: Math.random().toString(36).slice(2),
      ts: String(Date.now()),
    })

    const clientId = env.googleClientId
    const redirectUri = env.googleRedirectUri
    if (!clientId || !redirectUri) {
      return res.status(400).json({
        error:
          'GOOGLE_CLIENT_ID or GOOGLE_REDIRECT_URI/APP_URL is missing after env parse. Check Vercel env vars.',
      })
    }

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

    const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
    return res.redirect(302, url)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/auth/google]', message)
    const status =
      /must be set|must be a random|missing/i.test(message) ? 400 : 500
    return res.status(status).json({ error: message })
  }
}
