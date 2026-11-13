import type { VercelRequest, VercelResponse } from '@vercel/node'
import { assertMetaConfigured, env } from '../../env'
import { verifyOAuthState } from '../../lib/crypto'
import { createSessionToken, setSessionCookie } from '../../lib/session'
import { saveMetaTokens, upsertUserFromOAuth } from '../../db'

/** GET /api/auth/meta/callback — Facebook login + optional Meta posting token. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'method_not_allowed' })
  }

  const code = typeof req.query.code === 'string' ? req.query.code : ''
  const state = typeof req.query.state === 'string' ? req.query.state : ''
  const oauthError = typeof req.query.error === 'string' ? req.query.error : ''
  const home = env.appUrl.replace(/\/$/, '')

  if (oauthError) return res.redirect(302, `${home}/?auth=error`)

  const statePayload = verifyOAuthState(state)
  if (!code || !statePayload || statePayload.provider !== 'facebook') {
    return res.redirect(302, `${home}/?auth=invalid_state`)
  }

  try {
    assertMetaConfigured()

    const tokenUrl = new URL(`https://graph.facebook.com/${env.metaGraphVersion}/oauth/access_token`)
    tokenUrl.searchParams.set('client_id', env.metaAppId)
    tokenUrl.searchParams.set('client_secret', env.metaAppSecret)
    tokenUrl.searchParams.set('redirect_uri', env.metaRedirectUri)
    tokenUrl.searchParams.set('code', code)

    const tokenRes = await fetch(tokenUrl)
    const tokenJson = (await tokenRes.json()) as { access_token?: string }
    if (!tokenRes.ok || !tokenJson.access_token) {
      return res.redirect(302, `${home}/?auth=token_failed`)
    }

    const meUrl = new URL(`https://graph.facebook.com/${env.metaGraphVersion}/me`)
    meUrl.searchParams.set('fields', 'id,name,email,picture.type(large)')
    meUrl.searchParams.set('access_token', tokenJson.access_token)
    const meRes = await fetch(meUrl)
    const me = (await meRes.json()) as {
      id?: string
      name?: string
      email?: string
      picture?: { data?: { url?: string } }
    }

    if (!me.id) return res.redirect(302, `${home}/?auth=profile_failed`)

    const user = await upsertUserFromOAuth({
      provider: 'facebook',
      providerSub: me.id,
      email: me.email || `${me.id}@facebook.user`,
      name: me.name || me.email || 'Facebook User',
      picture: me.picture?.data?.url || null,
    })

    await saveMetaTokens({
      accessToken: tokenJson.access_token,
      accountLabel: user.name,
    })

    const sessionToken = createSessionToken({
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      provider: 'facebook',
    })
    setSessionCookie(res, req, sessionToken)
    return res.redirect(302, `${home}/?auth=connected`)
  } catch {
    return res.redirect(302, `${home}/?auth=error`)
  }
}
