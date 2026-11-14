import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getSyncStatus } from './db.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' })

  const status = await getSyncStatus()
  return res.status(200).json(status)
}
