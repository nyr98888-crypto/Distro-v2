import type { VercelRequest, VercelResponse } from '@vercel/node'
import { assertMetaConfigured, env } from '../env'
import { signOAuthState } from '../lib/crypto'

/**
 * GET /api/auth/meta — start Meta OAuth (works on PC, Android, iOS Safari).
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
      `<!doctype html><html><body style="font-family:system-ui;padding:2rem">
        <h1>Meta OAuth not configured</h1>
        <p>${message}</p>
        <p>Set <code>META_APP_ID</code> and <code>META_APP_SECRET</code> in <code>.env.local</code> / Vercel.</p>
        <p><a href="${env.appUrl}">Back to Distro V2</a></p>
      </body></html>`,
    )
  }

  const state = signOAuthState({
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
