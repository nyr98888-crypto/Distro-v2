/**
 * GET /api/groups — list synced Facebook groups.
 * Self-contained Turso web client (no native @libsql/client).
 */
import { createClient } from '@libsql/client/web'

type Req = {
  method?: string
  headers: Record<string, string | string[] | undefined>
}

type Res = {
  status: (code: number) => Res
  json: (body: unknown) => unknown
  setHeader: (name: string, value: string) => void
}

type GroupRow = {
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

function readEnv(key: string, fallback = ''): string {
  const value = process.env[key]
  if (typeof value !== 'string') return fallback
  return value.trim().replace(/^["']+|["']+$/g, '')
}

declare global {
  // eslint-disable-next-line no-var
  var __distroGroupsMemory: Map<string, GroupRow> | undefined
}

function memory(): Map<string, GroupRow> {
  if (!globalThis.__distroGroupsMemory) {
    globalThis.__distroGroupsMemory = new Map()
  }
  return globalThis.__distroGroupsMemory
}

async function listFromTurso(): Promise<GroupRow[] | null> {
  const url = readEnv('TURSO_DATABASE_URL')
  const authToken = readEnv('TURSO_AUTH_TOKEN')
  if (!url || !authToken) return null

  const client = createClient({ url, authToken })
  await client.execute(`
    CREATE TABLE IF NOT EXISTS groups (
      id TEXT PRIMARY KEY,
      fb_group_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      url TEXT NOT NULL DEFAULT '',
      member_count INTEGER NOT NULL DEFAULT 0,
      avatar_url TEXT,
      active INTEGER NOT NULL DEFAULT 1,
      synced_at TEXT
    )
  `)
  const result = await client.execute('SELECT * FROM groups ORDER BY name COLLATE NOCASE')
  return result.rows.map((row) => ({
    id: String(row.id),
    fbGroupId: String(row.fb_group_id),
    name: String(row.name),
    url: String(row.url ?? ''),
    memberCount: Number(row.member_count ?? 0),
    avatarUrl: row.avatar_url ? String(row.avatar_url) : null,
    active: Number(row.active) === 1,
    collectionIds: [],
    syncedAt: row.synced_at ? String(row.synced_at) : null,
  }))
}

export default async function handler(req: Req, res: Res) {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
    res.setHeader('Cache-Control', 'no-store')
    if (req.method === 'OPTIONS') return res.status(204).json({})
    if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' })

    let groups: GroupRow[] = []
    try {
      const fromTurso = await listFromTurso()
      groups = fromTurso ?? Array.from(memory().values())
    } catch (err) {
      console.warn('[api/groups] turso failed, using memory', err)
      groups = Array.from(memory().values())
    }

    return res.status(200).json({ groups, count: groups.length })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[api/groups]', message)
    return res.status(200).json({ groups: [], count: 0, error: message })
  }
}
