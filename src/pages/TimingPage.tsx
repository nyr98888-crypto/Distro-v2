import { useCallback, useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import { useAppData } from '../context/AppDataContext'
import { useLanguage } from '../context/LanguageContext'
import { appConfig } from '../lib/config'
import { authHeaders } from '../lib/sessionStore'

type QueueJobView = {
  id: string
  groupName: string
  content: string
  scheduledAt: string
  status: string
  displayStatus: string
  urgent: boolean
  msUntilDue: number
  lastError?: string | null
}

/**
 * Campaign composer + live queue with 1-hour auto-priority.
 * Click flow: בחר הכל → הפעל פרסום
 */
export function TimingPage() {
  const {
    data,
    refreshGroups,
    selectedGroupIds,
    setSelectedGroupIds,
    selectAllGroups,
  } = useAppData()
  const { t } = useLanguage()

  const [content, setContent] = useState('')
  const [mediaUrl, setMediaUrl] = useState('')
  const [scheduledAt, setScheduledAt] = useState(() => {
    const d = new Date(Date.now() + 5 * 60 * 1000)
    d.setSeconds(0, 0)
    return d.toISOString().slice(0, 16)
  })
  const [minDelay, setMinDelay] = useState(data.settings.minDelaySeconds || 45)
  const [maxDelay, setMaxDelay] = useState(data.settings.maxDelaySeconds || 120)
  const [urgentWindow, setUrgentWindow] = useState(60)
  const [autoPrioritize, setAutoPrioritize] = useState(true)
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)
  const [jobs, setJobs] = useState<QueueJobView[]>([])

  const activeGroups = useMemo(() => data.groups.filter((g) => g.active), [data.groups])
  const selected = selectedGroupIds
  const selectAll = () => selectAllGroups()

  const loadQueue = useCallback(async () => {
    try {
      const res = await fetch(appConfig.queueUrl, {
        cache: 'no-store',
        credentials: 'include',
        headers: authHeaders(),
      })
      if (!res.ok) return
      const json = (await res.json()) as { jobs?: QueueJobView[] }
      setJobs(Array.isArray(json.jobs) ? json.jobs : [])
    } catch {
      /* ignore */
    }
  }, [])

  useEffect(() => {
    void refreshGroups()
    void loadQueue()
    const id = window.setInterval(() => void loadQueue(), 20000)
    return () => window.clearInterval(id)
  }, [refreshGroups, loadQueue])

  async function publishCampaign() {
    if (!content.trim()) {
      setFlash('כתבו תוכן לפוסט')
      return
    }
    if (selectedGroupIds.length === 0) {
      setFlash('לחצו «בחר הכל» או סמנו קבוצות')
      return
    }
    setBusy(true)
    setFlash(null)
    try {
      const scheduledIso = new Date(scheduledAt).toISOString()
      const res = await fetch(appConfig.campaignsUrl, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders(),
        },
        body: JSON.stringify({
          content: content.trim(),
          mediaUrl: mediaUrl.trim() || null,
          groupIds: selectedGroupIds,
          scheduledAt: scheduledIso,
          humanDelayMinSec: minDelay,
          humanDelayMaxSec: Math.max(minDelay, maxDelay),
          urgentWindowMinutes: urgentWindow,
          autoPrioritize,
        }),
      })
      const body = (await res.json().catch(() => ({}))) as {
        error?: string
        jobCount?: number
      }
      if (!res.ok) throw new Error(body.error || `שגיאה ${res.status}`)
      setFlash(`הקמפיין הופעל — ${body.jobCount ?? selectedGroupIds.length} משימות בתור`)
      setContent('')
      void loadQueue()
    } catch (err) {
      setFlash(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('greeting')}</h1>
        <p className="mt-1 text-sm text-slate-500">
          בחר הכל → הפעל פרסום · עדיפות אוטומטית בטווח של שעה
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Kpi label={t('syncedGroups')} value={data.stats.syncedGroups} />
        <Kpi label="נבחרו" value={selected.length} />
        <Kpi label="בתור" value={jobs.filter((j) => j.status !== 'published').length} />
      </div>

      <section className="card space-y-4 p-5">
        <h2 className="text-base font-semibold">תוכן הפרסום</h2>
        <textarea
          className="input min-h-28 resize-y"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="כתבו כאן את הטקסט שיפורסם לקבוצות…"
        />
        <input
          className="input"
          value={mediaUrl}
          onChange={(e) => setMediaUrl(e.target.value)}
          placeholder="קישור מדיה (אופציונלי)"
          dir="ltr"
        />
        <label className="block space-y-1 text-sm">
          <span className="font-medium text-slate-700">תאריך ושעה</span>
          <input
            className="input"
            type="datetime-local"
            value={scheduledAt}
            onChange={(e) => setScheduledAt(e.target.value)}
          />
        </label>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-700">השהיה מינ׳ (שניות)</span>
            <input
              className="input"
              type="number"
              min={0}
              value={minDelay}
              onChange={(e) => setMinDelay(Number(e.target.value))}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-700">השהיה מקס׳ (שניות)</span>
            <input
              className="input"
              type="number"
              min={0}
              value={maxDelay}
              onChange={(e) => setMaxDelay(Number(e.target.value))}
            />
          </label>
          <label className="block space-y-1 text-sm">
            <span className="font-medium text-slate-700">חלון דחיפות (דק׳)</span>
            <input
              className="input"
              type="number"
              min={1}
              value={urgentWindow}
              onChange={(e) => setUrgentWindow(Number(e.target.value))}
            />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            checked={autoPrioritize}
            onChange={(e) => setAutoPrioritize(e.target.checked)}
          />
          עדיפות אוטומטית בטווח של שעה
        </label>
      </section>

      <section className="card space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">קבוצות יעד</h2>
            <p className="text-xs text-slate-500">
              {activeGroups.length === 0
                ? 'ממתין לסנכרון מהתוסף…'
                : `${activeGroups.length} קבוצות מוכנות`}
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={selectAll}>
            בחר הכל
          </button>
        </div>
        {activeGroups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-soft px-4 py-6 text-center text-sm text-slate-500">
            סנכרנו קבוצות מהתוסף — הן יופיעו כאן אוטומטית
          </div>
        ) : (
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-line-soft p-2">
            {activeGroups.map((g) => (
              <li key={g.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={selectedGroupIds.includes(g.id)}
                    onChange={() =>
                      setSelectedGroupIds(
                        selectedGroupIds.includes(g.id)
                          ? selectedGroupIds.filter((x) => x !== g.id)
                          : [...selectedGroupIds, g.id],
                      )
                    }
                  />
                  <span className="truncate text-sm font-medium">{g.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      <button
        type="button"
        className="btn-primary w-full py-3 text-base"
        disabled={busy}
        onClick={() => void publishCampaign()}
      >
        {busy ? 'מפעיל…' : 'הפעל פרסום'}
      </button>

      {flash && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {flash}
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            תור פרסום חי
          </h2>
          <button type="button" className="text-xs font-medium text-brand-indigo" onClick={() => void loadQueue()}>
            רענון תור
          </button>
        </div>
        {jobs.length === 0 ? (
          <div className="card p-6 text-center text-sm text-slate-500">אין משימות בתור</div>
        ) : (
          <ul className="space-y-2">
            {jobs.slice(0, 40).map((j) => (
              <li key={j.id} className="card flex items-start justify-between gap-3 p-4">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-900">{j.groupName}</div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">{j.content}</div>
                  <div className="mt-1 text-[11px] text-slate-400">
                    {new Date(j.scheduledAt).toLocaleString()}
                    {j.urgent ? ' · בתוך שעה' : ''}
                  </div>
                </div>
                <StatusPill status={j.displayStatus || j.status} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Kpi({ label, value }: { label: string; value: number }) {
  return (
    <div className="card p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className="mt-2 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: 'ממתין', className: 'bg-slate-100 text-slate-700' },
    urgent: { label: 'בעדיפות - בתוך שעה', className: 'bg-amber-50 text-amber-800' },
    claimed: { label: 'בעדיפות - בתוך שעה', className: 'bg-amber-50 text-amber-800' },
    published: { label: 'פורסם', className: 'bg-emerald-50 text-emerald-700' },
    failed: { label: 'נכשל', className: 'bg-red-50 text-red-700' },
    paused: { label: 'מושהה', className: 'bg-slate-100 text-slate-600' },
  }
  const cfg = map[status] || map.pending
  return (
    <span className={clsx('shrink-0 rounded-md px-2 py-1 text-[11px] font-medium', cfg.className)}>
      {cfg.label}
    </span>
  )
}
