/**
 * POST /api/extension/ping — v1.0.9 heartbeat after DISTRO_AUTH_SYNC.
 * Body: { extensionId }
 * Auth: Bearer session token
 */
import {
  parseJsonBody,
  requireSession,
  setCors,
  type ApiReq,
  type ApiRes,
} from '../lib/auth.js'
import { ensureSchema, getTurso, setUserSetting } from '../lib/turso.js'

export default async function handler(req: ApiReq, res: ApiRes) {
  try {
    setCors(req, res, 'POST, OPTIONS')
    if (req.method === 'OPTIONS') return res.status(204).json({})
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

    const session = requireSession(req, res)
    if (!session) return

    const body = parseJsonBody(req)
    const extensionId = body.extensionId ? String(body.extensionId) : ''
    const now = new Date().toISOString()

    const client = getTurso()
    if (client) {
      await ensureSchema(client)
      if (extensionId) await setUserSetting(client, session.sub, 'extension_id', extensionId)
      await setUserSetting(client, session.sub, 'last_extension_ping', now)
    }

    return res.status(200).json({
      ok: true,
      extensionConnected: true,
      lastExtensionPing: now,
      userId: session.sub,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/extension/ping]', message)
    return res.status(200).json({ ok: true, extensionConnected: true, warning: message })
  }
}
