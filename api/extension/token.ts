/**
 * GET /api/extension/token
 * Returns a signed extension auth token for the logged-in web session.
 * Uses session cookie claims directly so handshake works even if Turso lookup fails.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createSessionToken, getSessionFromRequestOrBearer } from '../lib/session'
import { env } from '../env'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' })

  try {
    const session = getSessionFromRequestOrBearer(req)
    if (!session) return res.status(401).json({ error: 'unauthorized' })

    let user = {
      id: session.sub,
      email: session.email,
      name: session.name,
      picture: session.picture,
      provider: session.provider,
    }

    try {
      const db = await import('../db')
      const dbUser = await db.getUserById(session.sub)
      if (dbUser) {
        user = {
          id: dbUser.id,
          email: dbUser.email,
          name: dbUser.name,
          picture: dbUser.picture,
          provider: dbUser.provider,
        }
      }
      await db.recordExtensionPing().catch(() => undefined)
    } catch (err) {
      console.warn('[api/extension/token] db enrich skipped', err)
    }

    const token = createSessionToken({
      id: user.id,
      email: user.email,
      name: user.name,
      picture: user.picture,
      provider: user.provider,
    })

    const apiUrl =
      (typeof req.headers['x-forwarded-host'] === 'string'
        ? `${req.headers['x-forwarded-proto'] === 'http' ? 'http' : 'https'}://${req.headers['x-forwarded-host']}`
        : env.appUrl
      ).replace(/\/$/, '')

    return res.status(200).json({
      token,
      apiUrl,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        picture: user.picture,
        provider: user.provider,
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/extension/token]', message)
    return res.status(500).json({ error: message })
  }
}
