import type { VercelRequest, VercelResponse } from '@vercel/node'
import { assertMetaConfigured, env } from '../env'
import { signOAuthState } from '../lib/crypto'

/**
 * GET /api/auth/meta — Facebook Sign-In (user login) + Meta connection.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  try {
    assertMetaConfigured()
  } catch (error) {
    const message = error instanceof Error ? error.message : 'meta_not_configured'
    return res.status(503).send(
      `<!doctype html><html lang="he" dir="rtl"><body style="font-family:Heebo,system-ui;padding:2rem">
        <h1>Facebook OAuth לא מוגדר</h1>
        <p>${message}</p>
        <p><a href="${env.appUrl}">חזרה ל־Distro V2</a></p>
      </body></html>`,
    )
  }

  const state = signOAuthState({
    provider: 'facebook',
    nonce: Math.random().toString(36).slice(2),
    ts: String(Date.now()),
  })

  const params = new URLSearchParams({
    client_id: env.metaAppId,
    redirect_uri: env.metaRedirectUri,
    state,
    response_type: 'code',
    scope: 'public_profile,email',
  })

  if (env.metaConfigId) {
    params.set('config_id', env.metaConfigId)
  }

  const url = `https://www.facebook.com/${env.metaGraphVersion}/dialog/oauth?${params.toString()}`
  return res.redirect(302, url)
}
