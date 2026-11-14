import { useEffect, useState } from 'react'
import { AppShell, type AppTab } from './components/layout/AppShell'
import { TimingPage } from './pages/TimingPage'
import { GroupsPage } from './pages/GroupsPage'
import { SettingsPage } from './pages/SettingsPage'
import { LoginPage } from './pages/LoginPage'
import { ExtensionConnectedBanner } from './components/ExtensionConnectedBanner'
import { useAuth } from './context/AuthContext'
import { useAppData } from './context/AppDataContext'
import { appConfig } from './lib/config'
import { authHeaders, getStoredSessionToken } from './lib/sessionStore'
import type { FacebookGroup } from '@shared/types'

/**
 * Listen for any extension→web group handoff messages.
 * v1.0.9 primarily POSTs /api/sync-groups from the popup; this bridge covers
 * postMessage/runtime payloads if/when present.
 */
function ExtensionGroupHandoffListener() {
  const { refreshGroups, setGroups } = useAppData()

  useEffect(() => {
    async function ingest(rawGroups: unknown[]) {
      const groups = rawGroups
        .map((item) => {
          const g = (item || {}) as Record<string, unknown>
          const fbGroupId = String(g.fbGroupId || g.fb_group_id || g.id || g.groupId || '').trim()
          if (!fbGroupId) return null
          return {
            name: String(g.name || g.title || fbGroupId),
            fbGroupId,
            url: String(g.url || g.link || g.href || `https://www.facebook.com/groups/${fbGroupId}`),
            memberCount: Number(g.memberCount ?? g.member_count ?? 0) || 0,
            avatarUrl: (g.avatarUrl ?? g.avatar_url ?? null) as string | null,
          }
        })
        .filter(Boolean)

      if (groups.length === 0) return

      try {
        const res = await fetch(appConfig.syncGroupsUrl, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
          },
          body: JSON.stringify({ groups }),
        })
        const json = (await res.json().catch(() => ({}))) as {
          groups?: FacebookGroup[]
          ok?: boolean
        }
        if (Array.isArray(json.groups) && json.groups.length > 0) {
          setGroups(json.groups)
        } else {
          await refreshGroups()
        }
      } catch {
        await refreshGroups()
      }
    }

    function onMessage(event: MessageEvent) {
      if (event.source !== window) return
      const data = event.data
      if (!data || typeof data !== 'object') return

      const type = String(
        (data as { type?: string; action?: string }).type ||
          (data as { action?: string }).action ||
          '',
      )
      const source = String((data as { source?: string }).source || '')

      // Accept common handoff shapes (v1.0.9 may forward via web-bridge)
      const looksLikeGroups =
        type.includes('GROUP') ||
        type.includes('SYNC') ||
        type === 'DISTRO_GROUPS' ||
        type === 'DISTRO_SYNC_GROUPS' ||
        (source === 'distro-extension' && Array.isArray((data as { groups?: unknown[] }).groups))

      if (!looksLikeGroups) return

      const payload = data as {
        groups?: unknown[]
        items?: unknown[]
        list?: unknown[]
        payload?: { groups?: unknown[] }
      }
      const raw =
        payload.groups ||
        payload.items ||
        payload.list ||
        payload.payload?.groups ||
        []
      if (Array.isArray(raw) && raw.length > 0) {
        void ingest(raw)
      } else {
        void refreshGroups()
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [refreshGroups, setGroups])

  return null
}

/** Main Distro V2 UI — Google sign-in only; extension AUTH+SYNC is automatic. */
export default function App() {
  const { user } = useAuth()
  const [tab, setTab] = useState<AppTab>('timing')

  const hasLocalSession = Boolean(getStoredSessionToken())
  const isAuthenticated = Boolean(user) || hasLocalSession

  if (!isAuthenticated) {
    return <LoginPage />
  }

  return (
    <>
      <ExtensionConnectedBanner />
      <ExtensionGroupHandoffListener />
      <AppShell tab={tab} onTabChange={setTab}>
        {tab === 'timing' && <TimingPage />}
        {tab === 'groups' && <GroupsPage />}
        {tab === 'settings' && <SettingsPage />}
      </AppShell>
    </>
  )
}
