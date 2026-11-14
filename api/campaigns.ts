/**
 * POST/GET /api/campaigns — self-contained (no relative imports).
 * Enqueues one queue job per selected group with human-like delay fields.
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
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

type GroupRow = {
  id: string
  fbGroupId: string
  name: string
  url: string
}

async function listGroups(client: Client, userId: string): Promise<GroupRow[]> {
  let result
  try {
    result = await client.execute({
      sql: `SELECT * FROM groups WHERE user_id = ? OR user_id = '' OR user_id IS NULL ORDER BY name COLLATE NOCASE`,
      args: [userId],
    })
    if (result.rows.length === 0) {
      result = await client.execute('SELECT * FROM groups ORDER BY name COLLATE NOCASE')
    }
  } catch {
    result = await client.execute('SELECT * FROM groups ORDER BY name COLLATE NOCASE')
  }
  return result.rows.map((row) => ({
    id: String(row.id),
    fbGroupId: String(row.fb_group_id),
    name: String(row.name),
    url: String(row.url ?? ''),
  }))
}

export default async function handler(req: Req, res: Res) {
  try {
    setCors(req, res)
    if (req.method === 'OPTIONS') return res.status(204).json({})

    const authSecret = readEnv('AUTH_SECRET')
    if (!authSecret || authSecret.length < 32) {
      return res.status(401).json({ error: 'AUTH_SECRET missing on Vercel' })
    }
    const session = getSession(req)
    if (!session) return res.status(401).json({ error: 'unauthorized' })

    const url = readEnv('TURSO_DATABASE_URL')
    const authToken = readEnv('TURSO_AUTH_TOKEN')
    if (!url || !authToken) {
      return res.status(500).json({ error: 'TURSO_DATABASE_URL / TURSO_AUTH_TOKEN missing on Vercel' })
    }

    const client = createClient({ url, authToken })
    await ensureSchema(client)

    if (req.method === 'GET') {
      const camps = await client.execute({
        sql: `SELECT * FROM campaigns WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
        args: [session.sub],
      })
      return res.status(200).json({
        ok: true,
        campaigns: camps.rows.map((row) => ({
          id: String(row.id),
          content: String(row.content),
          mediaUrl: row.media_url ? String(row.media_url) : null,
          scheduledAt: String(row.scheduled_at),
          humanDelayMinSec: Number(row.human_delay_min_sec ?? 45),
          humanDelayMaxSec: Number(row.human_delay_max_sec ?? 120),
          urgentWindowMinutes: Number(row.urgent_window_minutes ?? 60),
          autoPrioritize: Number(row.auto_prioritize) === 1,
          status: String(row.status),
          createdAt: String(row.created_at),
        })),
      })
    }

    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

    const body = parseJsonBody(req)
    const content = String(body.content || body.body || body.text || '').trim()
    if (!content) return res.status(400).json({ error: 'content_required' })

    const groupIdsRaw = (body.groupIds || body.groups || []) as unknown
    const groupIds = Array.isArray(groupIdsRaw)
      ? groupIdsRaw.map((x) => String(x)).filter(Boolean)
      : []
    if (groupIds.length === 0) return res.status(400).json({ error: 'groupIds_required' })

    const scheduledAt = String(body.scheduledAt || new Date().toISOString())
    const humanDelayMinSec = Math.max(0, Number(body.humanDelayMinSec ?? 45))
    const humanDelayMaxSec = Math.max(humanDelayMinSec, Number(body.humanDelayMaxSec ?? 120))
    const urgentWindowMinutes = Math.max(1, Number(body.urgentWindowMinutes ?? 60))
    const autoPrioritize = body.autoPrioritize === false || body.autoPrioritize === 0 ? 0 : 1
    const mediaUrl = body.mediaUrl ? String(body.mediaUrl) : null

    const userGroups = await listGroups(client, session.sub)
    const byId = new Map(userGroups.map((g) => [g.id, g]))
    const byFb = new Map(userGroups.map((g) => [g.fbGroupId, g]))
    const selected = groupIds
      .map((id) => byId.get(id) || byFb.get(id))
      .filter(Boolean) as GroupRow[]

    if (selected.length === 0) {
      return res.status(400).json({ error: 'no_matching_groups', hint: 'סנכרנו קבוצות מהתוסף ואז רענון' })
    }

    const campaignId = uid('camp')
    const createdAt = new Date().toISOString()

    await client.execute({
      sql: `INSERT INTO campaigns
            (id, user_id, content, media_url, scheduled_at, human_delay_min_sec, human_delay_max_sec,
             urgent_window_minutes, auto_prioritize, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
      args: [
        campaignId,
        session.sub,
        content,
        mediaUrl,
        scheduledAt,
        humanDelayMinSec,
        humanDelayMaxSec,
        urgentWindowMinutes,
        autoPrioritize,
        createdAt,
      ],
    })

    const jobs: string[] = []
    for (const g of selected) {
      const jobId = uid('job')
      const jobArgs = [
        jobId,
        session.sub,
        campaignId,
        g.id,
        g.fbGroupId,
        g.name,
        g.url,
        content,
        mediaUrl,
        scheduledAt,
        humanDelayMinSec,
        humanDelayMaxSec,
        urgentWindowMinutes,
        createdAt,
      ]
      await client.execute({
        sql: `INSERT INTO queue_jobs
              (id, user_id, campaign_id, group_id, fb_group_id, group_name, group_url, content, media_url,
               scheduled_at, human_delay_min_sec, human_delay_max_sec, urgent_window_minutes,
               status, priority, attempts, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, 0, ?)`,
        args: jobArgs,
      })
      try {
        await client.execute({
          sql: `INSERT INTO scheduled_posts
                (id, user_id, campaign_id, group_id, fb_group_id, group_name, group_url, content, media_url,
                 scheduled_at, human_delay_min_sec, human_delay_max_sec, urgent_window_minutes,
                 status, priority, attempts, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 0, 0, ?)`,
          args: jobArgs,
        })
      } catch {
        /* ignore mirror failure */
      }
      jobs.push(jobId)
    }

    return res.status(200).json({
      ok: true,
      campaignId,
      jobCount: jobs.length,
      jobIds: jobs,
      scheduledAt,
      urgentWindowMinutes,
      humanDelayMinSec,
      humanDelayMaxSec,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/campaigns]', message)
    return res.status(500).json({ ok: false, error: message })
  }
}
