/**
 * POST /api/sync-groups — exact v1.0.9 contract.
 *
 * Extension popup.js:
 *   POST `${apiUrl}/api/sync-groups`
 *   Headers: Content-Type: application/json, Authorization: Bearer <sessionToken>
 *   Body: { extensionId, groups: [{ name, fbGroupId, url, memberCount, avatarUrl }] }
 *   Expects: { count } on success
 */
import {
  parseJsonBody,
  requireSession,
  setCors,
  type ApiReq,
  type ApiRes,
} from './lib/auth'
import { getTurso, listGroupsForUser, upsertGroupsForUser } from './lib/turso'

function extractGroups(body: Record<string, unknown>) {
  const raw =
    (Array.isArray(body.groups) && body.groups) ||
    (Array.isArray(body.items) && body.items) ||
    (Array.isArray(body.list) && body.list) ||
    []

  const out: Array<{
    name: string
    fbGroupId: string
    url?: string
    memberCount?: number
    avatarUrl?: string | null
  }> = []
  const seen = new Set<string>()

  for (const item of raw) {
    const g = (item || {}) as Record<string, unknown>
    const fbGroupId = String(
      g.fbGroupId || g.fb_group_id || g.id || g.groupId || '',
    ).trim()
    if (!fbGroupId || seen.has(fbGroupId)) continue
    seen.add(fbGroupId)
    out.push({
      name: String(g.name || fbGroupId).trim() || fbGroupId,
      fbGroupId,
      url: g.url ? String(g.url) : `https://www.facebook.com/groups/${fbGroupId}`,
      memberCount: Number(g.memberCount ?? g.member_count ?? 0),
      avatarUrl: (g.avatarUrl ?? g.avatar_url ?? null) as string | null,
    })
  }
  return out
}

export default async function handler(req: ApiReq, res: ApiRes) {
  try {
    setCors(req, res, 'POST, OPTIONS')
    if (req.method === 'OPTIONS') return res.status(204).json({})
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

    const session = requireSession(req, res)
    if (!session) return

    const body = parseJsonBody(req)
    const groups = extractGroups(body)
    if (groups.length === 0) {
      return res.status(400).json({ error: 'groups_required' })
    }

    const syncedAt = String(body.syncedAt || new Date().toISOString())
    const client = getTurso()
    if (!client) {
      return res.status(500).json({
        error: 'TURSO_DATABASE_URL / TURSO_AUTH_TOKEN missing on Vercel',
      })
    }

    const saved = await upsertGroupsForUser(client, session.sub, groups, syncedAt)
    if (typeof body.extensionId === 'string' && body.extensionId) {
      const { setUserSetting } = await import('./lib/turso')
      await setUserSetting(client, session.sub, 'extension_id', body.extensionId)
    }

    const all = await listGroupsForUser(client, session.sub)

    // v1.0.9 reads body.count
    return res.status(200).json({
      ok: true,
      success: true,
      count: saved.length,
      syncedCount: saved.length,
      lastSyncAt: syncedAt,
      groups: all.map((g) => ({
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
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/sync-groups]', message)
    return res.status(500).json({ error: message })
  }
}
