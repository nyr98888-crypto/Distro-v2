import type { FacebookGroup } from '@shared/types'

/** Parse Facebook group URLs / joins-page text into unique groups. */
export function parseFacebookGroupsFromText(text: string): FacebookGroup[] {
  const raw = text || ''
  const found = new Map<string, FacebookGroup>()

  const urlRe =
    /(?:https?:\/\/)?(?:www\.)?facebook\.com\/groups\/([a-zA-Z0-9._-]+)(?:\/[^\s"'<>]*)?/gi
  let match: RegExpExecArray | null
  while ((match = urlRe.exec(raw)) !== null) {
    const fbGroupId = match[1]
    if (!fbGroupId || fbGroupId === 'joins' || fbGroupId === 'feed' || fbGroupId === 'create') {
      continue
    }
    if (found.has(fbGroupId)) continue
    const url = `https://www.facebook.com/groups/${fbGroupId}`
    found.set(fbGroupId, {
      id: `g_${fbGroupId}`,
      fbGroupId,
      name: fbGroupId,
      url,
      memberCount: 0,
      avatarUrl: null,
      active: true,
      collectionIds: [],
      syncedAt: new Date().toISOString(),
    })
  }

  // Try to pair nearby Hebrew/English titles before a group URL on the same line.
  const lines = raw.split(/\r?\n/)
  for (const line of lines) {
    const m = line.match(
      /(.+?)\s+(?:https?:\/\/)?(?:www\.)?facebook\.com\/groups\/([a-zA-Z0-9._-]+)/i,
    )
    if (!m) continue
    const name = m[1].replace(/^[\s\-•*|]+|[\s\-•*|]+$/g, '').trim()
    const fbGroupId = m[2]
    if (!name || !fbGroupId || !found.has(fbGroupId)) continue
    if (name.length < 2 || /^https?:/i.test(name)) continue
    const existing = found.get(fbGroupId)!
    found.set(fbGroupId, { ...existing, name })
  }

  return Array.from(found.values())
}

export function mergeGroups(
  existing: FacebookGroup[],
  incoming: FacebookGroup[],
): FacebookGroup[] {
  const byFb = new Map(existing.map((g) => [g.fbGroupId, g]))
  for (const g of incoming) {
    const prev = byFb.get(g.fbGroupId)
    if (prev) {
      byFb.set(g.fbGroupId, {
        ...prev,
        name: g.name && g.name !== g.fbGroupId ? g.name : prev.name,
        url: g.url || prev.url,
        syncedAt: g.syncedAt || prev.syncedAt,
        active: prev.active,
      })
    } else {
      byFb.set(g.fbGroupId, g)
    }
  }
  return Array.from(byFb.values()).sort((a, b) => a.name.localeCompare(b.name, 'he'))
}
