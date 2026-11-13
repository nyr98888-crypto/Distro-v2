import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { ExtensionSyncPayload } from '../shared/types'
import { env, isValidExtensionSyncSecret } from './env'
import { syncGroupsFromExtension, recordExtensionPing } from './db'
import { getSessionFromRequestOrBearer } from './lib/session'

function header(req: VercelRequest, name: string): string {
  const value = req.headers[name]
  return Array.isArray(value) ? value[0] ?? '' : value ?? ''
}

/** POST /api/sync-groups — authenticated via session cookie or Bearer token (no pairing code). */
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
  if (!session) {
    return res.status(401).json({ error: 'unauthorized' })
  }

  const body = (req.body ?? {}) as ExtensionSyncPayload
  if (!Array.isArray(body.groups)) {
    return res.status(400).json({ error: 'groups_required' })
  }

  const result = await syncGroupsFromExtension({
    extensionId: body.extensionId || header(req, 'x-extension-id'),
    groups: body.groups.map((g) => ({
      name: g.name,
      fbGroupId: g.fbGroupId,
      url: g.url,
      memberCount: g.memberCount,
      avatarUrl: g.avatarUrl ?? null,
    })),
    syncedAt: body.syncedAt || new Date().toISOString(),
  })
  await recordExtensionPing(body.extensionId)

  return res.status(200).json({
    ok: true,
    success: true,
    count: result.count,
    syncedCount: result.count,
    appUrl: env.appUrl,
    userId: session.sub,
  })
}
