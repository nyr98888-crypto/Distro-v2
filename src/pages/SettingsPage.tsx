import { useState } from 'react'
import { useAppData } from '../context/AppDataContext'
import { useLanguage } from '../context/LanguageContext'
import { useAuth } from '../context/AuthContext'
import { syncSessionToExtension } from '../lib/extensionBridge'
import type { LocaleCode } from '../i18n/translations'

export function SettingsPage({ onOpenSetupGuide }: { onOpenSetupGuide: () => void }) {
  const { data, updateSettings } = useAppData()
  const { t, locale, setLocale } = useLanguage()
  const { user, logout, loginWithGoogle, loginWithFacebook } = useAuth()
  const [minDelay, setMinDelay] = useState(data.settings.minDelaySeconds)
  const [maxDelay, setMaxDelay] = useState(data.settings.maxDelaySeconds)
  const [dailyLimit, setDailyLimit] = useState(data.settings.dailyPostLimit)
  const [extSyncOk, setExtSyncOk] = useState(false)

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

  async function resyncExtension() {
    const ok = await syncSessionToExtension()
    setExtSyncOk(ok)
    window.setTimeout(() => setExtSyncOk(false), 2000)
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
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{t('account')}</h2>
          <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">
            {t('connected')}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {user?.picture ? (
            <img src={user.picture} alt="" className="h-12 w-12 rounded-full object-cover" />
          ) : (
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-200 text-sm font-semibold text-slate-600">
              {(user?.name || '?').slice(0, 1)}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate font-medium text-slate-900">{user?.name}</div>
            <div className="truncate text-sm text-slate-500">{user?.email}</div>
            <div className="text-xs text-slate-400">
              {user?.provider === 'google' ? 'Google' : 'Facebook'}
            </div>
          </div>
        </div>
        <button type="button" className="btn-secondary" onClick={() => void logout()}>
          {t('logout')}
        </button>
      </section>

      <section className="card space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{t('extensionSync')}</h2>
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            {t('autoConnected')}
          </span>
        </div>
        <p className="text-sm text-slate-600">{t('extensionAutoHint')}</p>
        <div className="text-sm text-slate-600">
          {t('lastSync')}:{' '}
          {data.settings.lastGroupSyncAt
            ? new Date(data.settings.lastGroupSyncAt).toLocaleString()
            : t('never')}
        </div>
        <button type="button" className="btn-secondary" onClick={() => void resyncExtension()}>
          {extSyncOk ? t('copied') : t('resyncExtension')}
        </button>
      </section>

      <section className="card space-y-4 p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">{t('metaOAuth')}</h2>
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-medium ${
              data.settings.metaConnected || user?.provider === 'facebook'
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {data.settings.metaConnected || user?.provider === 'facebook'
              ? t('connected')
              : t('disconnected')}
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-primary" onClick={loginWithFacebook}>
            {t('loginWithFacebook')}
          </button>
          <button type="button" className="btn-secondary" onClick={loginWithGoogle}>
            {t('loginWithGoogle')}
          </button>
        </div>
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

      <section className="card space-y-3 p-5">
        <a
          href="/privacy"
          className="text-sm font-medium text-brand-indigo hover:underline"
        >
          {t('privacyPolicy')}
        </a>
      </section>
    </div>
  )
}
