import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSessionFromRequest } from '../lib/session'
import { getUserById } from '../db'

/** GET /api/auth/me — current session user. */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' })

  const session = getSessionFromRequest(req)
  if (!session) return res.status(401).json({ authenticated: false })

  const user = await getUserById(session.sub)
  if (!user) return res.status(401).json({ authenticated: false })

  return res.status(200).json({
    authenticated: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      provider: user.provider,
    },
  })
}
