import type { Plugin } from 'vite'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { URL } from 'node:url'

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

function send(res: ServerResponse, status: number, body: unknown, extraHeaders?: Record<string, string>): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', extraHeaders?.['Access-Control-Allow-Origin'] || '*')
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, Authorization, x-extension-sync-secret',
  )
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  if (extraHeaders) {
    for (const [k, v] of Object.entries(extraHeaders)) {
      if (k !== 'Access-Control-Allow-Origin') res.setHeader(k, v)
    }
  }
  res.end(JSON.stringify(body))
}

function toVercelLike(req: IncomingMessage, url: URL) {
  const cookies = req.headers.cookie
  return {
    method: req.method,
    headers: req.headers as Record<string, string | string[] | undefined>,
    query: Object.fromEntries(url.searchParams.entries()),
    body: undefined as unknown,
  }
}

/**
 * Local API for `vite` — mirrors Vercel serverless auth + sync routes.
 */
export function distroLocalApi(): Plugin {
  return {
    name: 'distro-local-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url ?? '/'
        if (!rawUrl.startsWith('/api/')) return next()
        const url = new URL(rawUrl, 'http://127.0.0.1')

        if (req.method === 'OPTIONS') {
          send(res, 204, {})
          return
        }

        try {
          const vercelReq = toVercelLike(req, url) as import('@vercel/node').VercelRequest
          const vercelRes = {
            statusCode: 200,
            headers: {} as Record<string, string | string[]>,
            status(code: number) {
              this.statusCode = code
              return this
            },
            json(body: unknown) {
              send(res, this.statusCode, body, flattenHeaders(this.headers))
              return this
            },
            send(body: string) {
              res.statusCode = this.statusCode
              applyHeaders(res, this.headers)
              res.end(body)
              return this
            },
            end() {
              res.statusCode = this.statusCode
              applyHeaders(res, this.headers)
              res.end()
              return this
            },
            redirect(code: number, location: string) {
              res.statusCode = code
              applyHeaders(res, this.headers)
              res.setHeader('Location', location)
              res.end()
              return this
            },
            setHeader(key: string, value: string | string[]) {
              this.headers[key] = value
              return this
            },
            getHeader(key: string) {
              return this.headers[key]
            },
          } as unknown as import('@vercel/node').VercelResponse

          if (url.pathname === '/api/auth/google' && req.method === 'GET') {
            const handler = (await import('./api/auth/google')).default
            await handler(vercelReq, vercelRes)
            return
          }
          if (url.pathname === '/api/auth/google/callback' && req.method === 'GET') {
            const handler = (await import('./api/auth/google/callback')).default
            await handler(vercelReq, vercelRes)
            return
          }
          if (url.pathname === '/api/auth/me' && req.method === 'GET') {
            const handler = (await import('./api/auth/me')).default
            await handler(vercelReq, vercelRes)
            return
          }
          if (url.pathname === '/api/auth/logout' && (req.method === 'GET' || req.method === 'POST')) {
            const handler = (await import('./api/auth/logout')).default
            await handler(vercelReq, vercelRes)
            return
          }
          if (url.pathname === '/api/extension/token' && req.method === 'GET') {
            const handler = (await import('./api/extension/token')).default
            await handler(vercelReq, vercelRes)
            return
          }

          const db = await import('./api/db')
          const session = await import('./api/lib/session')

          if (url.pathname === '/api/health' && req.method === 'GET') {
            send(res, 200, {
              ok: true,
              service: 'distro-v2',
              storage: db.storageMode(),
              connection: await db.getConnectionStatus(),
            })
            return
          }

          if (url.pathname === '/api/sync-status' && req.method === 'GET') {
            send(res, 200, await db.getSyncStatus())
            return
          }

          if (url.pathname === '/api/groups' && req.method === 'GET') {
            const handler = (await import('./api/groups')).default
            await handler(vercelReq, vercelRes)
            return
          }

          if (url.pathname === '/api/extension/ping' && req.method === 'POST') {
            const body = (await readJson(req)) as { extensionId?: string }
            ;(vercelReq as { body?: unknown }).body = body
            const handler = (await import('./api/extension/ping')).default
            await handler(vercelReq, vercelRes)
            return
          }

          if (
            (url.pathname === '/api/sync-groups' || url.pathname === '/api/groups/sync') &&
            req.method === 'POST'
          ) {
            const body = await readJson(req)
            ;(vercelReq as { body?: unknown }).body = body
            const handler = (await import('./api/sync-groups')).default
            await handler(vercelReq, vercelRes)
            return
          }

          // silence unused
          void session

          send(res, 404, { error: 'not_found' })
        } catch (error) {
          const message = error instanceof Error ? error.message : 'server_error'
          send(res, 500, { error: message })
        }
      })
    },
  }
}

function flattenHeaders(headers: Record<string, string | string[]>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(headers)) {
    out[k] = Array.isArray(v) ? v.join(', ') : v
  }
  return out
}

function applyHeaders(res: ServerResponse, headers: Record<string, string | string[]>) {
  for (const [k, v] of Object.entries(headers)) {
    res.setHeader(k, v)
  }
}
