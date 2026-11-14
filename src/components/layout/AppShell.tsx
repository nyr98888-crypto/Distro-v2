import clsx from 'clsx'
import { useLanguage } from '../../context/LanguageContext'
import { BrandLogo } from '../BrandLogo'
import { ConnectionPill } from './ConnectionPill'

export type AppTab = 'timing' | 'groups' | 'settings'

interface AppShellProps {
  tab: AppTab
  onTabChange: (tab: AppTab) => void
  children: React.ReactNode
}

const tabs: AppTab[] = ['timing', 'groups', 'settings']

export function AppShell({ tab, onTabChange, children }: AppShellProps) {
  const { t } = useLanguage()

  const label = (key: AppTab) =>
    key === 'timing' ? t('timing') : key === 'groups' ? t('groups') : t('settings')

  return (
    <div className="flex h-full min-h-0 bg-warm-mist">
      <aside className="hidden w-[220px] shrink-0 flex-col bg-deep-slate text-white md:flex">
        <div className="px-5 pb-4 pt-[max(1.25rem,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2.5">
            <BrandLogo size={36} />
            <div>
              <div className="text-sm font-semibold tracking-tight">{t('appName')}</div>
              <div className="text-[11px] text-slate-400">Hybrid PWA</div>
            </div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1 px-3">
          {tabs.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => onTabChange(item)}
              className={clsx(
                'flex min-h-touch items-center rounded-lg px-3 text-sm font-medium transition',
                tab === item
                  ? 'bg-white/10 text-white'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white',
              )}
            >
              {label(item)}
            </button>
          ))}
        </nav>

        <div className="p-3 pb-4">
          <ConnectionPill />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-2 border-b border-line-soft bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] md:hidden">
          <div className="flex items-center gap-2">
            <BrandLogo size={32} rounded="rounded-lg" />
            <span className="text-sm font-semibold">{t('appName')}</span>
          </div>
          <ConnectionPill compact />
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:px-8 md:py-6 md:pb-8">
          {children}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-line-soft bg-white/95 backdrop-blur md:hidden pb-[env(safe-area-inset-bottom)]">
          <div className="grid grid-cols-3">
            {tabs.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onTabChange(item)}
                className={clsx(
                  'flex min-h-[52px] flex-col items-center justify-center gap-0.5 text-xs font-medium transition',
                  tab === item ? 'text-brand-indigo' : 'text-slate-500',
                )}
              >
                <span
                  className={clsx(
                    'h-1 w-6 rounded-full',
                    tab === item ? 'bg-brand-indigo' : 'bg-transparent',
                  )}
                />
                {label(item)}
              </button>
            ))}
          </div>
        </nav>
      </div>
    </div>
  )
}
