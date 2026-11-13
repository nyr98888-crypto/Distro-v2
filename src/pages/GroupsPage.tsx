import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { useAppData } from '../context/AppDataContext'
import { useLanguage } from '../context/LanguageContext'

export function GroupsPage({ onOpenSetupGuide }: { onOpenSetupGuide: () => void }) {
  const { data, toggleGroupActive, addCollection, updateSettings } = useAppData()
  const { t } = useLanguage()
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [guideOpen, setGuideOpen] = useState(false)
  const [collectionOpen, setCollectionOpen] = useState(false)
  const [collectionName, setCollectionName] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return data.groups.filter(
      (g) =>
        !q ||
        g.name.toLowerCase().includes(q) ||
        g.fbGroupId.includes(q),
    )
  }, [data.groups, query])

  function toggleSelect(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
  }

  function toggleAll() {
    if (selected.length === filtered.length) setSelected([])
    else setSelected(filtered.map((g) => g.id))
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
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <button type="button" className="btn-secondary" onClick={onOpenSetupGuide}>
            {t('setupGuide')}
          </button>
          <button type="button" className="btn-secondary" onClick={() => setGuideOpen(true)}>
            {t('syncViaExtension')}
          </button>
          <button type="button" className="btn-primary" onClick={() => setCollectionOpen(true)}>
            {t('newCollection')}
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
        <div className="card p-8 text-center text-sm text-slate-500">{t('noGroups')}</div>
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
                    <img
                      src={g.avatarUrl || 'https://picsum.photos/seed/fallback/80/80'}
                      alt=""
                      className="h-10 w-10 rounded-full object-cover"
                    />
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

      {guideOpen && (
        <Modal title={t('syncViaExtension')} onClose={() => setGuideOpen(false)}>
          <ol className="list-decimal space-y-2 ps-5 text-sm text-slate-600">
            <li>Open Distro Settings and copy your 6-digit pairing code.</li>
            <li>
              On PC Chrome (or Android Kiwi / Mises), open the Distro extension and paste the code.
            </li>
            <li>
              The extension POSTs groups to <code className="rounded bg-slate-100 px-1">{data.settings.apiBaseUrl}/sync-groups</code> with header <code className="rounded bg-slate-100 px-1">x-pairing-code</code>.
            </li>
          </ol>
          <button
            type="button"
            className="btn-primary mt-4 w-full"
            onClick={() => {
              updateSettings({ lastGroupSyncAt: new Date().toISOString() })
              setGuideOpen(false)
            }}
          >
            Mark synced (demo)
          </button>
        </Modal>
      )}

      {collectionOpen && (
        <Modal title={t('newCollection')} onClose={() => setCollectionOpen(false)}>
          <input
            className="input"
            value={collectionName}
            onChange={(e) => setCollectionName(e.target.value)}
            placeholder="Collection name"
          />
          <div className="mt-4 flex gap-2">
            <button type="button" className="btn-secondary flex-1" onClick={() => setCollectionOpen(false)}>
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
        </Modal>
      )}
    </div>
  )
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: React.ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 p-4 sm:items-center">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative w-full max-w-md rounded-card bg-white p-5 shadow-modal">
        <h2 className="mb-3 text-lg font-semibold">{title}</h2>
        {children}
      </div>
    </div>
  )
}
