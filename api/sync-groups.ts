/**
 * POST /api/sync-groups — exact v1.0.9 contract (popup.js).
 *
 * POST `${apiUrl}/api/sync-groups`
 * Headers: Content-Type: application/json, Authorization: Bearer <sessionToken>
 * Body: { extensionId, groups: [{ name, fbGroupId, url, memberCount, avatarUrl }] }
 * Success: { ok: true, count, groups }
 */
import {
  parseJsonBody,
  requireSession,
  setCors,
  type ApiReq,
  type ApiRes,
} from './lib/auth'
import {
  ensureSchema,
  getTurso,
  listGroupsForUser,
  upsertGroupsForUser,
  upsertUser,
} from './lib/turso'

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
    if (['joins', 'feed', 'create', 'discover'].includes(fbGroupId.toLowerCase())) continue
    seen.add(fbGroupId)

    const name = String(g.name || g.title || fbGroupId).trim() || fbGroupId
    const url = String(
      g.url || g.link || g.href || `https://www.facebook.com/groups/${fbGroupId}`,
    )

    out.push({
      name,
      fbGroupId,
      url,
      memberCount: Number(g.memberCount ?? g.member_count ?? 0) || 0,
      avatarUrl: (g.avatarUrl ?? g.avatar_url ?? null) as string | null,
    })
  }
  return out
}

export default async function handler(req: ApiReq, res: ApiRes) {
  try {
    setCors(req, res, 'POST, OPTIONS')
    if (req.method === 'OPTIONS') return res.status(204).json({})
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed', ok: false })

    const session = requireSession(req, res)
    if (!session) return

    const body = parseJsonBody(req)
    const groups = extractGroups(body)
    if (groups.length === 0) {
      return res.status(400).json({ ok: false, error: 'groups_required', count: 0, groups: [] })
    }

    const syncedAt = String(body.syncedAt || new Date().toISOString())
    const client = getTurso()
    if (!client) {
      return res.status(500).json({
        ok: false,
        error: 'TURSO_DATABASE_URL / TURSO_AUTH_TOKEN missing on Vercel',
        count: 0,
        groups: [],
      })
    }

    await ensureSchema(client)
    await upsertUser(client, {
      id: session.sub,
      email: session.email,
      name: session.name,
      picture: session.picture,
      provider: session.provider,
    })

    const saved = await upsertGroupsForUser(client, session.sub, groups, syncedAt)

    if (typeof body.extensionId === 'string' && body.extensionId) {
      const { setUserSetting } = await import('./lib/turso')
      await setUserSetting(client, session.sub, 'extension_id', body.extensionId)
    }

    const all = await listGroupsForUser(client, session.sub)
    const mapped = all.map((g) => ({
      id: g.id,
      fbGroupId: g.fbGroupId,
      name: g.name,
      url: g.url,
      memberCount: g.memberCount,
      avatarUrl: g.avatarUrl,
      active: g.active,
      collectionIds: [] as string[],
      syncedAt: g.syncedAt,
    }))

    return res.status(200).json({
      ok: true,
      success: true,
      count: saved.length,
      syncedCount: saved.length,
      lastSyncAt: syncedAt,
      groups: mapped,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/sync-groups]', message)
    return res.status(200).json({
      ok: false,
      error: message,
      count: 0,
      groups: [],
    })
  }
}
