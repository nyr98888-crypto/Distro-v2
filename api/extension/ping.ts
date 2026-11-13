import type { VercelRequest, VercelResponse } from '@vercel/node'
import { isValidExtensionSyncSecret } from '../env'
import { recordExtensionPing, verifyPairingCode } from '../db'

function header(req: VercelRequest, name: string): string {
  const value = req.headers[name]
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, x-pairing-code, x-extension-sync-secret',
  )
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')

  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

  if (!isValidExtensionSyncSecret(req)) {
    return res.status(401).json({ error: 'invalid_extension_sync_secret' })
  }

  const pairingCode = header(req, 'x-pairing-code')
  if (!pairingCode || !(await verifyPairingCode(pairingCode))) {
    return res.status(401).json({ error: 'invalid_pairing_code' })
  }

  const body = (req.body ?? {}) as { extensionId?: string }
  const result = await recordExtensionPing(body.extensionId)

  return res.status(200).json({
    ok: true,
    extensionConnected: true,
    lastExtensionPing: result.lastExtensionPing,
  })
}
