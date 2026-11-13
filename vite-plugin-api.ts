import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.from(chunk))
  if (chunks.length === 0) return {}
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return {}
  }
}

function send(res: ServerResponse, status: number, body: unknown): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, x-pairing-code, x-extension-sync-secret',
  )
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.end(JSON.stringify(body))
}

/**
 * Lightweight local API for `vite` so onboarding polling works without `vercel dev`.
 */
export function distroLocalApi(): Plugin {
  return {
    name: 'distro-local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url?.split('?')[0] ?? ''
        if (!url.startsWith('/api/')) return next()

        if (req.method === 'OPTIONS') {
          send(res, 204, {})
          return
        }

        try {
          const db = await import('./api/db')

          if (url === '/api/health' && req.method === 'GET') {
            const connection = await db.getConnectionStatus()
            send(res, 200, {
              ok: true,
              service: 'distro-v2',
              storage: db.storageMode(),
              connection,
            })
            return
          }

          if (url === '/api/sync-status' && req.method === 'GET') {
            send(res, 200, await db.getSyncStatus())
            return
          }

          if (url === '/api/groups' && req.method === 'GET') {
            const groups = await db.listGroups()
            send(res, 200, { groups, count: groups.length })
            return
          }

          if (url === '/api/extension/ping' && req.method === 'POST') {
            const pairing =
              (req.headers['x-pairing-code'] as string | undefined) ?? ''
            if (!(await db.verifyPairingCode(pairing))) {
              send(res, 401, { error: 'invalid_pairing_code' })
              return
            }
            const body = (await readJson(req)) as { extensionId?: string }
            const result = await db.recordExtensionPing(body.extensionId)
            send(res, 200, {
              ok: true,
              extensionConnected: true,
              lastExtensionPing: result.lastExtensionPing,
            })
            return
          }

          if (url === '/api/sync-groups' && req.method === 'POST') {
            const pairing =
              (req.headers['x-pairing-code'] as string | undefined) ?? ''
            if (!(await db.verifyPairingCode(pairing))) {
              send(res, 401, { error: 'invalid_pairing_code' })
              return
            }
            const body = (await readJson(req)) as {
              extensionId?: string
              groups?: Array<{
                name: string
                fbGroupId: string
                url?: string
                memberCount?: number
                avatarUrl?: string | null
              }>
            }
            const result = await db.syncGroupsFromExtension({
              extensionId: body.extensionId,
              groups: body.groups ?? [],
            })
            await db.recordExtensionPing(body.extensionId)
            send(res, 200, { ok: true, count: result.count })
            return
          }

          send(res, 404, { error: 'not_found' })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'server_error'
          send(res, 500, { error: message })
        }
      })
    },
  }
}
