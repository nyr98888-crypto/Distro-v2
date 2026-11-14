/**
 * GET /api/queue — list jobs for authenticated user. Self-contained (no relative imports).
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

type SessionPayload = { sub: string; email: string; name: string; picture: string | null; provider: string; exp: number }

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
  if (value?.startsWith('Bearer ')) return verifySessionToken(value.slice(7).trim(), authSecret)
  return null
}

function setCors(req: Req, res: Res): void {
  const origin = req.headers.origin
  const originVal = Array.isArray(origin) ? origin[0] : origin
  res.setHeader('Access-Control-Allow-Origin', originVal || '*')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  res.setHeader('Cache-Control', 'no-store')
}

function isUrgent(scheduledAtIso: string, urgentWindowMinutes = 60, now = Date.now()): boolean {
  const scheduled = Date.parse(scheduledAtIso)
  if (Number.isNaN(scheduled)) return false
  return scheduled <= now || scheduled - now <= urgentWindowMinutes * 60 * 1000
}

async function ensureSchema(client: Client): Promise<void> {
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

function mapJob(row: Record<string, unknown>) {
  const scheduledAt = String(row.scheduled_at)
  const urgentWindowMinutes = Number(row.urgent_window_minutes ?? 60)
  return {
    id: String(row.id),
    userId: String(row.user_id),
    campaignId: String(row.campaign_id ?? ''),
    groupId: String(row.group_id),
    fbGroupId: String(row.fb_group_id),
    groupName: String(row.group_name ?? ''),
    groupUrl: String(row.group_url ?? ''),
    content: String(row.content),
    mediaUrl: row.media_url ? String(row.media_url) : null,
    scheduledAt,
    humanDelayMinSec: Number(row.human_delay_min_sec ?? 45),
    humanDelayMaxSec: Number(row.human_delay_max_sec ?? 120),
    urgentWindowMinutes,
    status: String(row.status),
    priority: Number(row.priority ?? 0),
    attempts: Number(row.attempts ?? 0),
    lastError: row.last_error ? String(row.last_error) : null,
    claimedAt: row.claimed_at ? String(row.claimed_at) : null,
    publishedAt: row.published_at ? String(row.published_at) : null,
    createdAt: String(row.created_at),
    urgent: isUrgent(scheduledAt, urgentWindowMinutes),
  }
}

export default async function handler(req: Req, res: Res) {
  try {
    setCors(req, res)
    if (req.method === 'OPTIONS') return res.status(204).json({})
    if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' })

    const authSecret = readEnv('AUTH_SECRET')
    if (!authSecret || authSecret.length < 32) {
      return res.status(401).json({ ok: false, error: 'AUTH_SECRET missing on Vercel', jobs: [] })
    }
    const session = getSession(req)
    if (!session) return res.status(401).json({ ok: false, error: 'unauthorized', jobs: [] })

    const url = readEnv('TURSO_DATABASE_URL')
    const authToken = readEnv('TURSO_AUTH_TOKEN')
    if (!url || !authToken) {
      return res.status(200).json({ ok: true, jobs: [], count: 0, error: 'turso_not_configured' })
    }

    const client = createClient({ url, authToken })
    await ensureSchema(client)

    let result
    try {
      result = await client.execute({
        sql: `SELECT * FROM queue_jobs WHERE user_id = ? ORDER BY
              CASE status WHEN 'urgent' THEN 0 WHEN 'claimed' THEN 1 WHEN 'pending' THEN 2 WHEN 'published' THEN 3 ELSE 4 END,
              scheduled_at ASC LIMIT 500`,
        args: [session.sub],
      })
    } catch {
      result = await client.execute({
        sql: `SELECT * FROM scheduled_posts WHERE user_id = ? ORDER BY scheduled_at ASC LIMIT 500`,
        args: [session.sub],
      })
    }

    const jobs = result.rows.map((row) => mapJob(row as unknown as Record<string, unknown>))
    return res.status(200).json({ ok: true, jobs, count: jobs.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/queue]', message)
    return res.status(500).json({ ok: false, error: message, jobs: [], count: 0 })
  }
}
