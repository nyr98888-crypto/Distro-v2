import { useEffect, useMemo, useState } from 'react'
import clsx from 'clsx'
import type { FacebookGroup } from '@shared/types'
import { useAppData } from '../context/AppDataContext'
import { useLanguage } from '../context/LanguageContext'
import { appConfig } from '../lib/config'
import { detectDevice, type DeviceKind } from '../lib/device'
import { mockGroups } from '../data/mock'

interface OnboardingWizardProps {
  open: boolean
  onClose: (opts?: { goToGroups?: boolean }) => void
}

type SyncStatusResponse = {
  extensionConnected: boolean
  lastExtensionPing: string | null
  lastGroupSyncAt: string | null
  groupCount: number
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
  const [copied, setCopied] = useState<'code' | 'url' | null>(null)
  const [extensionConnected, setExtensionConnected] = useState(false)
  const [liveGroups, setLiveGroups] = useState<FacebookGroup[]>([])

  useEffect(() => {
    if (!open) return
    setStep(1)
    setDeviceTab(detectDevice())
    setExtensionConnected(data.connection.extensionConnected)
    setLiveGroups(data.groups)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Step 2: poll sync-status
  useEffect(() => {
    if (!open || step !== 2) return

    let cancelled = false

    async function poll() {
      try {
        const res = await fetch(appConfig.syncStatusUrl, { cache: 'no-store' })
        if (!res.ok) throw new Error('status_failed')
        const json = (await res.json()) as SyncStatusResponse
        if (cancelled) return
        if (json.extensionConnected) {
          setExtensionConnected(true)
          updateSettings({ lastGroupSyncAt: json.lastGroupSyncAt ?? data.settings.lastGroupSyncAt })
        }
      } catch {
        // Local / vite fallback: honor in-memory connection flag
        if (!cancelled && data.connection.extensionConnected) {
          setExtensionConnected(true)
        }
      }
    }

    void poll()
    const id = window.setInterval(() => void poll(), 3000)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [open, step, data.connection.extensionConnected, data.settings.lastGroupSyncAt, updateSettings])

  // Step 3: poll groups
  useEffect(() => {
    if (!open || step !== 3) return

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
        if (!cancelled) {
          setLiveGroups(data.groups)
        }
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

  const syncUrl = appConfig.syncGroupsUrl
  const groupCount = liveGroups.length
  const canFinish = groupCount > 0

  async function copyText(value: string, kind: 'code' | 'url') {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(kind)
      window.setTimeout(() => setCopied(null), 1500)
    } catch {
      // ignore
    }
  }

  function finish() {
    if (liveGroups.length > 0) setGroups(liveGroups)
    markOnboardingSkipped()
    onClose({ goToGroups: true })
  }

  function skip() {
    markOnboardingSkipped()
    onClose()
  }

  /** Demo helper when API is offline: simulate extension + sample Hebrew groups */
  function simulateLocalSync() {
    const now = new Date().toISOString()
    setExtensionConnected(true)
    updateSettings({ lastGroupSyncAt: now })
    const seeded = structuredClone(mockGroups)
    setLiveGroups(seeded)
    setGroups(seeded)
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
            <div>
              <h2 id="onboarding-title" className="text-lg font-semibold text-slate-900 sm:text-xl">
                {t('onboardingTitle')}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {step}/3 ·{' '}
                {step === 1
                  ? t('onboardingStep1')
                  : step === 2
                    ? t('onboardingStep2')
                    : t('onboardingStep3')}
              </p>
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
            {[1, 2, 3].map((n) => (
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
                  <a
                    href={appConfig.extensionStoreUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-primary inline-flex"
                  >
                    {t('downloadExtension')}
                  </a>
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
              <div className="rounded-card border border-line-soft p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {t('pairingCodeLabel')}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="rounded-lg bg-slate-100 px-4 py-3 font-mono text-3xl tracking-[0.35em] text-slate-900">
                    {data.settings.pairingCode}
                  </span>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => copyText(data.settings.pairingCode, 'code')}
                  >
                    {copied === 'code' ? t('copied') : t('copyCode')}
                  </button>
                </div>
              </div>

              <div className="rounded-card border border-line-soft p-4">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-500">
                  {t('syncServerUrl')}
                </div>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
                  <code className="block flex-1 break-all rounded-lg bg-slate-50 px-3 py-3 text-xs text-slate-700">
                    {syncUrl}
                  </code>
                  <button
                    type="button"
                    className="btn-secondary shrink-0"
                    onClick={() => copyText(syncUrl, 'url')}
                  >
                    {copied === 'url' ? t('copied') : t('copyUrl')}
                  </button>
                </div>
              </div>

              <p className="text-sm text-slate-600">{t('pairInstruction')}</p>

              <div
                className={clsx(
                  'inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-medium',
                  extensionConnected
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-800',
                )}
              >
                <span
                  className={clsx(
                    'h-2 w-2 rounded-full',
                    extensionConnected ? 'bg-emerald-500' : 'animate-pulse bg-amber-500',
                  )}
                />
                {extensionConnected
                  ? t('extensionConnectedSuccess')
                  : t('waitingForExtension')}
              </div>

              {!extensionConnected && (
                <button type="button" className="btn-secondary text-xs" onClick={simulateLocalSync}>
                  Demo: סמן תוסף כמחובר
                </button>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-slate-700">{t('pullGroupsInstruction')}</p>

              <div className="rounded-card border border-line-soft bg-warm-mist px-4 py-3 text-sm font-medium text-slate-800">
                {t('syncedGroupsCount').replace('{count}', String(groupCount))}
              </div>

              {groupCount === 0 ? (
                <div className="rounded-card border border-dashed border-line-soft p-6 text-center text-sm text-slate-500">
                  {t('waitingForExtension')}
                  <div className="mt-3">
                    <button type="button" className="btn-secondary text-xs" onClick={simulateLocalSync}>
                      Demo: טען קבוצות לדוגמה
                    </button>
                  </div>
                </div>
              ) : (
                <ul className="max-h-56 space-y-2 overflow-y-auto rounded-card border border-line-soft p-2">
                  {liveGroups.slice(0, 40).map((g) => (
                    <li key={g.id} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-slate-50">
                      <img
                        src={g.avatarUrl || 'https://picsum.photos/seed/group/80/80'}
                        alt=""
                        className="h-9 w-9 rounded-full object-cover"
                      />
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-900">{g.name}</div>
                        <div className="text-xs text-slate-500">
                          {g.memberCount.toLocaleString()} · {g.fbGroupId}
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
            onClick={() => setStep((s) => Math.max(1, s - 1))}
          >
            {t('back')}
          </button>

          {step === 1 && (
            <button type="button" className="btn-primary" onClick={() => setStep(2)}>
              {t('nextConnectExtension')}
            </button>
          )}
          {step === 2 && (
            <button
              type="button"
              className="btn-primary"
              disabled={!extensionConnected}
              onClick={() => setStep(3)}
            >
              {t('next')}
            </button>
          )}
          {step === 3 && (
            <button type="button" className="btn-primary" disabled={!canFinish} onClick={finish}>
              {t('finishManageGroups')}
            </button>
          )}
        </footer>
      </div>
    </div>
  )
}
