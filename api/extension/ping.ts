import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isValidExtensionSyncSecret } from '../env'
import { recordExtensionPing } from '../db'
import { getSessionFromRequestOrBearer } from '../lib/session'

/** POST /api/extension/ping — extension heartbeat (Bearer session token). */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, x-extension-sync-secret',
  )
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  if (!isValidExtensionSyncSecret(req)) {
    return res.status(401).json({ error: 'invalid_extension_sync_secret' })
  }

  const session = getSessionFromRequestOrBearer(req)
  if (!session) return res.status(401).json({ error: 'unauthorized' })

  const body = (req.body ?? {}) as { extensionId?: string }
  const result = await recordExtensionPing(body.extensionId)

  return res.status(200).json({
    ok: true,
    extensionConnected: true,
    lastExtensionPing: result.lastExtensionPing,
    userId: session.sub,
  })
}
