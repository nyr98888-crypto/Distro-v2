import { useState } from 'react'
import { useAppData } from '../context/AppDataContext'
import { useLanguage } from '../context/LanguageContext'
import { appConfig } from '../lib/config'
import type { LocaleCode } from '../i18n/translations'

export function SettingsPage({ onOpenSetupGuide }: { onOpenSetupGuide: () => void }) {
  const { data, updateSettings, regeneratePairingCode } = useAppData()
  const { t, locale, setLocale } = useLanguage()
  const [copied, setCopied] = useState(false)
  const [minDelay, setMinDelay] = useState(data.settings.minDelaySeconds)
  const [maxDelay, setMaxDelay] = useState(data.settings.maxDelaySeconds)
  const [dailyLimit, setDailyLimit] = useState(data.settings.dailyPostLimit)

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(data.settings.pairingCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      // ignore
    }
  }

  function connectMeta() {
    window.location.href = appConfig.metaConnectUrl
  }

  function disconnectMeta() {
    updateSettings({
      metaConnected: false,
      metaAccountLabel: null,
      metaAccessToken: null,
    })
  }

  function savePacing() {
    updateSettings({
      minDelaySeconds: minDelay,
      maxDelaySeconds: Math.max(minDelay, maxDelay),
      dailyPostLimit: dailyLimit,
    })
  }

  function switchLocale(next: LocaleCode) {
    setLocale(next)
    updateSettings({ locale: next })
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t('settings')}</h1>
        <button type="button" className="btn-secondary" onClick={onOpenSetupGuide}>
          {t('setupGuide')}
        </button>
      </div>

      <section className="card space-y-4 p-5">
        <h2 className="text-base font-semibold">{t('extensionSync')}</h2>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t('pairingCode')}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-slate-100 px-4 py-2 font-mono text-2xl tracking-[0.35em] text-slate-900">
              {data.settings.pairingCode}
            </span>
            <button type="button" className="btn-secondary" onClick={copyCode}>
              {copied ? '✓' : t('copy')}
            </button>
            <button type="button" className="btn-secondary" onClick={regeneratePairingCode}>
              {t('regenerate')}
            </button>
          </div>
        </div>
        <div className="text-sm text-slate-600">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
            {t('apiEndpoint')}
          </div>
          <code className="mt-1 block break-all rounded-lg bg-slate-50 px-3 py-2 text-xs">
            {appConfig.syncGroupsUrl}
          </code>
        </div>
        <div className="text-sm text-slate-600">
          {t('lastSync')}:{' '}
          {data.settings.lastGroupSyncAt
            ? new Date(data.settings.lastGroupSyncAt).toLocaleString()
            : t('never')}
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{t('metaOAuth')}</h2>
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-medium ${
              data.settings.metaConnected
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {data.settings.metaConnected ? t('connected') : t('disconnected')}
          </span>
        </div>
        {data.settings.metaAccountLabel && (
          <p className="text-sm text-slate-600">{data.settings.metaAccountLabel}</p>
        )}
        {data.settings.metaConnected ? (
          <button type="button" className="btn-secondary" onClick={disconnectMeta}>
            {t('disconnect')}
          </button>
        ) : (
          <button type="button" className="btn-primary" onClick={connectMeta}>
            {t('connectMeta')}
          </button>
        )}
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-base font-semibold">{t('postingSafety')}</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-slate-700">{t('minDelay')}</span>
            <input
              className="input"
              type="number"
              min={0}
              value={minDelay}
              onChange={(e) => setMinDelay(Number(e.target.value))}
            />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-slate-700">{t('maxDelay')}</span>
            <input
              className="input"
              type="number"
              min={0}
              value={maxDelay}
              onChange={(e) => setMaxDelay(Number(e.target.value))}
            />
          </label>
          <label className="block space-y-1.5 text-sm">
            <span className="font-medium text-slate-700">{t('dailyLimit')}</span>
            <input
              className="input"
              type="number"
              min={1}
              value={dailyLimit}
              onChange={(e) => setDailyLimit(Number(e.target.value))}
            />
          </label>
        </div>
        <button type="button" className="btn-primary" onClick={savePacing}>
          {t('save')}
        </button>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-base font-semibold">{t('appearance')}</h2>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            className={`min-h-touch rounded-lg border px-3 py-2 text-sm font-medium ${
              locale === 'en'
                ? 'border-brand-indigo bg-indigo-50 text-brand-indigo'
                : 'border-line-soft text-slate-700'
            }`}
            onClick={() => switchLocale('en')}
          >
            {t('english')}
          </button>
          <button
            type="button"
            className={`min-h-touch rounded-lg border px-3 py-2 text-sm font-medium ${
              locale === 'he'
                ? 'border-brand-indigo bg-indigo-50 text-brand-indigo'
                : 'border-line-soft text-slate-700'
            }`}
            onClick={() => switchLocale('he')}
          >
            {t('hebrew')}
          </button>
        </div>
      </section>
    </div>
  )
}
