import { useMemo, useState } from 'react'
import clsx from 'clsx'
import type { DayOfWeek, ScheduleStatus, ScheduledPost } from '@shared/types'
import { useAppData } from '../context/AppDataContext'
import { useLanguage } from '../context/LanguageContext'

const DAYS: DayOfWeek[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

export function TimingPage() {
  const { data, upsertSchedule, setScheduleStatus, duplicateSchedule, deleteSchedule } =
    useAppData()
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<'all' | ScheduleStatus>('all')
  const [collectionId, setCollectionId] = useState('all')
  const [menuId, setMenuId] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [editing, setEditing] = useState<ScheduledPost | null>(null)

  const filtered = useMemo(() => {
    return data.schedules.filter((s) => {
      const q = query.trim().toLowerCase()
      const matchesQuery =
        !q ||
        s.title.toLowerCase().includes(q) ||
        s.body.toLowerCase().includes(q) ||
        s.collectionName.toLowerCase().includes(q)
      const matchesStatus = status === 'all' || s.status === status
      const matchesCollection = collectionId === 'all' || s.collectionId === collectionId
      return matchesQuery && matchesStatus && matchesCollection
    })
  }, [data.schedules, query, status, collectionId])

  function openCreate() {
    setEditing(null)
    setDrawerOpen(true)
  }

  function openEdit(schedule: ScheduledPost) {
    setEditing(schedule)
    setDrawerOpen(true)
    setMenuId(null)
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{t('greeting')}</h1>
          <p className="mt-1 text-sm text-slate-500">{t('timing')}</p>
        </div>
        <button type="button" className="btn-primary w-full sm:w-auto" onClick={openCreate}>
          {t('newSchedule')}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label={t('syncedGroups')} value={data.stats.syncedGroups} />
        <Kpi label={t('activeSchedules')} value={data.stats.activeSchedules} />
        <Kpi label={t('postsPublished')} value={data.stats.postsPublished} />
      </div>

      <div className="card flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <input
          className="input sm:flex-1"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchSchedules')}
        />
        <select
          className="input sm:w-40"
          value={status}
          onChange={(e) => setStatus(e.target.value as 'all' | ScheduleStatus)}
        >
          <option value="all">{t('allStatuses')}</option>
          <option value="scheduled">{t('scheduled')}</option>
          <option value="paused">{t('paused')}</option>
          <option value="draft">{t('draft')}</option>
        </select>
        <select
          className="input sm:w-48"
          value={collectionId}
          onChange={(e) => setCollectionId(e.target.value)}
        >
          <option value="all">{t('allCollections')}</option>
          {data.collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">{t('noSchedules')}</div>
      ) : (
        <>
          {/* Desktop table */}
          <div className="card hidden overflow-hidden md:block">
            <table className="w-full text-start text-sm">
              <thead className="border-b border-line-soft bg-slate-50/80 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Post</th>
                  <th className="px-4 py-3 font-medium">Cadence</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium" />
                </tr>
              </thead>
              <tbody>
                {filtered.map((s) => (
                  <tr key={s.id} className="border-b border-line-soft last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Thumb urls={s.mediaUrls} />
                        <div>
                          <div className="font-medium text-slate-900">{s.title}</div>
                          <div className="text-xs text-slate-500">{s.collectionName || '—'}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {t('weekly')} · {s.days.join(', ')} · {s.time}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={s.status} labels={t} />
                    </td>
                    <td className="relative px-4 py-3 text-end">
                      <ActionMenu
                        open={menuId === s.id}
                        onToggle={() => setMenuId(menuId === s.id ? null : s.id)}
                        onPause={() => {
                          setScheduleStatus(s.id, s.status === 'paused' ? 'scheduled' : 'paused')
                          setMenuId(null)
                        }}
                        onEdit={() => openEdit(s)}
                        onDuplicate={() => {
                          duplicateSchedule(s.id)
                          setMenuId(null)
                        }}
                        onDelete={() => {
                          deleteSchedule(s.id)
                          setMenuId(null)
                        }}
                        pauseLabel={s.status === 'paused' ? t('resume') : t('pause')}
                        editLabel={t('edit')}
                        duplicateLabel={t('duplicate')}
                        deleteLabel={t('delete')}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {filtered.map((s) => (
              <div key={s.id} className="card p-4">
                <div className="flex gap-3">
                  <Thumb urls={s.mediaUrls} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-medium text-slate-900">{s.title}</div>
                        <div className="text-xs text-slate-500">{s.collectionName || '—'}</div>
                      </div>
                      <StatusBadge status={s.status} labels={t} />
                    </div>
                    <div className="mt-2 text-xs text-slate-600">
                      {t('weekly')} · {s.days.join(', ')} · {s.time}
                    </div>
                    <div className="relative mt-3 flex gap-2">
                      <button type="button" className="btn-secondary text-xs" onClick={() => openEdit(s)}>
                        {t('edit')}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary text-xs"
                        onClick={() =>
                          setScheduleStatus(s.id, s.status === 'paused' ? 'scheduled' : 'paused')
                        }
                      >
                        {s.status === 'paused' ? t('resume') : t('pause')}
                      </button>
                      <button
                        type="button"
                        className="btn-secondary text-xs text-red-600"
                        onClick={() => deleteSchedule(s.id)}
                      >
                        {t('delete')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {drawerOpen && (
        <ScheduleDrawer
          schedule={editing}
          collections={data.collections}
          onClose={() => setDrawerOpen(false)}
          onSave={(input) => {
            upsertSchedule(input)
            setDrawerOpen(false)
          }}
          labels={{
            save: t('save'),
            cancel: t('cancel'),
            draft: t('draft'),
            scheduled: t('scheduled'),
          }}
        />
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

function Thumb({ urls }: { urls: string[] }) {
  const first = urls[0]
  return (
    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-slate-100">
      {first ? (
        <img src={first} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[10px] text-slate-400">
          No media
        </div>
      )}
      {urls.length > 1 && (
        <span className="absolute bottom-0.5 end-0.5 rounded bg-black/70 px-1 text-[10px] text-white">
          +{urls.length - 1}
        </span>
      )}
    </div>
  )
}

function StatusBadge({
  status,
  labels,
}: {
  status: ScheduleStatus
  labels: ReturnType<typeof useLanguage>['t']
}) {
  const map: Record<ScheduleStatus, string> = {
    scheduled: 'bg-emerald-50 text-emerald-700',
    paused: 'bg-amber-50 text-amber-700',
    draft: 'bg-slate-100 text-slate-600',
    completed: 'bg-indigo-50 text-indigo-700',
  }
  const text =
    status === 'scheduled'
      ? labels('scheduled')
      : status === 'paused'
        ? labels('paused')
        : status === 'draft'
          ? labels('draft')
          : status
  return (
    <span className={clsx('inline-flex rounded-md px-2 py-0.5 text-xs font-medium', map[status])}>
      {text}
    </span>
  )
}

function ActionMenu({
  open,
  onToggle,
  onPause,
  onEdit,
  onDuplicate,
  onDelete,
  pauseLabel,
  editLabel,
  duplicateLabel,
  deleteLabel,
}: {
  open: boolean
  onToggle: () => void
  onPause: () => void
  onEdit: () => void
  onDuplicate: () => void
  onDelete: () => void
  pauseLabel: string
  editLabel: string
  duplicateLabel: string
  deleteLabel: string
}) {
  return (
    <div className="relative inline-block text-start">
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
        onClick={onToggle}
        aria-label="Actions"
      >
        ⋯
      </button>
      {open && (
        <div className="absolute end-0 z-20 mt-1 w-40 overflow-hidden rounded-card border border-line-soft bg-white shadow-modal">
          <button type="button" className="block w-full px-3 py-2 text-start text-sm hover:bg-slate-50" onClick={onPause}>
            {pauseLabel}
          </button>
          <button type="button" className="block w-full px-3 py-2 text-start text-sm hover:bg-slate-50" onClick={onEdit}>
            {editLabel}
          </button>
          <button type="button" className="block w-full px-3 py-2 text-start text-sm hover:bg-slate-50" onClick={onDuplicate}>
            {duplicateLabel}
          </button>
          <button type="button" className="block w-full px-3 py-2 text-start text-sm text-red-600 hover:bg-red-50" onClick={onDelete}>
            {deleteLabel}
          </button>
        </div>
      )}
    </div>
  )
}

function ScheduleDrawer({
  schedule,
  collections,
  onClose,
  onSave,
  labels,
}: {
  schedule: ScheduledPost | null
  collections: { id: string; name: string }[]
  onClose: () => void
  onSave: (input: {
    id?: string
    title: string
    body: string
    mediaUrls: string[]
    collectionId: string | null
    days: DayOfWeek[]
    time: string
    status: ScheduleStatus
  }) => void
  labels: { save: string; cancel: string; draft: string; scheduled: string }
}) {
  const [title, setTitle] = useState(schedule?.title ?? '')
  const [body, setBody] = useState(schedule?.body ?? '')
  const [collectionId, setCollectionId] = useState(schedule?.collectionId ?? collections[0]?.id ?? '')
  const [days, setDays] = useState<DayOfWeek[]>(schedule?.days ?? ['Mon'])
  const [time, setTime] = useState(schedule?.time ?? '10:00')
  const [status, setStatus] = useState<ScheduleStatus>(schedule?.status ?? 'draft')
  const [mediaUrls, setMediaUrls] = useState<string[]>(schedule?.mediaUrls ?? [])

  function toggleDay(day: DayOfWeek) {
    setDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]))
  }

  function onPickImages(files: FileList | null) {
    if (!files) return
    const urls = Array.from(files).map((f) => URL.createObjectURL(f))
    setMediaUrls((prev) => [...prev, ...urls].slice(0, 6))
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <button type="button" className="flex-1" aria-label="Close" onClick={onClose} />
      <aside className="flex h-full w-full max-w-md flex-col bg-white shadow-drawer">
        <div className="border-b border-line-soft px-5 py-4">
          <h2 className="text-lg font-semibold">{schedule ? 'Edit Schedule' : 'New Schedule'}</h2>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-slate-700">Title</span>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-slate-700">Post copy</span>
            <textarea
              className="input min-h-28 resize-y"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-slate-700">Images</span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="block w-full text-sm"
              onChange={(e) => onPickImages(e.target.files)}
            />
            {mediaUrls.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {mediaUrls.map((url) => (
                  <img key={url} src={url} alt="" className="h-14 w-14 rounded-lg object-cover" />
                ))}
              </div>
            )}
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-slate-700">Collection</span>
            <select
              className="input"
              value={collectionId}
              onChange={(e) => setCollectionId(e.target.value)}
            >
              {collections.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <div className="space-y-1.5 text-sm">
            <span className="font-medium text-slate-700">Days</span>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleDay(day)}
                  className={clsx(
                    'min-h-touch min-w-touch rounded-lg border px-2 text-xs font-medium',
                    days.includes(day)
                      ? 'border-brand-indigo bg-indigo-50 text-brand-indigo'
                      : 'border-line-soft text-slate-600',
                  )}
                >
                  {day}
                </button>
              ))}
            </div>
          </div>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-slate-700">Time</span>
            <input className="input" type="time" value={time} onChange={(e) => setTime(e.target.value)} />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-slate-700">Status</span>
            <select
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value as ScheduleStatus)}
            >
              <option value="draft">{labels.draft}</option>
              <option value="scheduled">{labels.scheduled}</option>
              <option value="paused">Paused</option>
            </select>
          </label>
        </div>
        <div className="flex gap-2 border-t border-line-soft px-5 py-4">
          <button type="button" className="btn-secondary flex-1" onClick={onClose}>
            {labels.cancel}
          </button>
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={!title.trim() || days.length === 0}
            onClick={() =>
              onSave({
                id: schedule?.id,
                title: title.trim(),
                body,
                mediaUrls,
                collectionId: collectionId || null,
                days,
                time,
                status,
              })
            }
          >
            {labels.save}
          </button>
        </div>
      </aside>
    </div>
  )
}
