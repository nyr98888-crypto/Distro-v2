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
  const { user, loading } = useAuth()
  const [tab, setTab] = useState<AppTab>('timing')

  const hasLocalSession = Boolean(getStoredSessionToken())
  const isAuthenticated = Boolean(user) || hasLocalSession

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
      <AppShell tab={tab} onTabChange={setTab}>
        {tab === 'timing' && <TimingPage />}
        {tab === 'groups' && <GroupsPage />}
        {tab === 'settings' && <SettingsPage />}
      </AppShell>
    </>
  )
}
