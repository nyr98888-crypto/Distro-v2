import { useState } from 'react'
import { AppShell, type AppTab } from './components/layout/AppShell'
import { TimingPage } from './pages/TimingPage'
import { GroupsPage } from './pages/GroupsPage'
import { SettingsPage } from './pages/SettingsPage'
import { LoginPage } from './pages/LoginPage'
import { ExtensionConnectedBanner } from './components/ExtensionConnectedBanner'
import { useAuth } from './context/AuthContext'
import { getStoredSessionToken } from './lib/sessionStore'

/** Main Distro V2 UI — Google sign-in only; extension AUTH+SYNC is fully automatic. */
export default function App() {
  const { user } = useAuth()
  const [tab, setTab] = useState<AppTab>('timing')

  const hasLocalSession = Boolean(getStoredSessionToken())
  const isAuthenticated = Boolean(user) || hasLocalSession

  // Never trap on a spinner — unauthenticated users always see Google (click #1).
  if (!isAuthenticated) {
    return <LoginPage />
  }

  return (
    <>
      <ExtensionConnectedBanner />
      <AppShell tab={tab} onTabChange={setTab}>
        {tab === 'timing' && <TimingPage />}
        {tab === 'groups' && <GroupsPage />}
        {tab === 'settings' && <SettingsPage />}
      </AppShell>
    </>
  )
}
