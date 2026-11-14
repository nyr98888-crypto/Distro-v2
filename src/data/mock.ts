import type { AppBootstrap, UserSettings } from '@shared/types'
import { appConfig } from '../lib/config'

/** Empty bootstrap — no demo campaigns, groups, or fake accounts. */
export const emptySettings: UserSettings = {
  extensionId: '',
  minDelaySeconds: 45,
  maxDelaySeconds: 120,
  dailyPostLimit: 25,
  locale: 'he',
  metaConnected: false,
  metaAccountLabel: null,
  metaAccessToken: null,
  lastGroupSyncAt: null,
  postsPublished: 0,
  apiBaseUrl: appConfig.apiBaseUrl,
}

export function createBootstrap(): AppBootstrap {
  return {
    connection: {
      extensionConnected: false,
      lastExtensionPing: null,
      lastGroupSyncAt: null,
      metaConnected: false,
      metaAccountLabel: null,
    },
    stats: {
      syncedGroups: 0,
      activeSchedules: 0,
      postsPublished: 0,
    },
    groups: [],
    collections: [],
    schedules: [],
    settings: structuredClone(emptySettings),
  }
}
