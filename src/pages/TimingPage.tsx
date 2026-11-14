import { useMemo, useState } from 'react'
import clsx from 'clsx'
import type { DayOfWeek, ScheduledPost } from '@shared/types'
import { useAppData } from '../context/AppDataContext'
import { useLanguage } from '../context/LanguageContext'

const DAYS: DayOfWeek[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/**
 * Core 3-click product surface after Google login:
 *  2) בחר הכל — select every synced group into the campaign
 *  3) הפעל פרסום — schedule / start hands-free posting
 */
export function TimingPage() {
  const { data, upsertSchedule, setScheduleStatus, deleteSchedule, updateSettings } = useAppData()
  const { t } = useLanguage()

  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const [time, setTime] = useState('10:00')
  const [days, setDays] = useState<DayOfWeek[]>(['Sun', 'Mon', 'Tue', 'Wed', 'Thu'])
  const [publishing, setPublishing] = useState(false)
  const [flash, setFlash] = useState<string | null>(null)

  const activeGroups = useMemo(() => data.groups.filter((g) => g.active), [data.groups])

  const allSelected =
    activeGroups.length > 0 && selectedGroupIds.length === activeGroups.length

  function selectAllGroups() {
    setSelectedGroupIds(activeGroups.map((g) => g.id))
    setFlash(
      activeGroups.length > 0
        ? `נבחרו ${activeGroups.length} קבוצות לקמפיין`
        : 'עדיין אין קבוצות — הן נמשכות אוטומטית מהתוסף ברקע',
    )
  }

  function toggleGroup(id: string) {
    setSelectedGroupIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  function publishCampaign() {
    if (!body.trim() && !title.trim()) {
      setFlash('כתבו תוכן לפוסט לפני הפעלת פרסום')
      return
    }
    if (selectedGroupIds.length === 0) {
      setFlash('לחצו «בחר הכל» כדי לטעון את הקבוצות לקמפיין')
      return
    }
    setPublishing(true)
    const chosen = activeGroups.filter((g) => selectedGroupIds.includes(g.id))
    const campaignTitle = title.trim() || body.trim().slice(0, 48) || 'קמפיין Distro'
    upsertSchedule({
      title: campaignTitle,
      body: body.trim() || campaignTitle,
      mediaUrls: [],
      collectionId: null,
      days,
      time,
      status: 'scheduled',
    })
    updateSettings({
      postsPublished: (data.settings.postsPublished || 0) + 1,
      lastGroupSyncAt: data.settings.lastGroupSyncAt || new Date().toISOString(),
    })
    setFlash(`הפרסום הופעל ל־${chosen.length} קבוצות — רץ ברקע`)
    setTitle('')
    setBody('')
    setPublishing(false)
  }

  const activeCampaigns = data.schedules.filter((s) => s.status === 'scheduled')

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('greeting')}</h1>
        <p className="mt-1 text-sm text-slate-500">
          שלושה צעדים: Google → בחר הכל → הפעל פרסום
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Kpi label={t('syncedGroups')} value={data.stats.syncedGroups} />
        <Kpi label="נבחרו לקמפיין" value={selectedGroupIds.length} />
        <Kpi label={t('activeSchedules')} value={data.stats.activeSchedules} />
      </div>

      <section className="card space-y-4 p-5">
        <h2 className="text-base font-semibold text-slate-900">תוכן הפרסום</h2>
        <input
          className="input"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="כותרת (אופציונלי)"
        />
        <textarea
          className="input min-h-28 resize-y"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="כתבו כאן את הטקסט שיפורסם לקבוצות…"
        />
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm text-slate-600">
            שעה{' '}
            <input
              className="input mt-1 w-auto"
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
            />
          </label>
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((day) => (
              <button
                key={day}
                type="button"
                onClick={() =>
                  setDays((prev) =>
                    prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
                  )
                }
                className={clsx(
                  'rounded-lg border px-2 py-1 text-xs font-medium',
                  days.includes(day)
                    ? 'border-brand-indigo bg-indigo-50 text-brand-indigo'
                    : 'border-line-soft text-slate-500',
                )}
              >
                {day}
              </button>
            ))}
          </div>
        </div>
      </section>

      <section className="card space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">קבוצות לקמפיין</h2>
            <p className="text-xs text-slate-500">
              {activeGroups.length === 0
                ? 'הקבוצות נמשכות אוטומטית אחרי Google — אין צורך בסנכרון ידני'
                : `${activeGroups.length} קבוצות מוכנות`}
            </p>
          </div>
          <button type="button" className="btn-secondary" onClick={selectAllGroups}>
            בחר הכל
          </button>
        </div>

        {activeGroups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line-soft px-4 py-6 text-center text-sm text-slate-500">
            ממתין לקבוצות מהתוסף ברקע…
          </div>
        ) : (
          <ul className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-line-soft p-2">
            {activeGroups.map((g) => (
              <li key={g.id}>
                <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 hover:bg-slate-50">
                  <input
                    type="checkbox"
                    checked={selectedGroupIds.includes(g.id)}
                    onChange={() => toggleGroup(g.id)}
                  />
                  <span className="min-w-0 truncate text-sm font-medium text-slate-800">{g.name}</span>
                </label>
              </li>
            ))}
          </ul>
        )}

        {allSelected && activeGroups.length > 0 && (
          <p className="text-xs font-medium text-emerald-700">כל הקבוצות נבחרו לקמפיין</p>
        )}
      </section>

      <button
        type="button"
        className="btn-primary w-full py-3 text-base"
        disabled={publishing}
        onClick={publishCampaign}
      >
        {publishing ? 'מפעיל…' : 'הפעל פרסום'}
      </button>

      {flash && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          {flash}
        </div>
      )}

      {activeCampaigns.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            קמפיינים פעילים
          </h2>
          {activeCampaigns.map((s) => (
            <CampaignRow
              key={s.id}
              schedule={s}
              onPause={() => setScheduleStatus(s.id, 'paused')}
              onDelete={() => deleteSchedule(s.id)}
            />
          ))}
        </section>
      )}
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

function CampaignRow({
  schedule,
  onPause,
  onDelete,
}: {
  schedule: ScheduledPost
  onPause: () => void
  onDelete: () => void
}) {
  return (
    <div className="card flex items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="truncate font-medium text-slate-900">{schedule.title}</div>
        <div className="mt-1 text-xs text-slate-500">
          {schedule.days.join(', ')} · {schedule.time} · מתוזמן
        </div>
      </div>
      <div className="flex shrink-0 gap-2">
        <button type="button" className="btn-secondary text-xs" onClick={onPause}>
          השהה
        </button>
        <button type="button" className="btn-secondary text-xs text-red-600" onClick={onDelete}>
          מחק
        </button>
      </div>
    </div>
  )
}
