import { useAppData } from '../../context/AppDataContext'
import { useLanguage } from '../../context/LanguageContext'

export function ConnectionPill({ compact = false }: { compact?: boolean }) {
  const { data } = useAppData()
  const { t } = useLanguage()
  const { extensionConnected, metaConnected } = data.connection

  return (
    <div
      className={
        compact
          ? 'flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[11px] text-slate-200'
          : 'rounded-card border border-white/10 bg-white/5 p-3 text-xs text-slate-300'
      }
    >
      <div className={compact ? 'flex items-center gap-3' : 'space-y-2'}>
        <StatusRow
          label={t('extension')}
          ok={extensionConnected}
          okLabel={t('connected')}
          badLabel={t('waitingConnection')}
          inline={compact}
        />
        <StatusRow
          label={t('meta')}
          ok={metaConnected}
          okLabel={t('connected')}
          badLabel={t('disconnected')}
          inline={compact}
        />
      </div>
    </div>
  )
}

function StatusRow({
  label,
  ok,
  okLabel,
  badLabel,
  inline,
}: {
  label: string
  ok: boolean
  okLabel: string
  badLabel: string
  inline?: boolean
}) {
  return (
    <div className={inline ? 'flex items-center gap-1.5' : 'flex items-center justify-between gap-2'}>
      <span className="text-slate-400">{label}</span>
      <span className="inline-flex items-center gap-1.5">
        <span
          className={`h-1.5 w-1.5 rounded-full ${ok ? 'bg-emerald-400' : 'bg-slate-500'}`}
        />
        <span className={ok ? 'text-emerald-300' : 'text-slate-400'}>
          {ok ? okLabel : badLabel}
        </span>
      </span>
    </div>
  )
}
