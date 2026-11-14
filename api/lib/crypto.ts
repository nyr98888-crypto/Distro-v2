import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { env, assertAuthSecret, assertEncryptionKey } from '../env'

const ALGO = 'aes-256-gcm'

function keyFromEnv(): Buffer {
  assertEncryptionKey()
  // Accept raw 32-byte hex (64 chars) or derive a 32-byte key from any longer secret.
  const raw = env.tokenEncryptionKey
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, 'hex')
  }
  return createHash('sha256').update(raw).digest()
}

/** Encrypt a Meta access token (or any secret string) for DB storage. */
export function encryptToken(plaintext: string): string {
  const key = keyFromEnv()
  const iv = randomBytes(12)
  const cipher = createCipheriv(ALGO, key, iv)
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`
}

/** Decrypt a token previously stored with encryptToken. */
export function decryptToken(payload: string): string {
  const key = keyFromEnv()
  const [version, ivHex, tagHex, dataHex] = payload.split(':')
  if (version !== 'v1' || !ivHex || !tagHex || !dataHex) {
    throw new Error('Invalid encrypted token format')
  }
  const decipher = createDecipheriv(ALGO, key, Buffer.from(ivHex, 'hex'))
  decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(dataHex, 'hex')),
    decipher.final(),
  ])
  return decrypted.toString('utf8')
}

/** HMAC-friendly signed state for OAuth CSRF protection. */
export function signOAuthState(payload: Record<string, string>): string {
  assertAuthSecret()
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
  const sig = createHash('sha256')
    .update(`${body}.${env.authSecret}`)
    .digest('base64url')
  return `${body}.${sig}`
}

export function verifyOAuthState(state: string): Record<string, string> | null {
  try {
    assertAuthSecret()
    const [body, sig] = state.split('.')
    if (!body || !sig) return null
    const expected = createHash('sha256')
      .update(`${body}.${env.authSecret}`)
      .digest('base64url')
    if (sig !== expected) return null
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Record<
      string,
      string
    >
  } catch {
    return null
  }
}
