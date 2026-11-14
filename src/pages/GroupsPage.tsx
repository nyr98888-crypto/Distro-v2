import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useAppData } from '../context/AppDataContext'
import { useLanguage } from '../context/LanguageContext'
import { connectAndAutoSyncExtension } from '../lib/extensionBridge'

/** Automatic groups view — Turso / extension sync (no paste, no demos). */
export function GroupsPage() {
  const {
    data,
    toggleGroupActive,
    refreshGroups,
    selectedGroupIds,
    setSelectedGroupIds,
    selectAllGroups,
    groupsLoading,
  } = useAppData()
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const [statusMsg, setStatusMsg] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.groups.filter(
      (g) => !q || g.name.toLowerCase().includes(q) || g.fbGroupId.includes(q),
    )
  }, [data.groups, query])

  async function onRefresh() {
    setStatusMsg(null)
    void connectAndAutoSyncExtension()
    const result = await refreshGroups({ showLoading: true })
    if (!result.ok) {
      setStatusMsg(result.error || 'רענון נכשל')
      return
    }
    setStatusMsg(
      result.count > 0 ? `נטענו ${result.count} קבוצות` : 'אין קבוצות בשרת — סנכרנו מהתוסף',
    )
  }

  function onSelectAll() {
    if (filtered.length === 0) {
      setStatusMsg('אין קבוצות לבחירה — לחצו רענון או סנכרנו מהתוסף')
      return
    }
    const ids = filtered.map((g) => g.id)
    setSelectedGroupIds(ids)
    // Also select all active groups for the campaign composer
    selectAllGroups()
    setSelectedGroupIds(ids)
    setStatusMsg(`נבחרו ${ids.length} קבוצות לקמפיין`)
  }

  function toggleSelect(id: string) {
    setSelectedGroupIds(
      selectedGroupIds.includes(id)
        ? selectedGroupIds.filter((x) => x !== id)
        : [...selectedGroupIds, id],
    )
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
            {` · ${data.groups.length} קבוצות`}
            {selectedGroupIds.length > 0 ? ` · נבחרו ${selectedGroupIds.length}` : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-2"
            disabled={groupsLoading}
            onClick={() => void onRefresh()}
          >
            {groupsLoading ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                טוען…
              </>
            ) : (
              'רענון'
            )}
          </button>
          <button type="button" className="btn-primary" onClick={onSelectAll}>
            בחר הכל
          </button>
        </div>
      </div>

      {statusMsg && (
        <div className="rounded-lg border border-line-soft bg-white px-4 py-2 text-sm text-slate-700">
          {statusMsg}
        </div>
      )}

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
            לחצו «משוך וסנכרן קבוצות» בתוסף v1.0.9 ואז «רענון» כאן.
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
                    checked={selectedGroupIds.includes(g.id)}
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
