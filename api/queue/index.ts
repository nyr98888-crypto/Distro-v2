/**
 * GET /api/queue — list jobs for Live Queue Monitor (1-hour urgency flags).
 */
import { requireSession, setCors, type ApiReq, type ApiRes } from '../lib/auth'
import { getTurso, isUrgentJob, listJobsForUser } from '../lib/turso'

export default async function handler(req: ApiReq, res: ApiRes) {
  try {
    setCors(req, res, 'GET, OPTIONS')
    if (req.method === 'OPTIONS') return res.status(204).json({})
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' })

    const session = requireSession(req, res)
    if (!session) return

    const client = getTurso()
    if (!client) return res.status(200).json({ jobs: [], count: 0 })

    const jobs = await listJobsForUser(client, session.sub)
    const now = Date.now()
    const mapped = jobs.map((j) => {
      const urgent = isUrgentJob(j.scheduledAt, j.urgentWindowMinutes, now)
      const displayStatus =
        j.status === 'published'
          ? 'published'
          : j.status === 'failed'
            ? 'failed'
            : j.status === 'paused'
              ? 'paused'
              : urgent || j.status === 'urgent' || j.status === 'claimed'
                ? 'urgent'
                : 'pending'
      return {
        ...j,
        urgent,
        displayStatus,
        msUntilDue: Date.parse(j.scheduledAt) - now,
      }
    })

    return res.status(200).json({ jobs: mapped, count: mapped.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/queue]', message)
    return res.status(500).json({ error: message })
  }
}
