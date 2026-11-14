import type { VercelRequest, VercelResponse } from '@vercel/node'
import { env } from './env.js'
import { getConnectionStatus, storageMode } from './db.js'

export default async function handler(_req: VercelRequest, res: VercelResponse) {
  const connection = await getConnectionStatus()
  return res.status(200).json({
    ok: true,
    service: 'distro-v2',
    storage: storageMode(),
    appUrl: env.appUrl,
    connection,
  })
}
