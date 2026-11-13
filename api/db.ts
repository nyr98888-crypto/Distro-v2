import { createClient, type Client } from '@libsql/client'
import { env } from './env'
import { decryptToken, encryptToken } from './lib/crypto'
import type {
  FacebookGroup,
  GroupCollection,
  ScheduledPost,
  ScheduleStatus,
  DayOfWeek,
  UserSettings,
  LocaleCode,
  ExtensionSyncPayload,
  AppBootstrap,
  ScheduleInput,
  DashboardStats,
  ConnectionStatus,
} from '../shared/types'

type MemoryStore = {
  groups: Map<string, FacebookGroup>
  collections: Map<string, GroupCollection>
  schedules: Map<string, ScheduledPost>
  settings: Map<string, string>
  collectionGroups: Map<string, Set<string>>
}

declare global {
  // eslint-disable-next-line no-var
  var __distroMemoryStore: MemoryStore | undefined
  // eslint-disable-next-line no-var
  var __distroTursoClient: Client | undefined
  // eslint-disable-next-line no-var
  var __distroSchemaReady: boolean | undefined
}

function memory(): MemoryStore {
  if (!globalThis.__distroMemoryStore) {
    globalThis.__distroMemoryStore = {
      groups: new Map(),
      collections: new Map(),
      schedules: new Map(),
      settings: new Map(),
      collectionGroups: new Map(),
    }
    seedMemory(globalThis.__distroMemoryStore)
  }
  return globalThis.__distroMemoryStore
}

function id(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

function pairingCode(): string {
  return String(Math.floor(100000 + Math.random() * 900000))
}

function seedMemory(store: MemoryStore): void {
  const now = new Date().toISOString()
  store.settings.set('pairing_code', pairingCode())
  store.settings.set('extension_id', '')
  store.settings.set('min_delay_seconds', '45')
  store.settings.set('max_delay_seconds', '120')
  store.settings.set('daily_post_limit', '25')
  store.settings.set('locale', 'he')
  store.settings.set('meta_connected', '0')
  store.settings.set('meta_account_label', '')
  store.settings.set('meta_access_token_enc', '')
  store.settings.set('last_group_sync_at', '')
  store.settings.set('last_extension_ping', '')
  store.settings.set('posts_published', '0')

  const collections: GroupCollection[] = [
    {
      id: 'col_realestate',
      name: 'קבוצות נדל״ן והשכרות',
      color: '#4F46E5',
      groupIds: [],
      createdAt: now,
    },
    { id: 'col_local', name: 'עסקים מקומיים', color: '#059669', groupIds: [], createdAt: now },
    { id: 'col_jobs', name: 'דרושים ועבודות', color: '#D97706', groupIds: [], createdAt: now },
  ]
  for (const c of collections) store.collections.set(c.id, c)

  // First-login: no groups until extension sync
  const schedules: ScheduledPost[] = [
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
  ]
  for (const s of schedules) store.schedules.set(s.id, s)
}

function getTurso(): Client | null {
  if (!env.hasTurso) return null
  if (!globalThis.__distroTursoClient) {
    globalThis.__distroTursoClient = createClient({
      url: env.tursoDatabaseUrl,
      authToken: env.tursoAuthToken,
    })
  }
  return globalThis.__distroTursoClient
}

async function ensureSchema(client: Client): Promise<void> {
  if (globalThis.__distroSchemaReady) return
  await client.batch(
    [
      `CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS collections (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        color TEXT NOT NULL DEFAULT '#4F46E5',
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS groups (
        id TEXT PRIMARY KEY,
        fb_group_id TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        url TEXT NOT NULL DEFAULT '',
        member_count INTEGER NOT NULL DEFAULT 0,
        avatar_url TEXT,
        active INTEGER NOT NULL DEFAULT 1,
        synced_at TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS collection_groups (
        collection_id TEXT NOT NULL,
        group_id TEXT NOT NULL,
        PRIMARY KEY (collection_id, group_id)
      )`,
      `CREATE TABLE IF NOT EXISTS schedules (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        media_urls TEXT NOT NULL DEFAULT '[]',
        collection_id TEXT,
        days TEXT NOT NULL DEFAULT '[]',
        time TEXT NOT NULL DEFAULT '09:00',
        status TEXT NOT NULL DEFAULT 'draft',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      )`,
    ],
    'write',
  )

  const existing = await client.execute('SELECT COUNT(*) AS c FROM settings')
  const count = Number(existing.rows[0]?.c ?? 0)
  if (count === 0) {
    const now = new Date().toISOString()
    await client.batch(
      [
        {
          sql: 'INSERT INTO settings (key, value) VALUES (?, ?)',
          args: ['pairing_code', pairingCode()],
        },
        { sql: 'INSERT INTO settings (key, value) VALUES (?, ?)', args: ['extension_id', ''] },
        { sql: 'INSERT INTO settings (key, value) VALUES (?, ?)', args: ['min_delay_seconds', '45'] },
        { sql: 'INSERT INTO settings (key, value) VALUES (?, ?)', args: ['max_delay_seconds', '120'] },
        { sql: 'INSERT INTO settings (key, value) VALUES (?, ?)', args: ['daily_post_limit', '25'] },
        { sql: 'INSERT INTO settings (key, value) VALUES (?, ?)', args: ['locale', 'he'] },
        { sql: 'INSERT INTO settings (key, value) VALUES (?, ?)', args: ['meta_connected', '0'] },
        { sql: 'INSERT INTO settings (key, value) VALUES (?, ?)', args: ['meta_account_label', ''] },
        { sql: 'INSERT INTO settings (key, value) VALUES (?, ?)', args: ['meta_access_token_enc', ''] },
        { sql: 'INSERT INTO settings (key, value) VALUES (?, ?)', args: ['last_group_sync_at', ''] },
        { sql: 'INSERT INTO settings (key, value) VALUES (?, ?)', args: ['last_extension_ping', ''] },
        { sql: 'INSERT INTO settings (key, value) VALUES (?, ?)', args: ['posts_published', '0'] },
        {
          sql: 'INSERT INTO collections (id, name, color, created_at) VALUES (?, ?, ?, ?)',
          args: ['col_realestate', 'קבוצות נדל״ן והשכרות', '#4F46E5', now],
        },
        {
          sql: 'INSERT INTO collections (id, name, color, created_at) VALUES (?, ?, ?, ?)',
          args: ['col_local', 'עסקים מקומיים', '#059669', now],
        },
        {
          sql: 'INSERT INTO collections (id, name, color, created_at) VALUES (?, ?, ?, ?)',
          args: ['col_jobs', 'דרושים ועבודות', '#D97706', now],
        },
      ],
      'write',
    )
  }
  globalThis.__distroSchemaReady = true
}

async function getSetting(key: string, fallback = ''): Promise<string> {
  const client = getTurso()
  if (!client) return memory().settings.get(key) ?? fallback
  await ensureSchema(client)
  const result = await client.execute({
    sql: 'SELECT value FROM settings WHERE key = ?',
    args: [key],
  })
  return String(result.rows[0]?.value ?? fallback)
}

async function setSetting(key: string, value: string): Promise<void> {
  const client = getTurso()
  if (!client) {
    memory().settings.set(key, value)
    return
  }
  await ensureSchema(client)
  await client.execute({
    sql: `INSERT INTO settings (key, value) VALUES (?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    args: [key, value],
  })
}

export async function listGroups(): Promise<FacebookGroup[]> {
  const client = getTurso()
  if (!client) return Array.from(memory().groups.values())

  await ensureSchema(client)
  const groupsResult = await client.execute('SELECT * FROM groups ORDER BY name COLLATE NOCASE')
  const links = await client.execute('SELECT collection_id, group_id FROM collection_groups')
  const byGroup = new Map<string, string[]>()
  for (const row of links.rows) {
    const gid = String(row.group_id)
    const cid = String(row.collection_id)
    if (!byGroup.has(gid)) byGroup.set(gid, [])
    byGroup.get(gid)!.push(cid)
  }

  return groupsResult.rows.map((row) => ({
    id: String(row.id),
    fbGroupId: String(row.fb_group_id),
    name: String(row.name),
    url: String(row.url ?? ''),
    memberCount: Number(row.member_count ?? 0),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    active: Number(row.active) === 1,
    collectionIds: byGroup.get(String(row.id)) ?? [],
    syncedAt: row.synced_at ? String(row.synced_at) : null,
  }))
}

export async function listCollections(): Promise<GroupCollection[]> {
  const client = getTurso()
  if (!client) return Array.from(memory().collections.values())

  await ensureSchema(client)
  const cols = await client.execute('SELECT * FROM collections ORDER BY name COLLATE NOCASE')
  const links = await client.execute('SELECT collection_id, group_id FROM collection_groups')
  const byCol = new Map<string, string[]>()
  for (const row of links.rows) {
    const cid = String(row.collection_id)
    const gid = String(row.group_id)
    if (!byCol.has(cid)) byCol.set(cid, [])
    byCol.get(cid)!.push(gid)
  }

  return cols.rows.map((row) => ({
    id: String(row.id),
    name: String(row.name),
    color: String(row.color),
    groupIds: byCol.get(String(row.id)) ?? [],
    createdAt: String(row.created_at),
  }))
}

export async function listSchedules(): Promise<ScheduledPost[]> {
  const client = getTurso()
  if (!client) return Array.from(memory().schedules.values())

  await ensureSchema(client)
  const result = await client.execute(`
    SELECT s.*, c.name AS collection_name
    FROM schedules s
    LEFT JOIN collections c ON c.id = s.collection_id
    ORDER BY s.updated_at DESC
  `)

  return result.rows.map((row) => ({
    id: String(row.id),
    title: String(row.title),
    body: String(row.body ?? ''),
    mediaUrls: JSON.parse(String(row.media_urls || '[]')) as string[],
    collectionId: row.collection_id ? String(row.collection_id) : null,
    collectionName: String(row.collection_name ?? ''),
    days: JSON.parse(String(row.days || '[]')) as DayOfWeek[],
    time: String(row.time),
    status: String(row.status) as ScheduleStatus,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }))
}

export async function getUserSettings(): Promise<UserSettings> {
  const enc = await getSetting('meta_access_token_enc')
  let metaAccessToken: string | null = null
  if (enc) {
    try {
      metaAccessToken = decryptToken(enc)
    } catch {
      metaAccessToken = null
    }
  }

  return {
    pairingCode: await getSetting('pairing_code', pairingCode()),
    extensionId: await getSetting('extension_id'),
    minDelaySeconds: Number(await getSetting('min_delay_seconds', '45')),
    maxDelaySeconds: Number(await getSetting('max_delay_seconds', '120')),
    dailyPostLimit: Number(await getSetting('daily_post_limit', '25')),
    locale: ((await getSetting('locale', 'en')) as LocaleCode) || 'en',
    metaConnected: (await getSetting('meta_connected')) === '1',
    metaAccountLabel: (await getSetting('meta_account_label')) || null,
    metaAccessToken,
    lastGroupSyncAt: (await getSetting('last_group_sync_at')) || null,
    postsPublished: Number(await getSetting('posts_published', '0')),
    apiBaseUrl: `${env.appUrl.replace(/\/$/, '')}/api`,
  }
}

export async function recordExtensionPing(extensionId?: string): Promise<{
  lastExtensionPing: string
}> {
  const now = new Date().toISOString()
  await setSetting('last_extension_ping', now)
  if (extensionId) await setSetting('extension_id', extensionId)
  return { lastExtensionPing: now }
}

export async function getLastExtensionPing(): Promise<string | null> {
  return (await getSetting('last_extension_ping')) || null
}

export async function getSyncStatus() {
  const [connection, groups, lastPing] = await Promise.all([
    getConnectionStatus(),
    listGroups(),
    getLastExtensionPing(),
  ])
  return {
    ...connection,
    lastExtensionPing: lastPing,
    groupCount: groups.length,
  }
}

function isRecent(iso: string | null, withinMs: number): boolean {
  if (!iso) return false
  const t = new Date(iso).getTime()
  return Number.isFinite(t) && Date.now() - t < withinMs
}

export async function getConnectionStatus(): Promise<ConnectionStatus> {
  const settings = await getUserSettings()
  const lastPing = await getLastExtensionPing()
  const last = settings.lastGroupSyncAt
  const extensionConnected =
    isRecent(lastPing, 1000 * 60 * 15) || isRecent(last, 1000 * 60 * 60 * 24)

  return {
    extensionConnected,
    lastExtensionPing: lastPing,
    lastGroupSyncAt: last,
    metaConnected: settings.metaConnected,
    metaAccountLabel: settings.metaAccountLabel,
    pairingCode: settings.pairingCode,
  }
}

export async function getDashboardStats(): Promise<DashboardStats> {
  const groups = await listGroups()
  const schedules = await listSchedules()
  const settings = await getUserSettings()
  return {
    syncedGroups: groups.filter((g) => g.active).length,
    activeSchedules: schedules.filter((s) => s.status === 'scheduled').length,
    postsPublished: settings.postsPublished,
  }
}

export async function getBootstrap(): Promise<AppBootstrap> {
  const [connection, stats, groups, collections, schedules, settings] = await Promise.all([
    getConnectionStatus(),
    getDashboardStats(),
    listGroups(),
    listCollections(),
    listSchedules(),
    getUserSettings(),
  ])
  return { connection, stats, groups, collections, schedules, settings }
}

export async function regeneratePairingCode(): Promise<string> {
  const code = pairingCode()
  await setSetting('pairing_code', code)
  return code
}

export async function verifyPairingCode(code: string): Promise<boolean> {
  const current = await getSetting('pairing_code')
  return Boolean(code) && code === current
}

export async function syncGroupsFromExtension(
  payload: ExtensionSyncPayload,
): Promise<{ count: number }> {
  const now = payload.syncedAt || new Date().toISOString()
  const client = getTurso()

  if (!client) {
    const store = memory()
    for (const g of payload.groups) {
      const existing = Array.from(store.groups.values()).find((x) => x.fbGroupId === g.fbGroupId)
      const groupId = existing?.id ?? id('g')
      store.groups.set(groupId, {
        id: groupId,
        fbGroupId: g.fbGroupId,
        name: g.name,
        url: g.url || `https://www.facebook.com/groups/${g.fbGroupId}`,
        memberCount: g.memberCount ?? 0,
        avatarUrl: g.avatarUrl ?? null,
        active: existing?.active ?? true,
        collectionIds: existing?.collectionIds ?? [],
        syncedAt: now,
      })
    }
    if (payload.extensionId) store.settings.set('extension_id', payload.extensionId)
    store.settings.set('last_group_sync_at', now)
    return { count: payload.groups.length }
  }

  await ensureSchema(client)
  for (const g of payload.groups) {
    const existing = await client.execute({
      sql: 'SELECT id FROM groups WHERE fb_group_id = ?',
      args: [g.fbGroupId],
    })
    const groupId = existing.rows[0] ? String(existing.rows[0].id) : id('g')
    await client.execute({
      sql: `INSERT INTO groups (id, fb_group_id, name, url, member_count, avatar_url, active, synced_at)
            VALUES (?, ?, ?, ?, ?, ?, 1, ?)
            ON CONFLICT(fb_group_id) DO UPDATE SET
              name = excluded.name,
              url = excluded.url,
              member_count = excluded.member_count,
              avatar_url = excluded.avatar_url,
              synced_at = excluded.synced_at`,
      args: [
        groupId,
        g.fbGroupId,
        g.name,
        g.url || `https://www.facebook.com/groups/${g.fbGroupId}`,
        g.memberCount ?? 0,
        g.avatarUrl ?? null,
        now,
      ],
    })
  }
  if (payload.extensionId) await setSetting('extension_id', payload.extensionId)
  await setSetting('last_group_sync_at', now)
  return { count: payload.groups.length }
}

export async function saveMetaTokens(input: {
  accessToken: string
  accountLabel: string
}): Promise<void> {
  const encrypted = encryptToken(input.accessToken)
  await setSetting('meta_access_token_enc', encrypted)
  await setSetting('meta_account_label', input.accountLabel)
  await setSetting('meta_connected', '1')
}

export async function clearMetaTokens(): Promise<void> {
  await setSetting('meta_access_token_enc', '')
  await setSetting('meta_account_label', '')
  await setSetting('meta_connected', '0')
}

export async function updatePostingSafety(input: {
  minDelaySeconds: number
  maxDelaySeconds: number
  dailyPostLimit: number
}): Promise<void> {
  await setSetting('min_delay_seconds', String(Math.max(0, Math.floor(input.minDelaySeconds))))
  await setSetting(
    'max_delay_seconds',
    String(Math.max(Math.floor(input.minDelaySeconds), Math.floor(input.maxDelaySeconds))),
  )
  await setSetting('daily_post_limit', String(Math.max(1, Math.floor(input.dailyPostLimit))))
}

export async function updateLocale(locale: LocaleCode): Promise<void> {
  await setSetting('locale', locale === 'he' ? 'he' : 'en')
}

export async function upsertSchedule(input: ScheduleInput): Promise<ScheduledPost> {
  const now = new Date().toISOString()
  const scheduleId = input.id ?? id('s')
  const collections = await listCollections()
  const collectionName =
    collections.find((c) => c.id === input.collectionId)?.name ?? ''

  const client = getTurso()
  if (!client) {
    const store = memory()
    const existing = store.schedules.get(scheduleId)
    const row: ScheduledPost = {
      id: scheduleId,
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
    store.schedules.set(scheduleId, row)
    return row
  }

  await ensureSchema(client)
  await client.execute({
    sql: `INSERT INTO schedules (id, title, body, media_urls, collection_id, days, time, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            title = excluded.title,
            body = excluded.body,
            media_urls = excluded.media_urls,
            collection_id = excluded.collection_id,
            days = excluded.days,
            time = excluded.time,
            status = excluded.status,
            updated_at = excluded.updated_at`,
    args: [
      scheduleId,
      input.title,
      input.body,
      JSON.stringify(input.mediaUrls),
      input.collectionId,
      JSON.stringify(input.days),
      input.time,
      input.status,
      now,
      now,
    ],
  })

  const all = await listSchedules()
  return all.find((s) => s.id === scheduleId)!
}

export function storageMode(): 'turso' | 'memory' {
  return env.hasTurso ? 'turso' : 'memory'
}
