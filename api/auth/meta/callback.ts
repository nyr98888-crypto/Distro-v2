import type { VercelRequest, VercelResponse } from '@vercel/node'
import { assertMetaConfigured, env } from '../../env'
import { verifyOAuthState } from '../../lib/crypto'
import { saveMetaTokens } from '../../db'

/**
 * GET /api/auth/meta/callback — exchange code for token (PC / Android / iOS).
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
    return redirectHome('?meta=error')
  }

  if (!code || !verifyOAuthState(state)) {
    return redirectHome('?meta=invalid_state')
  }

  try {
    assertMetaConfigured()

    const tokenUrl = new URL(`https://graph.facebook.com/${env.metaGraphVersion}/oauth/access_token`)
    tokenUrl.searchParams.set('client_id', env.metaAppId)
    tokenUrl.searchParams.set('client_secret', env.metaAppSecret)
    tokenUrl.searchParams.set('redirect_uri', env.metaRedirectUri)
    tokenUrl.searchParams.set('code', code)

    const tokenRes = await fetch(tokenUrl)
    const tokenJson = (await tokenRes.json()) as {
      access_token?: string
      error?: { message?: string }
    }

    if (!tokenRes.ok || !tokenJson.access_token) {
      return redirectHome('?meta=token_exchange_failed')
    }

    const meUrl = new URL(`https://graph.facebook.com/${env.metaGraphVersion}/me`)
    meUrl.searchParams.set('fields', 'id,name')
    meUrl.searchParams.set('access_token', tokenJson.access_token)
    const meRes = await fetch(meUrl)
    const meJson = (await meRes.json()) as { id?: string; name?: string }

    await saveMetaTokens({
      accessToken: tokenJson.access_token,
      accountLabel: meJson.name || meJson.id || 'Meta account',
    })

    return redirectHome('?meta=connected')
  } catch {
    return redirectHome('?meta=error')
  }
}
