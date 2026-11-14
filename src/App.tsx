import { useEffect, useState } from 'react'
import { AppShell, type AppTab } from './components/layout/AppShell'
import {
  OnboardingWizard,
  wasOnboardingSkipped,
  clearOnboardingSkipped,
} from './components/OnboardingWizard'
import { TimingPage } from './pages/TimingPage'
import { GroupsPage } from './pages/GroupsPage'
import { SettingsPage } from './pages/SettingsPage'
import { LoginPage } from './pages/LoginPage'
import { ExtensionConnectedBanner } from './components/ExtensionConnectedBanner'
import { useAppData } from './context/AppDataContext'
import { useAuth } from './context/AuthContext'
import { getStoredSessionToken } from './lib/sessionStore'

/**
 * Main Distro V2 interface lives here (no separate /dashboard route):
 * Timing + Groups + Settings inside AppShell once authenticated.
 */
export default function App() {
  const { user, loading } = useAuth()
  const { data } = useAppData()
  const [tab, setTab] = useState<AppTab>('timing')
  const [wizardOpen, setWizardOpen] = useState(false)

  // Session in localStorage counts as authenticated even before /api/auth/me returns
  const hasLocalSession = Boolean(getStoredSessionToken())
  const isAuthenticated = Boolean(user) || hasLocalSession

  useEffect(() => {
    if (!isAuthenticated) return
    if (data.groups.length === 0 && !wasOnboardingSkipped()) {
      setWizardOpen(true)
    }
  }, [isAuthenticated, data.groups.length])

  function openSetupGuide() {
    clearOnboardingSkipped()
    setWizardOpen(true)
  }

  if (loading && !isAuthenticated) {
    return (
      <div className="flex h-full items-center justify-center bg-warm-mist text-sm text-slate-500">
        טוען…
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage />
  }

  return (
    <>
      <ExtensionConnectedBanner />
      <AppShell tab={tab} onTabChange={setTab} onOpenSetupGuide={openSetupGuide}>
        {tab === 'timing' && <TimingPage />}
        {tab === 'groups' && <GroupsPage onOpenSetupGuide={openSetupGuide} />}
        {tab === 'settings' && <SettingsPage onOpenSetupGuide={openSetupGuide} />}
      </AppShell>

      <OnboardingWizard
        open={wizardOpen}
        onClose={(opts) => {
          setWizardOpen(false)
          if (opts?.goToGroups) setTab('groups')
        }}
      />
    </>
  )
}
