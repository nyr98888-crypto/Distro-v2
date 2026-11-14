/**
 * POST /api/queue/complete — report publish success/failure.
 * Body: { jobId, ok, success?, error? }
 */
import {
  parseJsonBody,
  requireSession,
  setCors,
  type ApiReq,
  type ApiRes,
} from '../lib/auth.js'
import { completeJob, getTurso } from '../lib/turso.js'

export default async function handler(req: ApiReq, res: ApiRes) {
  try {
    setCors(req, res, 'POST, OPTIONS')
    if (req.method === 'OPTIONS') return res.status(204).json({})
    if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' })

    const session = requireSession(req, res)
    if (!session) return

    const body = parseJsonBody(req)
    const jobId = String(body.jobId || body.id || body.taskId || '').trim()
    if (!jobId) return res.status(400).json({ error: 'jobId_required' })

    const ok = body.ok === true || body.success === true || body.status === 'published'
    const client = getTurso()
    if (!client) return res.status(500).json({ error: 'turso_not_configured' })

    const job = await completeJob(client, session.sub, jobId, {
      ok,
      error: body.error ? String(body.error) : undefined,
    })
    if (!job) return res.status(404).json({ error: 'job_not_found' })

    return res.status(200).json({ ok: true, job })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/queue/complete]', message)
    return res.status(500).json({ error: message })
  }
}
