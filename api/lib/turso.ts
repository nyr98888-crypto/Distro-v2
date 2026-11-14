/**
 * Turso web client + Distro V2 schema (crash-proof init).
 * Always `@libsql/client/web` — never native `@libsql/client`.
 */
import { createClient, type Client } from '@libsql/client/web'
import { readEnv, uid } from './auth'

export type GroupRow = {
  id: string
  userId: string
  fbGroupId: string
  name: string
  url: string
  memberCount: number
  avatarUrl: string | null
  active: boolean
  syncedAt: string | null
}

export type JobStatus = 'pending' | 'urgent' | 'claimed' | 'published' | 'failed' | 'paused'

export type QueueJob = {
  id: string
  userId: string
  campaignId: string
  groupId: string
  fbGroupId: string
  groupName: string
  groupUrl: string
  content: string
  mediaUrl: string | null
  scheduledAt: string
  humanDelayMinSec: number
  humanDelayMaxSec: number
  urgentWindowMinutes: number
  status: JobStatus
  priority: number
  attempts: number
  lastError: string | null
  claimedAt: string | null
  publishedAt: string | null
  createdAt: string
}

let cached: Client | null = null

export function getTurso(): Client | null {
  const url = readEnv('TURSO_DATABASE_URL')
  const authToken = readEnv('TURSO_AUTH_TOKEN')
  if (!url || !authToken) return null
  if (!cached) cached = createClient({ url, authToken })
  return cached
}

async function tryExec(client: Client, sql: string): Promise<void> {
  try {
    await client.execute(sql)
  } catch {
    /* ignore duplicate column / index / table */
  }
}

/** Always safe to call — creates every table Distro needs on a fresh DB. */
export async function ensureSchema(client: Client): Promise<void> {
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

  // Compatible with both fresh DBs and legacy installs (UNIQUE fb_group_id).
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
  await tryExec(client, `ALTER TABLE groups ADD COLUMN user_id TEXT DEFAULT ''`)
  await tryExec(client, `ALTER TABLE groups ADD COLUMN collection_ids TEXT DEFAULT '[]'`)

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

  // Keep queue_jobs as alias table name used by earlier code paths.
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

  await tryExec(
    client,
    `CREATE INDEX IF NOT EXISTS idx_jobs_user_status ON queue_jobs(user_id, status, scheduled_at)`,
  )
  await tryExec(
    client,
    `CREATE INDEX IF NOT EXISTS idx_scheduled_user_status ON scheduled_posts(user_id, status, scheduled_at)`,
  )
}

function settingKey(userId: string, key: string): string {
  return `u:${userId}:${key}`
}

export async function setUserSetting(
  client: Client,
  userId: string,
  key: string,
  value: string,
): Promise<void> {
  await ensureSchema(client)
  await client.execute({
    sql: `INSERT INTO settings (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [settingKey(userId, key), value],
  })
}

export async function getUserSetting(
  client: Client,
  userId: string,
  key: string,
): Promise<string | null> {
  await ensureSchema(client)
  const r = await client.execute({
    sql: 'SELECT value FROM settings WHERE key = ?',
    args: [settingKey(userId, key)],
  })
  return r.rows[0] ? String(r.rows[0].value) : null
}

export async function upsertUser(
  client: Client,
  user: { id: string; email: string; name: string; picture?: string | null; provider?: string },
): Promise<void> {
  await ensureSchema(client)
  const now = new Date().toISOString()
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
      user.id,
      user.email,
      user.name,
      user.picture ?? null,
      user.provider || 'google',
      now,
      now,
      now,
    ],
  })
}

/**
 * Upsert groups for v1.0.9 payload.
 * Uses ON CONFLICT(fb_group_id) — matches legacy UNIQUE schema that caused 500s
 * when we tried a composite unique / missing user_id column.
 */
export async function upsertGroupsForUser(
  client: Client,
  userId: string,
  groups: Array<{
    name: string
    fbGroupId: string
    url?: string
    memberCount?: number
    avatarUrl?: string | null
  }>,
  syncedAt: string,
): Promise<GroupRow[]> {
  await ensureSchema(client)
  const out: GroupRow[] = []

  for (const g of groups) {
    const fbGroupId = String(g.fbGroupId || '').trim()
    if (!fbGroupId) continue
    const name = String(g.name || fbGroupId).trim() || fbGroupId
    const url = g.url || `https://www.facebook.com/groups/${fbGroupId}`
    const memberCount = Number.isFinite(Number(g.memberCount)) ? Number(g.memberCount) : 0
    const avatarUrl = g.avatarUrl ?? null

    const existing = await client.execute({
      sql: 'SELECT id, active FROM groups WHERE fb_group_id = ? LIMIT 1',
      args: [fbGroupId],
    })
    const id = existing.rows[0] ? String(existing.rows[0].id) : uid('g')
    const active = existing.rows[0] ? Number(existing.rows[0].active) === 1 : true

    // Avoid ON CONFLICT(fb_group_id) — some DBs only have a composite unique index
    // and that mismatch was causing HTTP 500 on Vercel.
    if (existing.rows[0]) {
      try {
        await client.execute({
          sql: `UPDATE groups
                SET name = ?, url = ?, member_count = ?, avatar_url = ?, synced_at = ?, active = ?, user_id = ?
                WHERE id = ?`,
          args: [name, url, memberCount, avatarUrl, syncedAt, active ? 1 : 0, userId, id],
        })
      } catch {
        await client.execute({
          sql: `UPDATE groups
                SET name = ?, url = ?, member_count = ?, avatar_url = ?, synced_at = ?, active = ?
                WHERE id = ?`,
          args: [name, url, memberCount, avatarUrl, syncedAt, active ? 1 : 0, id],
        })
      }
    } else {
      try {
        await client.execute({
          sql: `INSERT INTO groups (id, fb_group_id, name, url, member_count, avatar_url, active, synced_at, user_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [id, fbGroupId, name, url, memberCount, avatarUrl, 1, syncedAt, userId],
        })
      } catch {
        await client.execute({
          sql: `INSERT INTO groups (id, fb_group_id, name, url, member_count, avatar_url, active, synced_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [id, fbGroupId, name, url, memberCount, avatarUrl, 1, syncedAt],
        })
      }
    }

    out.push({
      id,
      userId,
      fbGroupId,
      name,
      url,
      memberCount,
      avatarUrl,
      active,
      syncedAt,
    })
  }

  await setUserSetting(client, userId, 'last_group_sync_at', syncedAt)
  await client.execute({
    sql: `INSERT INTO settings (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: ['last_group_sync_at', syncedAt],
  })

  return out
}

export async function listGroupsForUser(client: Client, userId: string): Promise<GroupRow[]> {
  await ensureSchema(client)
  let result
  try {
    result = await client.execute({
      sql: `SELECT * FROM groups
            WHERE user_id = ? OR user_id = '' OR user_id IS NULL OR user_id = ?
            ORDER BY name COLLATE NOCASE`,
      args: [userId, userId],
    })
  } catch {
    // Extremely old schema without user_id
    result = await client.execute(`SELECT * FROM groups ORDER BY name COLLATE NOCASE`)
  }

  return result.rows.map((row) => ({
    id: String(row.id),
    userId: row.user_id != null ? String(row.user_id) : '',
    fbGroupId: String(row.fb_group_id),
    name: String(row.name),
    url: String(row.url ?? ''),
    memberCount: Number(row.member_count ?? 0),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    active: Number(row.active) === 1,
    syncedAt: row.synced_at ? String(row.synced_at) : null,
  }))
}

function mapJob(row: Record<string, unknown>): QueueJob {
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
    scheduledAt: String(row.scheduled_at),
    humanDelayMinSec: Number(row.human_delay_min_sec ?? 45),
    humanDelayMaxSec: Number(row.human_delay_max_sec ?? 120),
    urgentWindowMinutes: Number(row.urgent_window_minutes ?? 60),
    status: String(row.status) as JobStatus,
    priority: Number(row.priority ?? 0),
    attempts: Number(row.attempts ?? 0),
    lastError: row.last_error ? String(row.last_error) : null,
    claimedAt: row.claimed_at ? String(row.claimed_at) : null,
    publishedAt: row.published_at ? String(row.published_at) : null,
    createdAt: String(row.created_at),
  }
}

export function isUrgentJob(
  scheduledAtIso: string,
  urgentWindowMinutes = 60,
  now = Date.now(),
): boolean {
  const scheduled = Date.parse(scheduledAtIso)
  if (Number.isNaN(scheduled)) return false
  const windowMs = urgentWindowMinutes * 60 * 1000
  return scheduled <= now || scheduled - now <= windowMs
}

export async function claimNextJob(
  client: Client,
  userId: string,
): Promise<{ job: QueueJob | null; waitMs: number; reason?: string }> {
  await ensureSchema(client)
  const now = Date.now()
  const nowIso = new Date(now).toISOString()

  await client.execute({
    sql: `UPDATE queue_jobs SET status = 'pending', claimed_at = NULL
          WHERE user_id = ? AND status = 'claimed'
            AND claimed_at IS NOT NULL AND claimed_at < ?`,
    args: [userId, new Date(now - 10 * 60 * 1000).toISOString()],
  })

  const pending = await client.execute({
    sql: `SELECT * FROM queue_jobs
          WHERE user_id = ? AND status IN ('pending', 'urgent')
          ORDER BY scheduled_at ASC`,
    args: [userId],
  })

  const jobs = pending.rows.map((r) => mapJob(r as unknown as Record<string, unknown>))
  if (jobs.length === 0) return { job: null, waitMs: 0, reason: 'empty' }

  for (const job of jobs) {
    if (isUrgentJob(job.scheduledAt, job.urgentWindowMinutes, now) && job.status !== 'urgent') {
      await client.execute({
        sql: `UPDATE queue_jobs SET status = 'urgent', priority = 100 WHERE id = ?`,
        args: [job.id],
      })
      job.status = 'urgent'
      job.priority = 100
    }
  }

  const urgent = jobs
    .filter((j) => isUrgentJob(j.scheduledAt, j.urgentWindowMinutes, now))
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))
  const later = jobs
    .filter((j) => !isUrgentJob(j.scheduledAt, j.urgentWindowMinutes, now))
    .sort((a, b) => Date.parse(a.scheduledAt) - Date.parse(b.scheduledAt))
  const candidate = [...urgent, ...later][0]
  if (!candidate) return { job: null, waitMs: 0, reason: 'empty' }

  const scheduledMs = Date.parse(candidate.scheduledAt)
  if (!isUrgentJob(candidate.scheduledAt, candidate.urgentWindowMinutes, now) && scheduledMs > now) {
    return { job: null, waitMs: Math.max(0, scheduledMs - now), reason: 'not_due' }
  }

  const lastPublished = await getUserSetting(client, userId, 'last_published_at')
  if (lastPublished) {
    const lastMs = Date.parse(lastPublished)
    const minSec = candidate.humanDelayMinSec
    const maxSec = Math.max(minSec, candidate.humanDelayMaxSec)
    const jitterSec = minSec + Math.floor(Math.random() * (maxSec - minSec + 1))
    const unlockAt = lastMs + jitterSec * 1000
    if (now < unlockAt) {
      return { job: null, waitMs: unlockAt - now, reason: 'human_pacing' }
    }
  }

  await client.execute({
    sql: `UPDATE queue_jobs
          SET status = 'claimed', claimed_at = ?, attempts = attempts + 1
          WHERE id = ? AND status IN ('pending', 'urgent')`,
    args: [nowIso, candidate.id],
  })

  return {
    job: { ...candidate, status: 'claimed', claimedAt: nowIso, attempts: candidate.attempts + 1 },
    waitMs: 0,
  }
}

export async function completeJob(
  client: Client,
  userId: string,
  jobId: string,
  result: { ok: boolean; error?: string },
): Promise<QueueJob | null> {
  await ensureSchema(client)
  const existing = await client.execute({
    sql: 'SELECT * FROM queue_jobs WHERE id = ? AND user_id = ?',
    args: [jobId, userId],
  })
  if (!existing.rows[0]) return null
  const nowIso = new Date().toISOString()
  if (result.ok) {
    await client.execute({
      sql: `UPDATE queue_jobs SET status = 'published', published_at = ?, last_error = NULL WHERE id = ?`,
      args: [nowIso, jobId],
    })
    await setUserSetting(client, userId, 'last_published_at', nowIso)
  } else {
    await client.execute({
      sql: `UPDATE queue_jobs SET status = 'failed', last_error = ?, claimed_at = NULL WHERE id = ?`,
      args: [result.error || 'failed', jobId],
    })
  }
  const updated = await client.execute({
    sql: 'SELECT * FROM queue_jobs WHERE id = ?',
    args: [jobId],
  })
  return updated.rows[0]
    ? mapJob(updated.rows[0] as unknown as Record<string, unknown>)
    : null
}

export async function listJobsForUser(client: Client, userId: string): Promise<QueueJob[]> {
  await ensureSchema(client)
  const r = await client.execute({
    sql: `SELECT * FROM queue_jobs WHERE user_id = ? ORDER BY
            CASE status
              WHEN 'urgent' THEN 0
              WHEN 'claimed' THEN 1
              WHEN 'pending' THEN 2
              WHEN 'published' THEN 3
              ELSE 4
            END,
            scheduled_at ASC
          LIMIT 500`,
    args: [userId],
  })
  return r.rows.map((row) => mapJob(row as unknown as Record<string, unknown>))
}

export { mapJob }
