/**
 * GET /api/auth/me — validates cookie OR Authorization: Bearer <token>.
 * Never crashes with 500 for missing/invalid auth — returns authenticated:false.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSessionFromRequestOrBearer } from '../lib/session'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
    res.setHeader('Access-Control-Allow-Credentials', 'true')
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    if (req.method === 'OPTIONS') return res.status(204).end()
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' })

    const session = getSessionFromRequestOrBearer(req)
    if (!session) {
      return res.status(401).json({ authenticated: false })
    }

    let user = {
      id: session.sub,
      email: session.email,
      name: session.name,
      picture: session.picture,
      provider: session.provider,
    }

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
    // Never hard-crash the SPA boot — treat as unauthenticated.
    return res.status(401).json({ authenticated: false, error: message })
  }
}
