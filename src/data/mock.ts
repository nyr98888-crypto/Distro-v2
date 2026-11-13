import type {
  AppBootstrap,
  FacebookGroup,
  GroupCollection,
  ScheduledPost,
  UserSettings,
} from '@shared/types'
import { appConfig } from '../lib/config'

const now = new Date().toISOString()

export const mockCollections: GroupCollection[] = [
  {
    id: 'col_realestate',
    name: 'קבוצות נדל״ן והשכרות',
    color: '#4F46E5',
    groupIds: [],
    createdAt: now,
  },
  {
    id: 'col_local',
    name: 'עסקים מקומיים',
    color: '#059669',
    groupIds: [],
    createdAt: now,
  },
  {
    id: 'col_jobs',
    name: 'דרושים ועבודות',
    color: '#D97706',
    groupIds: [],
    createdAt: now,
  },
]

/** Demo groups used after a successful sync / for UI previews */
export const mockGroups: FacebookGroup[] = [
  {
    id: 'g1',
    fbGroupId: '100001',
    name: 'נדל״ן תל אביב והמרכז',
    url: 'https://www.facebook.com/groups/100001',
    memberCount: 28400,
    avatarUrl: 'https://picsum.photos/seed/he-g1/80/80',
    active: true,
    collectionIds: ['col_realestate'],
    syncedAt: now,
  },
  {
    id: 'g2',
    fbGroupId: '100002',
    name: 'השכרות דירות ירושלים',
    url: 'https://www.facebook.com/groups/100002',
    memberCount: 15200,
    avatarUrl: 'https://picsum.photos/seed/he-g2/80/80',
    active: true,
    collectionIds: ['col_realestate'],
    syncedAt: now,
  },
  {
    id: 'g3',
    fbGroupId: '100003',
    name: 'עסקים קטנים בחיפה והקריות',
    url: 'https://www.facebook.com/groups/100003',
    memberCount: 8600,
    avatarUrl: 'https://picsum.photos/seed/he-g3/80/80',
    active: true,
    collectionIds: ['col_local'],
    syncedAt: now,
  },
  {
    id: 'g4',
    fbGroupId: '100004',
    name: 'פרילנסרים ויוצרים בישראל',
    url: 'https://www.facebook.com/groups/100004',
    memberCount: 12100,
    avatarUrl: 'https://picsum.photos/seed/he-g4/80/80',
    active: false,
    collectionIds: ['col_jobs'],
    syncedAt: now,
  },
  {
    id: 'g5',
    fbGroupId: '100005',
    name: 'שיווק דיגיטלי בעברית',
    url: 'https://www.facebook.com/groups/100005',
    memberCount: 19800,
    avatarUrl: 'https://picsum.photos/seed/he-g5/80/80',
    active: true,
    collectionIds: ['col_local'],
    syncedAt: now,
  },
  {
    id: 'g6',
    fbGroupId: '100006',
    name: 'משרות הייטק ורימוט',
    url: 'https://www.facebook.com/groups/100006',
    memberCount: 22300,
    avatarUrl: 'https://picsum.photos/seed/he-g6/80/80',
    active: true,
    collectionIds: ['col_jobs'],
    syncedAt: now,
  },
]

export const mockSchedules: ScheduledPost[] = [
  {
    id: 's1',
    title: 'פרסום יומי - דירות מרכז',
    body: 'דירות להשכרה באזור המרכז — עדכון יומי עם פרטים מלאים.',
    mediaUrls: [
      'https://picsum.photos/seed/he-s1a/320/320',
      'https://picsum.photos/seed/he-s1b/320/320',
    ],
    collectionId: 'col_realestate',
    collectionName: 'קבוצות נדל״ן והשכרות',
    days: ['Sun', 'Wed'],
    time: '10:00',
    status: 'scheduled',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 's2',
    title: 'מבצע סוף שבוע לעסקים',
    body: 'מבצע מיוחד לסוף השבוע — שתפו עם הלקוחות שלכם.',
    mediaUrls: ['https://picsum.photos/seed/he-s2/320/320'],
    collectionId: 'col_local',
    collectionName: 'עסקים מקומיים',
    days: ['Fri', 'Sat'],
    time: '18:30',
    status: 'scheduled',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 's3',
    title: 'מודעת דרושים - משרה מלאה',
    body: 'מחפשים עובד/ת למשרה מלאה — פרטים בתגובות.',
    mediaUrls: ['https://picsum.photos/seed/he-s3/320/320'],
    collectionId: 'col_jobs',
    collectionName: 'דרושים ועבודות',
    days: ['Mon', 'Thu'],
    time: '09:15',
    status: 'paused',
    createdAt: now,
    updatedAt: now,
  },
  {
    id: 's4',
    title: 'טיפים לשיווק בקבוצות',
    body: 'טיוטה: טיפים לפרסום אפקטיבי בקבוצות פייסבוק.',
    mediaUrls: [],
    collectionId: 'col_local',
    collectionName: 'עסקים מקומיים',
    days: ['Tue'],
    time: '12:00',
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  },
]

export const mockSettings: UserSettings = {
  pairingCode: '482917',
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

/**
 * First-login bootstrap: no synced groups yet so the Setup Wizard opens.
 * Collections + sample schedules stay available after skip / finish.
 */
export function createBootstrap(): AppBootstrap {
  const collections = structuredClone(mockCollections)
  return {
    connection: {
      extensionConnected: false,
      lastExtensionPing: null,
      lastGroupSyncAt: null,
      metaConnected: false,
      metaAccountLabel: null,
      pairingCode: mockSettings.pairingCode,
    },
    stats: {
      syncedGroups: 0,
      activeSchedules: mockSchedules.filter((s) => s.status === 'scheduled').length,
      postsPublished: 0,
    },
    groups: [],
    collections,
    schedules: structuredClone(mockSchedules),
    settings: structuredClone(mockSettings),
  }
}
