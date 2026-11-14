/**
 * POST /api/campaigns — create a campaign and enqueue one job per selected group.
 * GET  /api/campaigns — list campaigns + job summary for the signed-in user.
 */
import {
  parseJsonBody,
  requireSession,
  setCors,
  uid,
  type ApiReq,
  type ApiRes,
} from './lib/auth'
import { ensureSchema, getTurso, listGroupsForUser } from './lib/turso'

export default async function handler(req: ApiReq, res: ApiRes) {
  try {
    setCors(req, res, 'GET, POST, OPTIONS')
    if (req.method === 'OPTIONS') return res.status(204).json({})

    const session = requireSession(req, res)
    if (!session) return

    const client = getTurso()
    if (!client) {
      return res.status(500).json({ error: 'turso_not_configured' })
    }
    await ensureSchema(client)

    if (req.method === 'GET') {
      const camps = await client.execute({
        sql: `SELECT * FROM campaigns WHERE user_id = ? ORDER BY created_at DESC LIMIT 100`,
        args: [session.sub],
      })
      return res.status(200).json({
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
    const humanDelayMaxSec = Math.max(
      humanDelayMinSec,
      Number(body.humanDelayMaxSec ?? 120),
    )
    const urgentWindowMinutes = Math.max(
      1,
      Number(body.urgentWindowMinutes ?? 60),
    )
    const autoPrioritize = body.autoPrioritize === false || body.autoPrioritize === 0 ? 0 : 1
    const mediaUrl = body.mediaUrl ? String(body.mediaUrl) : null

    const userGroups = await listGroupsForUser(client, session.sub)
    const byId = new Map(userGroups.map((g) => [g.id, g]))
    const byFb = new Map(userGroups.map((g) => [g.fbGroupId, g]))
    const selected = groupIds
      .map((id) => byId.get(id) || byFb.get(id))
      .filter(Boolean) as typeof userGroups

    if (selected.length === 0) {
      return res.status(400).json({ error: 'no_matching_groups' })
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

    const jobs = []
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
      // Mirror into scheduled_posts (canonical name requested for Turso schema)
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
        /* table may not exist on older deploys — ensureSchema creates it */
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
    return res.status(500).json({ error: message })
  }
}
