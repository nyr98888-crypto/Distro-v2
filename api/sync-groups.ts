/**
 * POST /api/sync-groups (+ /api/groups/sync) — exact v1.0.9 contract.
 * Self-contained: no relative imports (avoids Vercel ESM 500).
 * Auth: Authorization: Bearer <sessionToken>
 * Body: { extensionId, groups: [{ name, fbGroupId, url, memberCount, avatarUrl }] }
 */
import { createClient, type Client } from '@libsql/client/web'
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

const SESSION_COOKIE = 'distro_session'

function readEnv(key: string, fallback = ''): string {
  const value = process.env[key]
  if (typeof value !== 'string') return fallback
  return value.trim().replace(/^["']|["']$/g, '').trim()
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

type SessionPayload = {
  sub: string
  email: string
  name: string
  picture: string | null
  provider: string
  exp: number
}

function verifySessionToken(token: string, authSecret: string): SessionPayload | null {
  try {
    const [body, sig] = token.split('.')
    if (!body || !sig) return null
    const expected = createHmac('sha256', authSecret).update(body).digest('base64url')
    const a = Buffer.from(sig)
    const b = Buffer.from(expected)
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload
    if (!payload.sub || !payload.email || !payload.exp) return null
    if (payload.exp < Math.floor(Date.now() / 1000)) return null
    return payload
  } catch {
    return null
  }
}

function getSession(req: Req): SessionPayload | null {
  const authSecret = readEnv('AUTH_SECRET')
  if (!authSecret || authSecret.length < 32) return null
  const fromCookie = readCookie(req, SESSION_COOKIE)
  if (fromCookie) {
    const s = verifySessionToken(fromCookie, authSecret)
    if (s) return s
  }
  const auth = req.headers.authorization
  const value = Array.isArray(auth) ? auth[0] : auth
  if (value?.startsWith('Bearer ')) {
    return verifySessionToken(value.slice(7).trim(), authSecret)
  }
  return null
}

function setCors(req: Req, res: Res): void {
  const origin = req.headers.origin
  const originVal = Array.isArray(origin) ? origin[0] : origin
  res.setHeader('Access-Control-Allow-Origin', originVal || '*')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, x-extension-sync-secret, x-extension-id',
  )
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Cache-Control', 'no-store')
}

function parseJsonBody(req: Req): Record<string, unknown> {
  const raw = req.body
  if (raw == null) return {}
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw || '{}') as Record<string, unknown>
    } catch {
      return {}
    }
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(raw)) {
    try {
      return JSON.parse(raw.toString('utf8') || '{}') as Record<string, unknown>
    } catch {
      return {}
    }
  }
  if (typeof raw === 'object') return raw as Record<string, unknown>
  return {}
}

function uid(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

async function ensureSchema(client: Client): Promise<void> {
  await client.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT,
      name TEXT,
      picture TEXT,
      provider TEXT,
      created_at TEXT,
      updated_at TEXT,
      last_login_at TEXT
    )
  `)
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
  try {
    await client.execute(`ALTER TABLE groups ADD COLUMN user_id TEXT DEFAULT ''`)
  } catch {
    /* exists */
  }
  await client.execute(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    )
  `)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS campaigns (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      content TEXT NOT NULL,
      media_url TEXT,
      scheduled_at TEXT NOT NULL,
      human_delay_min_sec INTEGER NOT NULL DEFAULT 45,
      human_delay_max_sec INTEGER NOT NULL DEFAULT 120,
      urgent_window_minutes INTEGER NOT NULL DEFAULT 60,
      auto_prioritize INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL
    )
  `)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS scheduled_posts (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      campaign_id TEXT,
      group_id TEXT NOT NULL,
      fb_group_id TEXT NOT NULL,
      group_name TEXT NOT NULL DEFAULT '',
      group_url TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      media_url TEXT,
      scheduled_at TEXT NOT NULL,
      human_delay_min_sec INTEGER NOT NULL DEFAULT 45,
      human_delay_max_sec INTEGER NOT NULL DEFAULT 120,
      urgent_window_minutes INTEGER NOT NULL DEFAULT 60,
      status TEXT NOT NULL DEFAULT 'pending',
      priority INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      claimed_at TEXT,
      published_at TEXT,
      created_at TEXT NOT NULL
    )
  `)
  await client.execute(`
    CREATE TABLE IF NOT EXISTS queue_jobs (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      campaign_id TEXT NOT NULL,
      group_id TEXT NOT NULL,
      fb_group_id TEXT NOT NULL,
      group_name TEXT NOT NULL DEFAULT '',
      group_url TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      media_url TEXT,
      scheduled_at TEXT NOT NULL,
      human_delay_min_sec INTEGER NOT NULL DEFAULT 45,
      human_delay_max_sec INTEGER NOT NULL DEFAULT 120,
      urgent_window_minutes INTEGER NOT NULL DEFAULT 60,
      status TEXT NOT NULL DEFAULT 'pending',
      priority INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_error TEXT,
      claimed_at TEXT,
      published_at TEXT,
      created_at TEXT NOT NULL
    )
  `)
}

function extractGroups(body: Record<string, unknown>) {
  const raw =
    (Array.isArray(body.groups) && body.groups) ||
    (Array.isArray(body.items) && body.items) ||
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
    const fbGroupId = String(g.fbGroupId || g.fb_group_id || g.id || g.groupId || '').trim()
    if (!fbGroupId || seen.has(fbGroupId)) continue
    if (['joins', 'feed', 'create', 'discover'].includes(fbGroupId.toLowerCase())) continue
    seen.add(fbGroupId)
    out.push({
      name: String(g.name || g.title || fbGroupId).trim() || fbGroupId,
      fbGroupId,
      url: String(g.url || g.link || `https://www.facebook.com/groups/${fbGroupId}`),
      memberCount: Number(g.memberCount ?? g.member_count ?? 0) || 0,
      avatarUrl: (g.avatarUrl ?? g.avatar_url ?? null) as string | null,
    })
  }
  return out
}

export default async function handler(req: Req, res: Res) {
  try {
    setCors(req, res)
    if (req.method === 'OPTIONS') return res.status(204).json({})
    if (req.method !== 'POST') {
      return res.status(405).json({ ok: false, error: 'method_not_allowed', count: 0, groups: [] })
    }

    const authSecret = readEnv('AUTH_SECRET')
    if (!authSecret || authSecret.length < 32) {
      return res.status(401).json({ ok: false, error: 'AUTH_SECRET missing on Vercel', count: 0, groups: [] })
    }
    const session = getSession(req)
    if (!session) {
      return res.status(401).json({ ok: false, error: 'unauthorized', count: 0, groups: [] })
    }

    const body = parseJsonBody(req)
    const groupsIn = extractGroups(body)
    if (groupsIn.length === 0) {
      return res.status(400).json({ ok: false, error: 'groups_required', count: 0, groups: [] })
    }

    const url = readEnv('TURSO_DATABASE_URL')
    const authToken = readEnv('TURSO_AUTH_TOKEN')
    if (!url || !authToken) {
      return res.status(500).json({
        ok: false,
        error: 'TURSO_DATABASE_URL / TURSO_AUTH_TOKEN missing on Vercel',
        count: 0,
        groups: [],
      })
    }

    const client = createClient({ url, authToken })
    await ensureSchema(client)
    const syncedAt = String(body.syncedAt || new Date().toISOString())

    await client.execute({
      sql: `INSERT INTO users (id, email, name, picture, provider, created_at, updated_at, last_login_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(id) DO UPDATE SET
              email = excluded.email,
              name = excluded.name,
              picture = excluded.picture,
              updated_at = excluded.updated_at,
              last_login_at = excluded.last_login_at`,
      args: [
        session.sub,
        session.email,
        session.name,
        session.picture,
        session.provider || 'google',
        syncedAt,
        syncedAt,
        syncedAt,
      ],
    })

    let saved = 0
    for (const g of groupsIn) {
      const existing = await client.execute({
        sql: 'SELECT id, active FROM groups WHERE fb_group_id = ? LIMIT 1',
        args: [g.fbGroupId],
      })
      const id = existing.rows[0] ? String(existing.rows[0].id) : uid('g')
      const active = existing.rows[0] ? Number(existing.rows[0].active) === 1 : true
      if (existing.rows[0]) {
        try {
          await client.execute({
            sql: 'UPDATE groups SET name = ?, url = ?, member_count = ?, avatar_url = ?, synced_at = ?, active = ?, user_id = ? WHERE id = ?',
            args: [g.name, g.url || '', g.memberCount || 0, g.avatarUrl ?? null, syncedAt, active ? 1 : 0, session.sub, id],
          })
        } catch {
          await client.execute({
            sql: 'UPDATE groups SET name = ?, url = ?, member_count = ?, avatar_url = ?, synced_at = ?, active = ? WHERE id = ?',
            args: [g.name, g.url || '', g.memberCount || 0, g.avatarUrl ?? null, syncedAt, active ? 1 : 0, id],
          })
        }
      } else {
        try {
          await client.execute({
            sql: 'INSERT INTO groups (id, fb_group_id, name, url, member_count, avatar_url, active, synced_at, user_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
            args: [id, g.fbGroupId, g.name, g.url || '', g.memberCount || 0, g.avatarUrl ?? null, 1, syncedAt, session.sub],
          })
        } catch {
          await client.execute({
            sql: 'INSERT INTO groups (id, fb_group_id, name, url, member_count, avatar_url, active, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            args: [id, g.fbGroupId, g.name, g.url || '', g.memberCount || 0, g.avatarUrl ?? null, 1, syncedAt],
          })
        }
      }
      saved += 1
    }

    const syncKey = `u:${session.sub}:last_group_sync_at`
    await client.execute({
      sql: 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      args: [syncKey, syncedAt],
    })
    if (typeof body.extensionId === 'string' && body.extensionId) {
      await client.execute({
        sql: 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
        args: [`u:${session.sub}:extension_id`, body.extensionId],
      })
    }

    let all
    try {
      all = await client.execute({
        sql: `SELECT * FROM groups WHERE user_id = ? OR user_id = '' OR user_id IS NULL ORDER BY name COLLATE NOCASE`,
        args: [session.sub],
      })
    } catch {
      all = await client.execute('SELECT * FROM groups ORDER BY name COLLATE NOCASE')
    }

    const mapped = all.rows.map((row) => ({
      id: String(row.id),
      fbGroupId: String(row.fb_group_id),
      name: String(row.name),
      url: String(row.url ?? ''),
      memberCount: Number(row.member_count ?? 0),
      avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
      active: Number(row.active) === 1,
      collectionIds: [] as string[],
      syncedAt: row.synced_at ? String(row.synced_at) : null,
    }))

    return res.status(200).json({
      ok: true,
      success: true,
      count: saved,
      syncedCount: saved,
      lastSyncAt: syncedAt,
      groups: mapped,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/sync-groups]', message)
    return res.status(500).json({ ok: false, error: message, count: 0, groups: [] })
  }
}
