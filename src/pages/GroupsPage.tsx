import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useAppData } from '../context/AppDataContext'
import { useLanguage } from '../context/LanguageContext'
import { syncSessionToExtension, isExtensionBridgePresent } from '../lib/extensionBridge'

const FB_JOINS = 'https://www.facebook.com/groups/joins/'

/**
 * Groups come from the Chrome extension scrape (popup «משוך וסנכרן»),
 * then land in Turso via POST /api/sync-groups.
 * «רענון» only reloads the server — it does NOT scrape Facebook.
 */
export function GroupsPage() {
  const {
    data,
    toggleGroupActive,
    refreshGroups,
    selectedGroupIds,
    setSelectedGroupIds,
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

  /** Server-only reload — does not talk to Facebook. */
  async function onRefreshFromServer() {
    setStatusMsg(null)
    const result = await refreshGroups({ showLoading: true })
    if (!result.ok) {
      setStatusMsg(result.error || 'רענון מהשרת נכשל')
      return
    }
    if (result.count > 0) {
      setStatusMsg(`נטענו ${result.count} קבוצות מהשרת`)
      return
    }
    setStatusMsg(
      'אין קבוצות בשרת עדיין. לחצו «סנכרן מהתוסף» — המשיכה נעשית בחלון התוסף, לא מכאן.',
    )
  }

  /**
   * Kick the real sync path: ensure auth is in the extension, open Facebook
   * groups page, and tell the user to press the extension popup sync button
   * (v1.0.9 only scrapes from the popup — we cannot change that build).
   */
  async function onSyncViaExtension() {
    setStatusMsg(null)
    const bridge = isExtensionBridgePresent()
    await syncSessionToExtension()

    try {
      window.open(FB_JOINS, '_blank', 'noopener,noreferrer')
    } catch {
      /* ignore */
    }

    setStatusMsg(
      bridge
        ? 'נפתח פייסבוק. לחצו על אייקון תוסף Distro בסרגל → «משוך וסנכרן קבוצות» → חזרו לכאן ולחצו «רענון מהשרת».'
        : 'התוסף לא זוהה בעמוד. ודאו ש-Distro 1.0.9 פעיל עם גישה ל-distrov2-teal.vercel.app, רעננו את העמוד, ואז לחצו שוב.',
    )

    // After the user syncs from the popup, poll the server a few times.
    window.setTimeout(() => void refreshGroups(), 8000)
    window.setTimeout(() => void refreshGroups(), 16000)
    window.setTimeout(() => void refreshGroups({ showLoading: true }), 25000)
  }

  function onSelectAll() {
    const pool = filtered.length > 0 ? filtered : data.groups.filter((g) => g.active)
    if (pool.length === 0) {
      setStatusMsg('אין קבוצות לבחירה — קודם סנכרנו מהתוסף')
      return
    }
    const ids = pool.map((g) => g.id)
    setSelectedGroupIds(ids)
    setStatusMsg(`נבחרו ${ids.length} קבוצות — עברו ל«תזמונים» לפרסום`)
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
            המשיכה מפייסבוק = תוסף Distro 1.0.9. האתר רק מציג מה שנשמר בשרת.
          </p>
          <p className="mt-0.5 text-xs text-slate-400">
            {t('lastSync')}:{' '}
            {data.settings.lastGroupSyncAt
              ? new Date(data.settings.lastGroupSyncAt).toLocaleString()
              : t('never')}
            {` · ${data.groups.length} קבוצות`}
            {selectedGroupIds.length > 0 ? ` · נבחרו ${selectedGroupIds.length}` : ''}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            onClick={() => void onSyncViaExtension()}
          >
            סנכרן מהתוסף
          </button>
          <button
            type="button"
            className="btn-secondary inline-flex items-center gap-2"
            disabled={groupsLoading}
            onClick={() => void onRefreshFromServer()}
          >
            {groupsLoading ? (
              <>
                <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-400 border-t-transparent" />
                טוען…
              </>
            ) : (
              'רענון מהשרת'
            )}
          </button>
          <button type="button" className="btn-secondary" onClick={onSelectAll}>
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
          id="groups-search"
          name="groupsSearch"
          className="input"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('searchGroups')}
        />
      </div>

      {filtered.length === 0 ? (
        <div className="card space-y-3 p-8 text-center text-sm text-slate-500">
          <p className="font-medium text-slate-700">{t('noGroups')}</p>
          <ol className="mx-auto max-w-md list-decimal space-y-1 text-start text-xs text-slate-500">
            <li>לחצו «סנכרן מהתוסף» (נפתח פייסבוק)</li>
            <li>לחצו על אייקון התוסף בסרגל → «משוך וסנכרן קבוצות»</li>
            <li>חזרו לכאן → «רענון מהשרת»</li>
          </ol>
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
                    name={`group-${g.id}`}
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
