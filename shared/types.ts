export type ScheduleStatus = 'scheduled' | 'paused' | 'draft' | 'completed'

export type DayOfWeek = 'Sun' | 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat'

export type LocaleCode = 'en' | 'he'

export interface FacebookGroup {
  id: string
  fbGroupId: string
  name: string
  url: string
  memberCount: number
  avatarUrl: string | null
  active: boolean
  collectionIds: string[]
  syncedAt: string | null
}

export interface GroupCollection {
  id: string
  name: string
  color: string
  groupIds: string[]
  createdAt: string
}

export interface ScheduledPost {
  id: string
  title: string
  body: string
  mediaUrls: string[]
  collectionId: string | null
  collectionName: string
  days: DayOfWeek[]
  time: string
  status: ScheduleStatus
  createdAt: string
  updatedAt: string
}

export interface UserSettings {
  pairingCode: string
  extensionId: string
  minDelaySeconds: number
  maxDelaySeconds: number
  dailyPostLimit: number
  locale: LocaleCode
  metaConnected: boolean
  metaAccountLabel: string | null
  metaAccessToken: string | null
  lastGroupSyncAt: string | null
  postsPublished: number
  apiBaseUrl: string
}

export interface ExtensionSyncPayload {
  extensionId?: string
  groups: Array<{
    name: string
    fbGroupId: string
    url?: string
    memberCount?: number
    avatarUrl?: string | null
  }>
  syncedAt?: string
}

export interface ConnectionStatus {
  extensionConnected: boolean
  lastExtensionPing: string | null
  lastGroupSyncAt: string | null
  metaConnected: boolean
  metaAccountLabel: string | null
  pairingCode: string
}

export interface DashboardStats {
  syncedGroups: number
  activeSchedules: number
  postsPublished: number
}

export interface AppBootstrap {
  connection: ConnectionStatus
  stats: DashboardStats
  groups: FacebookGroup[]
  collections: GroupCollection[]
  schedules: ScheduledPost[]
  settings: UserSettings
}

export interface ScheduleInput {
  id?: string
  title: string
  body: string
  mediaUrls: string[]
  collectionId: string | null
  days: DayOfWeek[]
  time: string
  status: ScheduleStatus
}
