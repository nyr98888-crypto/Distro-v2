import type { VercelRequest, VercelResponse } from '@vercel/node'
import { listGroups } from './db'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' })

  const groups = await listGroups()
  return res.status(200).json({ groups, count: groups.length })
}
