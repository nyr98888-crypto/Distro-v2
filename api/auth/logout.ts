import type { VercelRequest, VercelResponse } from '@vercel/node'
import { clearSessionOnResponse } from '../lib/session'
import { env } from '../env'

/** POST/GET /api/auth/logout */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (req.method === 'OPTIONS') return res.status(204).end()

  clearSessionOnResponse(res, req)

  if (req.method === 'GET') {
    return res.redirect(302, `${env.appUrl.replace(/\/$/, '')}/`)
  }
  return res.status(200).json({ ok: true })
}
