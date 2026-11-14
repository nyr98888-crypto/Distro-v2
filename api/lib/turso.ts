/**
 * Turso web client + Distro V2 schema helpers.
 * Always use `@libsql/client/web` on Vercel.
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
let schemaReady = false

export function getTurso(): Client | null {
  const url = readEnv('TURSO_DATABASE_URL')
  const authToken = readEnv('TURSO_AUTH_TOKEN')
  if (!url || !authToken) return null
  if (!cached) cached = createClient({ url, authToken })
  return cached
}

export async function ensureSchema(client: Client): Promise<void> {
  if (schemaReady) return
  await client.execute(`
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT '',
      fb_group_id TEXT NOT NULL,
      name TEXT NOT NULL,
      url TEXT NOT NULL DEFAULT '',
      member_count INTEGER NOT NULL DEFAULT 0,
      avatar_url TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      synced_at TEXT
    )
  `)
  // Legacy installs may lack user_id — add it safely.
  try {
    await client.execute(`ALTER TABLE groups ADD COLUMN user_id TEXT NOT NULL DEFAULT ''`)
  } catch {
    /* column already exists */
  }
  try {
    await client.execute(
      `CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_user_fb ON groups(user_id, fb_group_id)`,
    )
  } catch {
    /* older UNIQUE(fb_group_id) may still exist — upsert handles orphans */
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
  await client.execute(
    `CREATE INDEX IF NOT EXISTS idx_jobs_user_status ON queue_jobs(user_id, status, scheduled_at)`,
  )
  schemaReady = true
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
  const r = await client.execute({
    sql: 'SELECT value FROM settings WHERE key = ?',
    args: [settingKey(userId, key)],
  })
  return r.rows[0] ? String(r.rows[0].value) : null
}

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
    const memberCount = Number(g.memberCount ?? 0)
    const avatarUrl = g.avatarUrl ?? null

    // Prefer owned row; else claim orphan/legacy row with same fb_group_id.
    let existing = await client.execute({
      sql: 'SELECT id, active FROM groups WHERE user_id = ? AND fb_group_id = ?',
      args: [userId, fbGroupId],
    })
    if (!existing.rows[0]) {
      existing = await client.execute({
        sql: `SELECT id, active FROM groups
              WHERE fb_group_id = ? AND (user_id = '' OR user_id IS NULL)
              LIMIT 1`,
        args: [fbGroupId],
      })
    }
    if (!existing.rows[0]) {
      existing = await client.execute({
        sql: 'SELECT id, active FROM groups WHERE fb_group_id = ? LIMIT 1',
        args: [fbGroupId],
      })
    }

    const id = existing.rows[0] ? String(existing.rows[0].id) : uid('g')
    const active = existing.rows[0] ? Number(existing.rows[0].active) === 1 : true

    if (existing.rows[0]) {
      await client.execute({
        sql: `UPDATE groups
              SET user_id = ?, name = ?, url = ?, member_count = ?, avatar_url = ?, synced_at = ?, active = ?
              WHERE id = ?`,
        args: [userId, name, url, memberCount, avatarUrl, syncedAt, active ? 1 : 0, id],
      })
    } else {
      await client.execute({
        sql: `INSERT INTO groups (id, user_id, fb_group_id, name, url, member_count, avatar_url, active, synced_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`,
        args: [id, userId, fbGroupId, name, url, memberCount, avatarUrl, syncedAt],
      })
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
  if (groups.length > 0) {
    // also keep legacy global key for older clients
    await client.execute({
      sql: `INSERT INTO settings (key, value) VALUES (?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      args: ['last_group_sync_at', syncedAt],
    })
  }

  return out
}

export async function listGroupsForUser(client: Client, userId: string): Promise<GroupRow[]> {
  await ensureSchema(client)
  const result = await client.execute({
    sql: `SELECT * FROM groups
          WHERE user_id = ? OR user_id = '' OR user_id IS NULL
          ORDER BY name COLLATE NOCASE`,
    args: [userId],
  })
  return result.rows.map((row) => ({
    id: String(row.id),
    userId: String(row.user_id ?? ''),
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
    campaignId: String(row.campaign_id),
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

/**
 * Pick next dispatchable job with 1-hour priority + human pacing lock.
 */
export async function claimNextJob(
  client: Client,
  userId: string,
): Promise<{ job: QueueJob | null; waitMs: number; reason?: string }> {
  await ensureSchema(client)
  const now = Date.now()
  const nowIso = new Date(now).toISOString()

  // Release stale claims (> 10 min)
  await client.execute({
    sql: `UPDATE queue_jobs SET status = 'pending', claimed_at = NULL
          WHERE user_id = ? AND status = 'claimed'
            AND claimed_at IS NOT NULL
            AND claimed_at < ?`,
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

  // Mark urgent flags
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

  const ordered = [...urgent, ...later]
  const candidate = ordered[0]
  if (!candidate) return { job: null, waitMs: 0, reason: 'empty' }

  // If not urgent and scheduled in the future, wait
  const scheduledMs = Date.parse(candidate.scheduledAt)
  if (!isUrgentJob(candidate.scheduledAt, candidate.urgentWindowMinutes, now) && scheduledMs > now) {
    return {
      job: null,
      waitMs: Math.max(0, scheduledMs - now),
      reason: 'not_due',
    }
  }

  // Human pacing lock
  const lastPublished = await getUserSetting(client, userId, 'last_published_at')
  if (lastPublished) {
    const lastMs = Date.parse(lastPublished)
    const minSec = candidate.humanDelayMinSec
    const maxSec = Math.max(minSec, candidate.humanDelayMaxSec)
    const jitterSec = minSec + Math.floor(Math.random() * (maxSec - minSec + 1))
    const unlockAt = lastMs + jitterSec * 1000
    if (now < unlockAt) {
      return {
        job: null,
        waitMs: unlockAt - now,
        reason: 'human_pacing',
      }
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
