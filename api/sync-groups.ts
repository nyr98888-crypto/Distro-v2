/**
 * POST /api/sync-groups — extension v1.0.9 + web paste import.
 * Auth: Bearer session token or distro_session cookie.
 * Storage: @libsql/client/web (never native @libsql/client).
 */
import { createClient } from '@libsql/client/web'
import { createHmac, timingSafeEqual } from 'node:crypto'

type Req = {
  method?: string
  headers: Record<string, string | string[] | undefined>
  body?: unknown
}

type Res = {
  status: (code: number) => Res
  json: (body: unknown) => unknown
  setHeader: (name: string, value: string) => void
}

type IncomingGroup = {
  name?: string
  fbGroupId?: string
  url?: string
  memberCount?: number
  avatarUrl?: string | null
}

type GroupRow = {
  id: string
  fbGroupId: string
  name: string
  url: string
  memberCount: number
  avatarUrl: string | null
  active: boolean
  collectionIds: string[]
  syncedAt: string | null
}

const SESSION_COOKIE = 'distro_session'

function readEnv(key: string, fallback = ''): string {
  const value = process.env[key]
  if (typeof value !== 'string') return fallback
  return value.trim().replace(/^["']+|["']+$/g, '')
}

function readCookie(req: Req, name: string): string | null {
  const raw = req.headers.cookie
  if (!raw || typeof raw !== 'string') return null
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=')
    if (k === name) {
      try {
        return decodeURIComponent(rest.join('='))
      } catch {
        return rest.join('=')
      }
    }
  }
  return null
}

function verifySession(req: Req, authSecret: string): boolean {
  try {
    const candidates: string[] = []
    const cookie = readCookie(req, SESSION_COOKIE)
    if (cookie) candidates.push(cookie)
    const auth = req.headers.authorization
    const value = Array.isArray(auth) ? auth[0] : auth
    if (value?.startsWith('Bearer ')) candidates.push(value.slice(7).trim())

    for (const token of candidates) {
      const [body, sig] = token.split('.')
      if (!body || !sig) continue
      const expected = createHmac('sha256', authSecret).update(body).digest('base64url')
      const a = Buffer.from(sig)
      const b = Buffer.from(expected)
      if (a.length !== b.length || !timingSafeEqual(a, b)) continue
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as {
        exp?: number
        sub?: string
      }
      if (payload.sub && payload.exp && payload.exp >= Math.floor(Date.now() / 1000)) {
        return true
      }
    }
    return false
  } catch {
    return false
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __distroGroupsMemory: Map<string, GroupRow> | undefined
}

function memory(): Map<string, GroupRow> {
  if (!globalThis.__distroGroupsMemory) {
    globalThis.__distroGroupsMemory = new Map()
  }
  return globalThis.__distroGroupsMemory
}

function uid(): string {
  return `g_${Math.random().toString(36).slice(2, 10)}`
}

function normalizeGroups(raw: IncomingGroup[]): IncomingGroup[] {
  const out: IncomingGroup[] = []
  const seen = new Set<string>()
  for (const g of raw) {
    const fbGroupId = String(g.fbGroupId || '').trim()
    if (!fbGroupId || seen.has(fbGroupId)) continue
    seen.add(fbGroupId)
    out.push({
      name: String(g.name || fbGroupId).trim() || fbGroupId,
      fbGroupId,
      url: g.url || `https://www.facebook.com/groups/${fbGroupId}`,
      memberCount: Number(g.memberCount ?? 0),
      avatarUrl: g.avatarUrl ?? null,
    })
  }
  return out
}

async function upsertTurso(groups: IncomingGroup[], syncedAt: string): Promise<number> {
  const url = readEnv('TURSO_DATABASE_URL')
  const authToken = readEnv('TURSO_AUTH_TOKEN')
  if (!url || !authToken) return -1

  const client = createClient({ url, authToken })
  await client.execute(`
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      fb_group_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      url TEXT NOT NULL DEFAULT '',
      member_count INTEGER NOT NULL DEFAULT 0,
      avatar_url TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      synced_at TEXT
    )
  `)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)

  for (const g of groups) {
    const existing = await client.execute({
      sql: 'SELECT id FROM groups WHERE fb_group_id = ?',
      args: [g.fbGroupId!],
    })
    const groupId = existing.rows[0] ? String(existing.rows[0].id) : uid()
    await client.execute({
      sql: `INSERT INTO groups (id, fb_group_id, name, url, member_count, avatar_url, active, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?)
            ON CONFLICT(fb_group_id) DO UPDATE SET
              name = excluded.name,
              url = excluded.url,
              member_count = excluded.member_count,
              avatar_url = excluded.avatar_url,
              synced_at = excluded.synced_at`,
      args: [
        groupId,
        g.fbGroupId!,
        g.name!,
        g.url!,
        g.memberCount ?? 0,
        g.avatarUrl ?? null,
        syncedAt,
      ],
    })
  }

  await client.execute({
    sql: `INSERT INTO settings (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: ['last_group_sync_at', syncedAt],
  })

  return groups.length
}

function upsertMemory(groups: IncomingGroup[], syncedAt: string): number {
  const store = memory()
  for (const g of groups) {
    const existing = Array.from(store.values()).find((x) => x.fbGroupId === g.fbGroupId)
    const groupId = existing?.id ?? uid()
    store.set(groupId, {
      id: groupId,
      fbGroupId: g.fbGroupId!,
      name: g.name!,
      url: g.url!,
      memberCount: g.memberCount ?? 0,
      avatarUrl: g.avatarUrl ?? null,
      active: existing?.active ?? true,
      collectionIds: existing?.collectionIds ?? [],
      syncedAt,
    })
  }
  return groups.length
}

export default async function handler(req: Req, res: Res) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, x-extension-sync-secret, x-extension-id',
    )
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Cache-Control', 'no-store')

    if (req.method === 'OPTIONS') return res.status(204).json({})
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

    const authSecret = readEnv('AUTH_SECRET')
    if (!authSecret || authSecret.length < 32) {
      return res.status(401).json({ error: 'AUTH_SECRET missing on Vercel' })
    }
    if (!verifySession(req, authSecret)) {
      return res.status(401).json({ error: 'unauthorized' })
    }

    const body = (req.body ?? {}) as {
      groups?: IncomingGroup[]
      extensionId?: string
      syncedAt?: string
    }
    if (!Array.isArray(body.groups)) {
      return res.status(400).json({ error: 'groups_required' })
    }

    const groups = normalizeGroups(body.groups)
    const syncedAt = body.syncedAt || new Date().toISOString()

    let count = 0
    try {
      const tursoCount = await upsertTurso(groups, syncedAt)
      count = tursoCount >= 0 ? tursoCount : upsertMemory(groups, syncedAt)
      if (tursoCount < 0) {
        // also mirror into memory for same-instance GET
        upsertMemory(groups, syncedAt)
      } else {
        upsertMemory(groups, syncedAt)
      }
    } catch (err) {
      console.warn('[api/sync-groups] turso failed, memory fallback', err)
      count = upsertMemory(groups, syncedAt)
    }

    return res.status(200).json({
      ok: true,
      success: true,
      count,
      syncedCount: count,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/sync-groups]', message)
    return res.status(500).json({ error: message })
  }
}
