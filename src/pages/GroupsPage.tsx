import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useAppData } from '../context/AppDataContext'
import { useLanguage } from '../context/LanguageContext'

/** Automatic groups view — Turso/extension sync only (no paste / no demos). */
export function GroupsPage() {
  const { data, toggleGroupActive, refreshGroups } = useAppData()
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.groups.filter(
      (g) => !q || g.name.toLowerCase().includes(q) || g.fbGroupId.includes(q),
    )
  }, [data.groups, query])

  function selectAll() {
    setSelected(filtered.map((g) => g.id))
  }

  function toggleSelect(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('groups')}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {t('lastSync')}:{' '}
            {data.settings.lastGroupSyncAt
              ? new Date(data.settings.lastGroupSyncAt).toLocaleString()
              : t('never')}
            {data.groups.length > 0 ? ` · ${data.groups.length}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-secondary" onClick={() => void refreshGroups()}>
            רענון
          </button>
          <button type="button" className="btn-primary" onClick={selectAll}>
            בחר הכל
          </button>
        </div>
      </div>

      <div className="card p-3">
        <input
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchGroups')}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="card p-8 text-center text-sm text-slate-500">
          {t('noGroups')}
          <p className="mt-2 text-xs text-slate-400">
            לחצו «משוך וסנכרן קבוצות» בתוסף v1.0.9 — הקבוצות יופיעו כאן אוטומטית.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <ul className="divide-y divide-line-soft">
            {filtered.map((g) => (
              <li
                key={g.id}
                className="grid grid-cols-[40px_1fr_auto] items-center gap-3 px-4 py-3"
              >
                <label className="flex min-h-touch items-center">
                  <input
                    type="checkbox"
                    checked={selected.includes(g.id)}
                    onChange={() => toggleSelect(g.id)}
                  />
                </label>
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-900">{g.name}</div>
                  <div className="truncate text-xs text-slate-500" dir="ltr">
                    {g.url || g.fbGroupId}
                  </div>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={g.active}
                  onClick={() => toggleGroupActive(g.id)}
                  className={clsx(
                    'relative h-7 w-12 rounded-full transition',
                    g.active ? 'bg-brand-indigo' : 'bg-slate-300',
                  )}
                >
                  <span
                    className={clsx(
                      'absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition',
                      g.active ? 'start-5' : 'start-0.5',
                    )}
                  />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
