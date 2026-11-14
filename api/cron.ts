/**
 * GET/POST /api/cron — process due jobs (1-hour priority).
 * Auth: Bearer CRON_SECRET or x-cron-secret.
 * Optional body/query userId; if omitted, scans recent pending users.
 */
import {
  isValidCron,
  parseJsonBody,
  setCors,
  type ApiReq,
  type ApiRes,
} from './lib/auth.js'
import { claimNextJob, ensureSchema, getTurso } from './lib/turso.js'

export default async function handler(req: ApiReq, res: ApiRes) {
  try {
    setCors(req, res, 'GET, POST, OPTIONS')
    if (req.method === 'OPTIONS') return res.status(204).json({})
    if (req.method !== 'GET' && req.method !== 'POST') {
      return res.status(405).json({ error: 'method_not_allowed' })
    }
    if (!isValidCron(req)) return res.status(401).json({ error: 'unauthorized_cron' })

    const client = getTurso()
    if (!client) return res.status(500).json({ error: 'turso_not_configured' })
    await ensureSchema(client)

    const body = parseJsonBody(req)
    const q = req.query || {}
    let userId = String(body.userId || q.userId || '')

    if (!userId) {
      const users = await client.execute(
        `SELECT DISTINCT user_id FROM queue_jobs
         WHERE status IN ('pending', 'urgent')
         LIMIT 20`,
      )
      const claimed = []
      for (const row of users.rows) {
        const uid = String(row.user_id)
        const result = await claimNextJob(client, uid)
        if (result.job) {
          claimed.push({
            userId: uid,
            jobId: result.job.id,
            scheduledAt: result.job.scheduledAt,
          })
        }
      }
      return res.status(200).json({ ok: true, claimed, count: claimed.length })
    }

    const result = await claimNextJob(client, userId)
    return res.status(200).json({
      ok: true,
      userId,
      job: result.job,
      waitMs: result.waitMs,
      reason: result.reason || null,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/cron]', message)
    return res.status(500).json({ error: message })
  }
}
