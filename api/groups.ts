/**
 * GET /api/groups — list synced groups for the authenticated user.
 */
import { requireSession, setCors, type ApiReq, type ApiRes } from './lib/auth'
import { ensureSchema, getTurso, getUserSetting, listGroupsForUser } from './lib/turso'

export default async function handler(req: ApiReq, res: ApiRes) {
  try {
    setCors(req, res, 'GET, OPTIONS')
    if (req.method === 'OPTIONS') return res.status(204).json({})
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' })

    const session = requireSession(req, res)
    if (!session) return

    const client = getTurso()
    if (!client) {
      return res.status(200).json({
        ok: true,
        groups: [],
        count: 0,
        lastSyncAt: null,
        error: 'turso_not_configured',
      })
    }

    await ensureSchema(client)
    const groups = await listGroupsForUser(client, session.sub)
    const lastSyncAt =
      (await getUserSetting(client, session.sub, 'last_group_sync_at')) ||
      groups.find((g) => g.syncedAt)?.syncedAt ||
      null

    return res.status(200).json({
      ok: true,
      groups: groups.map((g) => ({
        id: g.id,
        fbGroupId: g.fbGroupId,
        name: g.name,
        url: g.url,
        memberCount: g.memberCount,
        avatarUrl: g.avatarUrl,
        active: g.active,
        collectionIds: [],
        syncedAt: g.syncedAt,
      })),
      count: groups.length,
      lastSyncAt,
      lastGroupSyncAt: lastSyncAt,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/groups]', message)
    return res.status(200).json({
      ok: false,
      groups: [],
      count: 0,
      lastSyncAt: null,
      error: message,
    })
  }
}
