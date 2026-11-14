import { useEffect, useState } from 'react'
import { AppShell, type AppTab } from './components/layout/AppShell'
import {
  OnboardingWizard,
  markOnboardingSkipped,
} from './components/OnboardingWizard'
import { TimingPage } from './pages/TimingPage'
import { GroupsPage } from './pages/GroupsPage'
import { SettingsPage } from './pages/SettingsPage'
import { LoginPage } from './pages/LoginPage'
import { ExtensionConnectedBanner } from './components/ExtensionConnectedBanner'
import { useAuth } from './context/AuthContext'
import { useAppData } from './context/AppDataContext'
import { getStoredSessionToken } from './lib/sessionStore'

/**
 * Main Distro V2 interface (Timing + Groups + Settings).
 * Onboarding never auto-opens when the user is signed in or the extension is detected.
 */
export default function App() {
  const { user, loading } = useAuth()
  const { data } = useAppData()
  const [tab, setTab] = useState<AppTab>('timing')
  const [wizardOpen, setWizardOpen] = useState(false)

  const hasLocalSession = Boolean(getStoredSessionToken())
  const isAuthenticated = Boolean(user) || hasLocalSession
  const extensionReady =
    data.connection.extensionConnected || Boolean(data.settings.lastGroupSyncAt)

  // Permanently skip blocking onboarding once signed in or extension is connected.
  useEffect(() => {
    if (!isAuthenticated && !extensionReady) return
    markOnboardingSkipped()
  }, [isAuthenticated, extensionReady])

  function openSetupGuide() {
    // Manual only — never traps the user after login / extension connect.
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
          markOnboardingSkipped()
          if (opts?.goToGroups) setTab('groups')
        }}
      />
    </>
  )
}
