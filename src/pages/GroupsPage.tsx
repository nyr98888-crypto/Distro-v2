import { useMemo, useState } from 'react'
import clsx from 'clsx'
import type { FacebookGroup } from '@shared/types'
import { useAppData } from '../context/AppDataContext'
import { useLanguage } from '../context/LanguageContext'
import { mergeGroups, parseFacebookGroupsFromText } from '../lib/groupPaste'

export function GroupsPage() {
  const { data, toggleGroupActive, addCollection, refreshGroups, syncGroupsToServer } =
    useAppData()
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [collectionOpen, setCollectionOpen] = useState(false)
  const [collectionName, setCollectionName] = useState('')

  const [pasteOpen, setPasteOpen] = useState(data.groups.length === 0)
  const [pasteText, setPasteText] = useState('')
  const [parsed, setParsed] = useState<FacebookGroup[]>([])
  const [pasteSelected, setPasteSelected] = useState<string[]>([])
  const [pasteBusy, setPasteBusy] = useState(false)
  const [pasteMsg, setPasteMsg] = useState<string | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.groups.filter(
      (g) => !q || g.name.toLowerCase().includes(q) || g.fbGroupId.includes(q),
    )
  }, [data.groups, query])

  function toggleSelect(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function toggleAll() {
    if (selected.length === filtered.length) setSelected([])
    else setSelected(filtered.map((g) => g.id))
  }

  function onPasteChange(value: string) {
    setPasteText(value)
    const groups = parseFacebookGroupsFromText(value)
    setParsed(groups)
    setPasteSelected(groups.map((g) => g.fbGroupId))
    setPasteMsg(null)
  }

  function togglePasteSelect(fbGroupId: string) {
    setPasteSelected((prev) =>
      prev.includes(fbGroupId) ? prev.filter((x) => x !== fbGroupId) : [...prev, fbGroupId],
    )
  }

  async function savePastedGroups() {
    const chosen = parsed.filter((g) => pasteSelected.includes(g.fbGroupId))
    if (chosen.length === 0) {
      setPasteMsg('לא נבחרו קבוצות לשמירה')
      return
    }
    setPasteBusy(true)
    setPasteMsg(null)
    try {
      const merged = mergeGroups(data.groups, chosen)
      const result = await syncGroupsToServer(merged)
      setPasteMsg(
        result.ok
          ? `נשמרו ${chosen.length} קבוצות לחשבון`
          : `נשמרו מקומית ${chosen.length} קבוצות (סנכרון שרת נכשל)`,
      )
      setPasteText('')
      setParsed([])
      setPasteSelected([])
      void refreshGroups()
    } finally {
      setPasteBusy(false)
    }
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
            {data.groups.length > 0 ? ` · ${data.groups.length} קבוצות` : ''}
          </p>
        </div>
        <button type="button" className="btn-primary" onClick={() => setCollectionOpen(true)}>
          {t('newCollection')}
        </button>
      </div>

      {/* Optional paste fallback — not a sync wizard */}
      <div className="card overflow-hidden">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-start"
          onClick={() => setPasteOpen((v) => !v)}
        >
          <div>
            <div className="text-sm font-semibold text-slate-900">ייבוא מהיר של קבוצות</div>
            <div className="text-xs text-slate-500">הדבק קבוצות מ־facebook.com/groups/joins/</div>
          </div>
          <span className="text-xs font-medium text-brand-indigo">
            {pasteOpen ? 'סגור' : 'הדבק קבוצות'}
          </span>
        </button>

        {pasteOpen && (
          <div className="space-y-3 border-t border-line-soft px-4 py-4">
            <textarea
              className="input min-h-[120px] font-mono text-xs"
              value={pasteText}
              onChange={(e) => onPasteChange(e.target.value)}
              placeholder={
                'הדביקו כאן קישורי קבוצות או טקסט שהועתק מעמוד הקבוצות של פייסבוק…\n' +
                'לדוגמה: https://www.facebook.com/groups/123456789'
              }
              dir="ltr"
            />

            {parsed.length > 0 && (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-slate-600">
                    נמצאו {parsed.length} קבוצות ייחודיות
                  </span>
                  <button
                    type="button"
                    className="text-xs font-medium text-brand-indigo"
                    onClick={() => setPasteSelected(parsed.map((g) => g.fbGroupId))}
                  >
                    בחר הכל
                  </button>
                </div>
                <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-line-soft p-2">
                  {parsed.map((g) => (
                    <li key={g.fbGroupId} className="flex items-center gap-2 rounded-md px-2 py-1.5">
                      <input
                        type="checkbox"
                        checked={pasteSelected.includes(g.fbGroupId)}
                        onChange={() => togglePasteSelect(g.fbGroupId)}
                      />
                      <div className="min-w-0 flex-1" dir="auto">
                        <div className="truncate text-sm font-medium">{g.name}</div>
                        <div className="truncate text-[11px] text-slate-500" dir="ltr">
                          {g.url}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                className="btn-primary"
                disabled={pasteBusy || pasteSelected.length === 0}
                onClick={() => void savePastedGroups()}
              >
                {pasteBusy ? 'שומר…' : `שמור ${pasteSelected.length || ''} קבוצות לחשבון`}
              </button>
              {pasteMsg && <span className="text-sm text-emerald-700">{pasteMsg}</span>}
            </div>
          </div>
        )}
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
            הקבוצות יופיעו כאן אוטומטית אחרי שהתוסף מסנכרן — או דרך הייבוא המהיר למעלה.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="hidden border-b border-line-soft bg-slate-50/80 px-4 py-3 text-xs font-medium uppercase tracking-wide text-slate-500 md:grid md:grid-cols-[40px_1fr_120px_1fr_90px] md:gap-3">
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={selected.length === filtered.length && filtered.length > 0}
                onChange={toggleAll}
              />
            </label>
            <span>Group</span>
            <span>Members</span>
            <span>Collections</span>
            <span>Active</span>
          </div>

          <ul className="divide-y divide-line-soft">
            {filtered.map((g) => {
              const tags = data.collections.filter((c) => g.collectionIds.includes(c.id))
              return (
                <li
                  key={g.id}
                  className="grid grid-cols-[40px_1fr_auto] items-center gap-3 px-4 py-3 md:grid-cols-[40px_1fr_120px_1fr_90px]"
                >
                  <label className="flex min-h-touch items-center">
                    <input
                      type="checkbox"
                      checked={selected.includes(g.id)}
                      onChange={() => toggleSelect(g.id)}
                    />
                  </label>

                  <div className="flex min-w-0 items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-600">
                      {g.name.slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate font-medium text-slate-900">{g.name}</div>
                      <div className="truncate text-xs text-slate-500">{g.fbGroupId}</div>
                    </div>
                  </div>

                  <div className="hidden text-sm text-slate-600 md:block">
                    {g.memberCount.toLocaleString()}
                  </div>

                  <div className="col-span-3 flex flex-wrap gap-1 md:col-span-1">
                    {tags.length === 0 ? (
                      <span className="text-xs text-slate-400">—</span>
                    ) : (
                      tags.map((c) => (
                        <span
                          key={c.id}
                          className="rounded-md px-2 py-0.5 text-[11px] font-medium text-white"
                          style={{ backgroundColor: c.color }}
                        >
                          {c.name}
                        </span>
                      ))
                    )}
                  </div>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={g.active}
                    onClick={() => toggleGroupActive(g.id)}
                    className={clsx(
                      'relative h-7 w-12 justify-self-end rounded-full transition md:justify-self-start',
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
              )
            })}
          </ul>
        </div>
      )}

      {collectionOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center">
          <button
            type="button"
            className="absolute inset-0"
            aria-label="Close"
            onClick={() => setCollectionOpen(false)}
          />
          <div className="relative w-full max-w-md rounded-card bg-white p-5 shadow-modal">
            <h2 className="mb-3 text-lg font-semibold">{t('newCollection')}</h2>
            <input
              className="input"
              value={collectionName}
              onChange={(e) => setCollectionName(e.target.value)}
              placeholder="Collection name"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="btn-secondary flex-1"
                onClick={() => setCollectionOpen(false)}
              >
                {t('cancel')}
              </button>
              <button
                type="button"
                className="btn-primary flex-1"
                disabled={!collectionName.trim()}
                onClick={() => {
                  addCollection(collectionName.trim())
                  setCollectionName('')
                  setCollectionOpen(false)
                }}
              >
                {t('save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
