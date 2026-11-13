import {
  createContext,
  useCallback,
  useContext,
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

interface AppDataContextValue {
  data: AppBootstrap
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
}

const AppDataContext = createContext<AppDataContextValue | null>(null)

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

export function AppDataProvider({ children }: { children: ReactNode }) {
  const [data, setData] = useState<AppBootstrap>(() => createBootstrap())

  const setSchedules = useCallback((schedules: ScheduledPost[]) => {
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
      return refreshDerived({ ...prev, schedules })
    })
  }, [])

  const setScheduleStatus = useCallback((id: string, status: ScheduleStatus) => {
    setData((prev) =>
      refreshDerived({
        ...prev,
        schedules: prev.schedules.map((s) =>
          s.id === id ? { ...s, status, updatedAt: new Date().toISOString() } : s,
        ),
      }),
    )
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
      return refreshDerived({ ...prev, schedules: [copy, ...prev.schedules] })
    })
  }, [])

  const deleteSchedule = useCallback((id: string) => {
    setData((prev) =>
      refreshDerived({
        ...prev,
        schedules: prev.schedules.filter((s) => s.id !== id),
      }),
    )
  }, [])

  const setGroups = useCallback((groups: FacebookGroup[]) => {
    setData((prev) => refreshDerived({ ...prev, groups }))
  }, [])

  const toggleGroupActive = useCallback((id: string) => {
    setData((prev) =>
      refreshDerived({
        ...prev,
        groups: prev.groups.map((g) => (g.id === id ? { ...g, active: !g.active } : g)),
      }),
    )
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
    }),
    [
      data,
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
    ],
  )

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
}

export function useAppData() {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider')
  return ctx
}
