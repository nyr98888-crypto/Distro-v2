/**
 * GET /api/auth/me — current session user.
 * Trusts the signed httpOnly session cookie. DB lookup is optional enrichment only
 * (avoids stuck login when Turso upsert/lookup fails across serverless instances).
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSessionFromRequest } from '../lib/session'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' })

  try {
    const session = getSessionFromRequest(req)
    if (!session) {
      return res.status(401).json({ authenticated: false })
    }

    // Prefer session claims so post-Google-login always enters the app.
    let user = {
      id: session.sub,
      email: session.email,
      name: session.name,
      picture: session.picture,
      provider: session.provider,
    }

    // Optional Turso enrichment — never block auth on DB failure.
    try {
      const { getUserById } = await import('../db')
      const dbUser = await getUserById(session.sub)
      if (dbUser) {
        user = {
          id: dbUser.id,
          email: dbUser.email,
          name: dbUser.name,
          picture: dbUser.picture,
          provider: dbUser.provider,
        }
      }
    } catch (err) {
      console.warn('[api/auth/me] db enrich skipped', err)
    }

    return res.status(200).json({
      authenticated: true,
      user,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/auth/me]', message)
    return res.status(500).json({ authenticated: false, error: message })
  }
}
