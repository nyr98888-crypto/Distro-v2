/**
 * GET /api/groups — fully self-contained (no relative imports).
 * Vercel ESM + "type":"module" crashes on extensionless ./lib/* imports → empty 500.
 */
import { createClient, type Client } from '@libsql/client/web'
import { createHmac, timingSafeEqual } from 'node:crypto'

type Req = {
  method?: string
  headers: Record<string, string | string[] | undefined>
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
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 'no-store')
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
    /* column may already exist */
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
}

export default async function handler(req: Req, res: Res) {
  try {
    setCors(req, res)
    if (req.method === 'OPTIONS') return res.status(204).json({})
    if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' })

    const authSecret = readEnv('AUTH_SECRET')
    if (!authSecret || authSecret.length < 32) {
      return res.status(401).json({ ok: false, error: 'AUTH_SECRET missing on Vercel', groups: [], count: 0 })
    }
    const session = getSession(req)
    if (!session) {
      return res.status(401).json({ ok: false, error: 'unauthorized', groups: [], count: 0 })
    }

    const url = readEnv('TURSO_DATABASE_URL')
    const authToken = readEnv('TURSO_AUTH_TOKEN')
    if (!url || !authToken) {
      return res.status(200).json({
        ok: true,
        groups: [],
        count: 0,
        lastSyncAt: null,
        error: 'TURSO_DATABASE_URL / TURSO_AUTH_TOKEN missing on Vercel',
      })
    }

    const client = createClient({ url, authToken })
    await ensureSchema(client)

    // Prefer this user's rows; if none, claim unowned rows then fall back to all.
    let result
    try {
      result = await client.execute({
        sql: `SELECT * FROM groups
              WHERE user_id = ? OR user_id = '' OR user_id IS NULL
              ORDER BY name COLLATE NOCASE`,
        args: [session.sub],
      })
      if (result.rows.length === 0) {
        try {
          await client.execute({
            sql: `UPDATE groups SET user_id = ? WHERE user_id = '' OR user_id IS NULL`,
            args: [session.sub],
          })
        } catch {
          /* no user_id column */
        }
        result = await client.execute('SELECT * FROM groups ORDER BY name COLLATE NOCASE')
      }
    } catch {
      result = await client.execute('SELECT * FROM groups ORDER BY name COLLATE NOCASE')
    }

    const groups = result.rows.map((row) => ({
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

    const syncKey = `u:${session.sub}:last_group_sync_at`
    let lastSyncAt: string | null = null
    try {
      const syncRow = await client.execute({
        sql: 'SELECT value FROM settings WHERE key = ?',
        args: [syncKey],
      })
      lastSyncAt = syncRow.rows[0] ? String(syncRow.rows[0].value) : null
    } catch {
      /* ignore */
    }
    if (!lastSyncAt) {
      lastSyncAt = groups.find((g) => g.syncedAt)?.syncedAt || null
    }

    return res.status(200).json({
      ok: true,
      groups,
      count: groups.length,
      lastSyncAt,
      lastGroupSyncAt: lastSyncAt,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/groups]', message)
    return res.status(500).json({
      ok: false,
      groups: [],
      count: 0,
      lastSyncAt: null,
      error: message,
    })
  }
}
