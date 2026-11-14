import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type {
  AppBootstrap,
  FacebookGroup,
  GroupCollection,
  ScheduleInput,
  ScheduledPost,
  ScheduleStatus,
  UserSettings,
} from '@shared/types'
import { createBootstrap } from '../data/mock'
import { appConfig } from '../lib/config'
import { authHeaders, getStoredSessionToken } from '../lib/sessionStore'
const GROUPS_LS_KEY = 'distro_groups_cache'
const SCHEDULES_LS_KEY = 'distro_schedules_cache'

/** Prevent overlapping /api/groups polls from stacking into an endless spinner. */
let groupsInFlight: Promise<{ count: number; ok: boolean; error?: string }> | null = null

interface AppDataContextValue {
  data: AppBootstrap
  selectedGroupIds: string[]
  setSelectedGroupIds: (ids: string[]) => void
  selectAllGroups: () => void
  groupsLoading: boolean
  setSchedules: (schedules: ScheduledPost[]) => void
  upsertSchedule: (input: ScheduleInput) => void
  setScheduleStatus: (id: string, status: ScheduleStatus) => void
  duplicateSchedule: (id: string) => void
  deleteSchedule: (id: string) => void
  setGroups: (groups: FacebookGroup[]) => void
  toggleGroupActive: (id: string) => void
  addCollection: (name: string, color?: string) => void
  updateSettings: (patch: Partial<UserSettings>) => void
  refreshStats: () => void
  refreshGroups: (opts?: {
    showLoading?: boolean
  }) => Promise<{ count: number; ok: boolean; error?: string }>
  syncGroupsToServer: (groups: FacebookGroup[]) => Promise<{ ok: boolean; count: number }>
}

const AppDataContext = createContext<AppDataContextValue | null>(null)

function readCachedGroups(): FacebookGroup[] {
  try {
    const raw = localStorage.getItem(GROUPS_LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as FacebookGroup[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeCachedGroups(groups: FacebookGroup[]): void {
  try {
    localStorage.setItem(GROUPS_LS_KEY, JSON.stringify(groups))
  } catch {
    /* ignore */
  }
}

const DEMO_SCHEDULE_TITLES = new Set([
  'מוציא אישי — דירוג קבוצות',
  'מבצע סוף שבוע ללקוחות חדשים',
  'עדכון דרושים — משרה מלאה',
  'שיתוף לקהילת השותפים',
  'פרסום יומי - דירות מרכז',
  'מבצע סוף שבוע לעסקים',
])

function readCachedSchedules(): ScheduledPost[] {
  try {
    const raw = localStorage.getItem(SCHEDULES_LS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as ScheduledPost[]
    if (!Array.isArray(parsed)) return []
    // Drop legacy demo campaigns that may still sit in localStorage.
    return parsed.filter((s) => !DEMO_SCHEDULE_TITLES.has(s.title))
  } catch {
    return []
  }
}

function writeCachedSchedules(schedules: ScheduledPost[]): void {
  try {
    localStorage.setItem(SCHEDULES_LS_KEY, JSON.stringify(schedules))
  } catch {
    /* ignore */
  }
}

function refreshDerived(data: AppBootstrap): AppBootstrap {
  return {
    ...data,
    stats: {
      syncedGroups: data.groups.filter((g) => g.active).length,
      activeSchedules: data.schedules.filter((s) => s.status === 'scheduled').length,
      postsPublished: data.settings.postsPublished,
    },
    connection: {
      ...data.connection,
      metaConnected: data.settings.metaConnected,
      metaAccountLabel: data.settings.metaAccountLabel,
      lastGroupSyncAt: data.settings.lastGroupSyncAt,
      lastExtensionPing: data.connection.lastExtensionPing,
      extensionConnected:
        Boolean(data.connection.lastExtensionPing) || Boolean(data.settings.lastGroupSyncAt),
    },
  }
}

function initialBootstrap(): AppBootstrap {
  const base = createBootstrap()
  const groups = readCachedGroups()
  const schedules = readCachedSchedules()
  const lastSync =
    groups.find((g) => g.syncedAt)?.syncedAt ||
    (groups.length > 0 ? new Date().toISOString() : null)
  return refreshDerived({
    ...base,
    groups,
    schedules,
    settings: {
      ...base.settings,
      lastGroupSyncAt: lastSync,
      metaAccountLabel: null,
      metaConnected: false,
    },
  })
}

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppBootstrap>(() => initialBootstrap())
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const [groupsLoading, setGroupsLoading] = useState(false)

  const applyGroups = useCallback((groups: FacebookGroup[], syncedAt?: string | null) => {
    writeCachedGroups(groups)
    setData((prev) =>
      refreshDerived({
        ...prev,
        groups,
        settings: {
          ...prev.settings,
          lastGroupSyncAt: syncedAt ?? prev.settings.lastGroupSyncAt ?? new Date().toISOString(),
        },
      }),
    )
  }, [])

  const selectAllGroups = useCallback(() => {
    setSelectedGroupIds(data.groups.filter((g) => g.active).map((g) => g.id))
  }, [data.groups])

  const refreshGroups = useCallback(async (opts?: { showLoading?: boolean }) => {
    const showLoading = opts?.showLoading === true
    // Single-flight: overlapping 2.5s polls were stacking into an endless spinner.
    if (groupsInFlight) return groupsInFlight
    if (showLoading) setGroupsLoading(true)
    groupsInFlight = (async () => {
      try {
        const res = await fetch(`${appConfig.groupsUrl}?t=${Date.now()}`, {
          cache: 'no-store',
          credentials: 'include',
          headers: {
            ...authHeaders(),
            'Cache-Control': 'no-cache',
          },
        })
        const json = (await res.json().catch(() => ({}))) as {
          groups?: FacebookGroup[]
          count?: number
          lastSyncAt?: string | null
          lastGroupSyncAt?: string | null
          error?: string
          ok?: boolean
        }
        if (!res.ok && res.status === 401) {
          return { count: 0, ok: false, error: 'unauthorized' }
        }
        const remote = Array.isArray(json.groups) ? json.groups : []
        const lastSync =
          json.lastSyncAt || json.lastGroupSyncAt || (remote[0]?.syncedAt ?? null)
        setData((prev) => {
          // Never wipe a non-empty local cache with an empty remote blip.
          const nextGroups =
            res.ok && (remote.length > 0 || prev.groups.length === 0) ? remote : prev.groups
          writeCachedGroups(nextGroups)
          return refreshDerived({
            ...prev,
            groups: nextGroups,
            settings: {
              ...prev.settings,
              lastGroupSyncAt:
                lastSync ||
                (remote.length ? new Date().toISOString() : prev.settings.lastGroupSyncAt),
            },
          })
        })
        if (remote.length > 0) {
          setSelectedGroupIds((prev) => prev.filter((id) => remote.some((g) => g.id === id)))
        }
        return {
          count: remote.length,
          ok: Boolean(res.ok && json.ok !== false),
          error: json.error,
        }
      } catch (err) {
        return {
          count: 0,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
        }
      } finally {
        groupsInFlight = null
        if (showLoading) setGroupsLoading(false)
      }
    })()
    return groupsInFlight
  }, [])

  const syncGroupsToServer = useCallback(
    async (groups: FacebookGroup[]): Promise<{ ok: boolean; count: number }> => {
      const token = getStoredSessionToken()
      if (!token) {
        applyGroups(groups, new Date().toISOString())
        return { ok: true, count: groups.length }
      }
      try {
        const res = await fetch(appConfig.syncGroupsUrl, {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders(),
          },
          body: JSON.stringify({
            groups: groups.map((g) => ({
              name: g.name,
              fbGroupId: g.fbGroupId,
              url: g.url,
              memberCount: g.memberCount,
              avatarUrl: g.avatarUrl,
            })),
            syncedAt: new Date().toISOString(),
          }),
        })
        const body = (await res.json().catch(() => ({}))) as {
          count?: number
          groups?: FacebookGroup[]
        }
        const saved = Array.isArray(body.groups) && body.groups.length ? body.groups : groups
        applyGroups(saved, new Date().toISOString())
        if (!res.ok) return { ok: false, count: saved.length }
        return { ok: true, count: body.count ?? saved.length }
      } catch {
        applyGroups(groups, new Date().toISOString())
        return { ok: true, count: groups.length }
      }
    },
    [applyGroups],
  )

  // One load + gentle poll only while empty (no stacked requests / spinner loop).
  useEffect(() => {
    void refreshGroups()
    const id = window.setInterval(() => {
      setData((prev) => {
        if (prev.groups.length === 0) void refreshGroups()
        return prev
      })
    }, 15000)
    const onFocus = () => void refreshGroups()
    const onStorage = (e: StorageEvent) => {
      if (e.key === GROUPS_LS_KEY) void refreshGroups()
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('storage', onStorage)
    return () => {
      window.clearInterval(id)
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('storage', onStorage)
    }
  }, [refreshGroups])

  const setSchedules = useCallback((schedules: ScheduledPost[]) => {
    writeCachedSchedules(schedules)
    setData((prev) => refreshDerived({ ...prev, schedules }))
  }, [])

  const upsertSchedule = useCallback((input: ScheduleInput) => {
    setData((prev) => {
      const collectionName =
        prev.collections.find((c) => c.id === input.collectionId)?.name ?? ''
      const now = new Date().toISOString()
      const id = input.id ?? `s_${Math.random().toString(36).slice(2, 8)}`
      const existing = prev.schedules.find((s) => s.id === id)
      const row: ScheduledPost = {
        id,
        title: input.title,
        body: input.body,
        mediaUrls: input.mediaUrls,
        collectionId: input.collectionId,
        collectionName,
        days: input.days,
        time: input.time,
        status: input.status,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      }
      const schedules = existing
        ? prev.schedules.map((s) => (s.id === id ? row : s))
        : [row, ...prev.schedules]
      writeCachedSchedules(schedules)
      return refreshDerived({ ...prev, schedules })
    })
  }, [])

  const setScheduleStatus = useCallback((id: string, status: ScheduleStatus) => {
    setData((prev) => {
      const schedules = prev.schedules.map((s) =>
        s.id === id ? { ...s, status, updatedAt: new Date().toISOString() } : s,
      )
      writeCachedSchedules(schedules)
      return refreshDerived({ ...prev, schedules })
    })
  }, [])

  const duplicateSchedule = useCallback((id: string) => {
    setData((prev) => {
      const source = prev.schedules.find((s) => s.id === id)
      if (!source) return prev
      const copy: ScheduledPost = {
        ...source,
        id: `s_${Math.random().toString(36).slice(2, 8)}`,
        title: `${source.title} (copy)`,
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }
      const schedules = [copy, ...prev.schedules]
      writeCachedSchedules(schedules)
      return refreshDerived({ ...prev, schedules })
    })
  }, [])

  const deleteSchedule = useCallback((id: string) => {
    setData((prev) => {
      const schedules = prev.schedules.filter((s) => s.id !== id)
      writeCachedSchedules(schedules)
      return refreshDerived({ ...prev, schedules })
    })
  }, [])

  const setGroups = useCallback(
    (groups: FacebookGroup[]) => {
      applyGroups(groups, new Date().toISOString())
    },
    [applyGroups],
  )

  const toggleGroupActive = useCallback((id: string) => {
    setData((prev) => {
      const groups = prev.groups.map((g) => (g.id === id ? { ...g, active: !g.active } : g))
      writeCachedGroups(groups)
      return refreshDerived({ ...prev, groups })
    })
  }, [])

  const addCollection = useCallback((name: string, color = '#4F46E5') => {
    setData((prev) => {
      const collection: GroupCollection = {
        id: `col_${Math.random().toString(36).slice(2, 8)}`,
        name,
        color,
        groupIds: [],
        createdAt: new Date().toISOString(),
      }
      return refreshDerived({
        ...prev,
        collections: [...prev.collections, collection],
      })
    })
  }, [])

  const updateSettings = useCallback((patch: Partial<UserSettings>) => {
    setData((prev) =>
      refreshDerived({
        ...prev,
        settings: { ...prev.settings, ...patch },
      }),
    )
  }, [])

  const refreshStats = useCallback(() => {
    setData((prev) => refreshDerived(prev))
  }, [])

  const value = useMemo(
    () => ({
      data,
      selectedGroupIds,
      setSelectedGroupIds,
      selectAllGroups,
      groupsLoading,
      setSchedules,
      upsertSchedule,
      setScheduleStatus,
      duplicateSchedule,
      deleteSchedule,
      setGroups,
      toggleGroupActive,
      addCollection,
      updateSettings,
      refreshStats,
      refreshGroups,
      syncGroupsToServer,
    }),
    [
      data,
      selectedGroupIds,
      selectAllGroups,
      groupsLoading,
      setSchedules,
      upsertSchedule,
      setScheduleStatus,
      duplicateSchedule,
      deleteSchedule,
      setGroups,
      toggleGroupActive,
      addCollection,
      updateSettings,
      refreshStats,
      refreshGroups,
      syncGroupsToServer,
    ],
  )

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData() {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider')
  return ctx
}
