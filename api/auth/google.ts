import type { VercelRequest, VercelResponse } from '@vercel/node'
import { assertGoogleConfigured, env } from '../env'
import { signOAuthState } from '../lib/crypto'

/**
 * GET /api/auth/google — start Google OAuth ("Continue with Google").
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  try {
    assertGoogleConfigured()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'google_not_configured'
    return res.status(503).send(
      `<!doctype html><html lang="he" dir="rtl"><body style="font-family:Heebo,system-ui;padding:2rem">
        <h1>Google OAuth לא מוגדר</h1>
        <p>${message}</p>
        <p>הגדירו <code>GOOGLE_CLIENT_ID</code> ו־<code>GOOGLE_CLIENT_SECRET</code> ב־<code>.env.local</code> / Vercel.</p>
        <p><a href="${env.appUrl}">חזרה ל־Distro V2</a></p>
      </body></html>`,
    )
  }

  const state = signOAuthState({
    provider: 'google',
    nonce: Math.random().toString(36).slice(2),
    ts: String(Date.now()),
  })

  const params = new URLSearchParams({
    client_id: env.googleClientId,
    redirect_uri: env.googleRedirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    access_type: 'online',
    include_granted_scopes: 'true',
    prompt: 'select_account',
    state,
  })

  const url = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`
  return res.redirect(302, url)
}
