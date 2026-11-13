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
import { useAppData } from './context/AppDataContext'
import { useAuth } from './context/AuthContext'

export default function App() {
  const { user, loading } = useAuth()
  const { data } = useAppData()
  const [tab, setTab] = useState<AppTab>('timing')
  const [wizardOpen, setWizardOpen] = useState(false)

  useEffect(() => {
    if (!user) return
    if (data.groups.length === 0 && !wasOnboardingSkipped()) {
      setWizardOpen(true)
    }
  }, [user, data.groups.length])

  function openSetupGuide() {
    clearOnboardingSkipped()
    setWizardOpen(true)
  }

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-warm-mist text-sm text-slate-500">
        טוען…
      </div>
    )
  }

  if (!user) {
    return <LoginPage />
  }

  return (
    <>
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
