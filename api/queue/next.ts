/**
 * GET/POST /api/queue/next — claim next publish job (1-hour priority + human pacing).
 *
 * v1.0.9 does not poll a queue today; this endpoint is the forward-compatible
 * contract for publisher polling + /api/cron, and for the web Live Queue Monitor.
 *
 * Auth: Bearer session token (same as sync-groups).
 * Response: { job | null, waitMs, urgent, reason }
 */
import {
  isValidCron,
  parseJsonBody,
  requireSession,
  setCors,
  type ApiReq,
  type ApiRes,
} from '../lib/auth.js'
import { claimNextJob, getTurso, isUrgentJob } from '../lib/turso.js'

export default async function handler(req: ApiReq, res: ApiRes) {
  try {
    setCors(req, res, 'GET, POST, OPTIONS')
    if (req.method === 'OPTIONS') return res.status(204).json({})
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ error: 'method_not_allowed' })
    }

    let userId: string | null = null
    if (isValidCron(req)) {
      const body = parseJsonBody(req)
      const q = req.query || {}
      userId = String(body.userId || q.userId || '')
      if (!userId) return res.status(400).json({ error: 'userId_required_for_cron' })
    } else {
      const session = requireSession(req, res)
      if (!session) return
      userId = session.sub
    }

    const client = getTurso()
    if (!client) return res.status(500).json({ error: 'turso_not_configured' })

    const result = await claimNextJob(client, userId)
    const job = result.job
    return res.status(200).json({
      ok: true,
      job: job
        ? {
            id: job.id,
            campaignId: job.campaignId,
            groupId: job.groupId,
            fbGroupId: job.fbGroupId,
            groupName: job.groupName,
            groupUrl: job.groupUrl,
            content: job.content,
            mediaUrl: job.mediaUrl,
            scheduledAt: job.scheduledAt,
            status: job.status,
            urgent: isUrgentJob(job.scheduledAt, job.urgentWindowMinutes),
            humanDelayMinSec: job.humanDelayMinSec,
            humanDelayMaxSec: job.humanDelayMaxSec,
          }
        : null,
      waitMs: result.waitMs,
      reason: result.reason || null,
      // aliases some clients may look for
      nextPost: job,
      task: job,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/queue/next]', message)
    return res.status(500).json({ error: message })
  }
}
