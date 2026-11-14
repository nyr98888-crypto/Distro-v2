import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import type { FacebookGroup } from '@shared/types'
import { useAppData } from '../context/AppDataContext'
import { useLanguage } from '../context/LanguageContext'
import { appConfig } from '../lib/config'
import { detectDevice, type DeviceKind } from '../lib/device'
import { syncSessionToExtension } from '../lib/extensionBridge'
import { BrandLogo } from './BrandLogo'

interface OnboardingWizardProps {
  open: boolean
  onClose: (opts?: { goToGroups?: boolean }) => void
}

const SKIP_KEY = 'distro-v2-onboarding-skipped'

export function markOnboardingSkipped(): void {
  localStorage.setItem(SKIP_KEY, '1')
}

export function clearOnboardingSkipped(): void {
  localStorage.removeItem(SKIP_KEY)
}

export function wasOnboardingSkipped(): boolean {
  return localStorage.getItem(SKIP_KEY) === '1'
}

export function OnboardingWizard({ open, onClose }: OnboardingWizardProps) {
  const { t } = useLanguage()
  const { data, setGroups, updateSettings } = useAppData()
  const detected = useMemo(() => detectDevice(), [])
  const [deviceTab, setDeviceTab] = useState<DeviceKind>(detected)
  const [step, setStep] = useState(1)
  const [liveGroups, setLiveGroups] = useState<FacebookGroup[]>([])

  useEffect(() => {
    if (!open) return
    setStep(1)
    setDeviceTab(detectDevice())
    setLiveGroups(data.groups)
    void syncSessionToExtension()
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!open || step !== 2) return
    let cancelled = false

    async function pollGroups() {
      try {
        const res = await fetch(appConfig.groupsUrl, { cache: 'no-store' })
        if (!res.ok) throw new Error('groups_failed')
        const json = (await res.json()) as { groups?: FacebookGroup[] }
        if (cancelled) return
        const groups = Array.isArray(json.groups) ? json.groups : []
        setLiveGroups(groups)
        if (groups.length > 0) {
          setGroups(groups)
          updateSettings({ lastGroupSyncAt: new Date().toISOString() })
        }
      } catch {
        if (!cancelled) setLiveGroups(data.groups)
      }
    }

    void pollGroups()
    const id = window.setInterval(() => void pollGroups(), 3000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [open, step, data.groups, setGroups, updateSettings])

  if (!open) return null

  const groupCount = liveGroups.length

  function finish() {
    if (liveGroups.length > 0) setGroups(liveGroups)
    markOnboardingSkipped()
    onClose({ goToGroups: true })
  }

  function skip() {
    markOnboardingSkipped()
    onClose()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-3 sm:items-center sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="onboarding-title"
        className="flex max-h-[min(920px,100%)] w-full max-w-2xl flex-col overflow-hidden rounded-card bg-white shadow-modal"
      >
        <header className="border-b border-line-soft px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <BrandLogo size={44} className="shrink-0 shadow-sm" />
              <div className="min-w-0">
                <h2 id="onboarding-title" className="text-lg font-semibold text-slate-900 sm:text-xl">
                  {t('onboardingTitle')}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {step}/2 · {step === 1 ? t('onboardingStep1') : t('onboardingStep3')}
                </p>
              </div>
            </div>
            <button
              type="button"
              className="min-h-touch text-sm font-medium text-slate-500 hover:text-slate-800"
              onClick={skip}
            >
              {t('skipForNow')}
            </button>
          </div>
          <div className="mt-4 flex gap-2">
            {[1, 2].map((n) => (
              <div
                key={n}
                className={clsx(
                  'h-1.5 flex-1 rounded-full transition',
                  n <= step ? 'bg-brand-indigo' : 'bg-slate-200',
                )}
              />
            ))}
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">{t('extensionAutoHint')}</p>
              <div className="flex flex-wrap gap-2">
                {(['pc', 'android', 'ios'] as DeviceKind[]).map((kind) => (
                  <button
                    key={kind}
                    type="button"
                    onClick={() => setDeviceTab(kind)}
                    className={clsx(
                      'min-h-touch rounded-lg border px-3 text-sm font-medium',
                      deviceTab === kind
                        ? 'border-brand-indigo bg-indigo-50 text-brand-indigo'
                        : 'border-line-soft text-slate-600',
                    )}
                  >
                    {kind === 'pc'
                      ? t('devicePc')
                      : kind === 'android'
                        ? t('deviceAndroid')
                        : t('deviceIos')}
                  </button>
                ))}
              </div>

              {deviceTab === 'pc' && (
                <div className="space-y-3 rounded-card border border-line-soft bg-warm-mist p-4">
                  <a
                    href={appConfig.extensionStoreUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-primary w-full sm:w-auto"
                  >
                    {t('downloadExtension')}
                  </a>
                  <ul className="space-y-2 text-sm text-slate-700">
                    <li>{t('pcBullet1')}</li>
                    <li>{t('pcBullet2')}</li>
                  </ul>
                </div>
              )}

              {deviceTab === 'android' && (
                <div className="space-y-3 rounded-card border border-line-soft bg-warm-mist p-4 text-sm text-slate-700">
                  <p>{t('androidIntro')}</p>
                  <ul className="space-y-2">
                    <li>{t('androidStep1')}</li>
                    <li>{t('androidStep2')}</li>
                    <li>{t('androidStep3')}</li>
                  </ul>
                </div>
              )}

              {deviceTab === 'ios' && (
                <div className="rounded-card border border-line-soft bg-warm-mist p-4 text-sm text-slate-700">
                  {t('iosNote')}
                </div>
              )}
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-slate-700">{t('pullGroupsInstruction')}</p>
              <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                {t('autoConnected')}
              </div>
              <div className="rounded-card border border-line-soft bg-warm-mist px-4 py-3 text-sm font-medium text-slate-800">
                {t('syncedGroupsCount').replace('{count}', String(groupCount))}
              </div>
              {groupCount === 0 ? (
                <div className="rounded-card border border-dashed border-line-soft p-6 text-center text-sm text-slate-500">
                  {t('waitingForExtension')}
                  <p className="mt-2 text-xs text-slate-400">
                    אפשר גם לסגור ולהשתמש ב«ייבוא מהיר של קבוצות» במסך הקבוצות.
                  </p>
                </div>
              ) : (
                <ul className="max-h-56 space-y-2 overflow-y-auto rounded-card border border-line-soft p-2">
                  {liveGroups.slice(0, 40).map((g) => (
                    <li key={g.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5">
                      <img
                        src={g.avatarUrl || 'https://picsum.photos/seed/group/80/80'}
                        alt=""
                        className="h-9 w-9 rounded-full object-cover"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium">{g.name}</div>
                        <div className="text-xs text-slate-500">
                          {g.memberCount.toLocaleString()}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        <footer className="flex flex-col-reverse gap-2 border-t border-line-soft px-5 py-4 sm:flex-row sm:justify-between">
          <button
            type="button"
            className="btn-secondary"
            disabled={step === 1}
            onClick={() => setStep(1)}
          >
            {t('back')}
          </button>
          {step === 1 ? (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                void syncSessionToExtension()
                setStep(2)
              }}
            >
              {t('next')}
            </button>
          ) : (
            <button type="button" className="btn-primary" onClick={finish}>
              {groupCount === 0 ? t('skipForNow') : t('finishManageGroups')}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
