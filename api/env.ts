/**
 * Central server-side environment config for Distro V2.
 * Used by Vercel serverless functions (and local `vercel dev`).
 *
 * Note: Meta Graph API keys are intentionally NOT used. Publishing goes through
 * the user's Chrome facebook.com session via the Distro extension (v1.0.9).
 */

function read(key: string, fallback = ''): string {
  const value = process.env[key]
  if (typeof value !== 'string') return fallback
  // Strip wrapping quotes often pasted into .env / Vercel UI
  return value.trim().replace(/^["']+|["']+$/g, '')
}

export const env = {
  /** Public app origin for redirects & client-facing URLs */
  get appUrl(): string {
    const explicit = read('APP_URL') || read('VITE_APP_URL')
    if (explicit) return explicit.replace(/\/$/, '')
    // Vercel sets VERCEL_URL without protocol (e.g. distrov2-teal.vercel.app)
    const vercel = read('VERCEL_URL')
    if (vercel) return `https://${vercel.replace(/^https?:\/\//, '').replace(/\/$/, '')}`
    return 'http://localhost:5173'
  },

  get viteAppUrl(): string {
    return read('VITE_APP_URL') || this.appUrl
  },

  // Google OAuth (sole account sign-in)
  get googleClientId(): string {
    return read('GOOGLE_CLIENT_ID')
  },
  get googleClientSecret(): string {
    return read('GOOGLE_CLIENT_SECRET')
  },
  get googleRedirectUri(): string {
    const derived = `${this.appUrl.replace(/\/$/, '')}/api/auth/google/callback`
    const explicit = read('GOOGLE_REDIRECT_URI')
    if (!explicit) return derived
    // Ignore a localhost leftover when APP_URL is production (common Vercel misconfig)
    try {
      if (new URL(explicit).host !== new URL(this.appUrl).host) return derived
    } catch {
      return derived
    }
    return explicit
  },
  get hasGoogleOAuth(): boolean {
    return Boolean(this.googleClientId && this.googleClientSecret)
  },

  // Auth / encryption
  get authSecret(): string {
    return read('AUTH_SECRET')
  },
  get tokenEncryptionKey(): string {
    return read('TOKEN_ENCRYPTION_KEY')
  },

  // Turso
  get tursoDatabaseUrl(): string {
    return read('TURSO_DATABASE_URL')
  },
  get tursoAuthToken(): string {
    return read('TURSO_AUTH_TOKEN')
  },
  get hasTurso(): boolean {
    return Boolean(this.tursoDatabaseUrl && this.tursoAuthToken)
  },

  // Extension + cron
  get extensionSyncSecret(): string {
    return read('EXTENSION_SYNC_SECRET')
  },
  get cronSecret(): string {
    return read('CRON_SECRET')
  },
} as const

export type ServerEnv = typeof env

/** Throws if required Google OAuth vars are missing. */
export function assertGoogleConfigured(): void {
  if (!env.googleClientId || !env.googleClientSecret) {
    throw new Error(
      'GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env.local (or Vercel env).',
    )
  }
}

/** HMAC / session signing only — required for Google OAuth start. */
export function assertAuthSecret(): void {
  if (!env.authSecret || env.authSecret.length < 32) {
    throw new Error('AUTH_SECRET must be a random string of at least 32 characters.')
  }
}

/** Token-at-rest encryption — not required to start Google OAuth. */
export function assertEncryptionKey(): void {
  if (!env.tokenEncryptionKey || env.tokenEncryptionKey.length < 32) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY must be a random hex string of at least 32 characters.',
    )
  }
}

/** Throws if auth/encryption secrets are missing. */
export function assertAuthSecrets(): void {
  assertAuthSecret()
  assertEncryptionKey()
}

/** Validates Authorization: Bearer <CRON_SECRET> or x-cron-secret header. */
export function isValidCronRequest(req: {
  headers: Record<string, string | string[] | undefined>
}): boolean {
  const secret = env.cronSecret
  if (!secret) return false

  const auth = req.headers.authorization
  const authValue = Array.isArray(auth) ? auth[0] : auth
  if (authValue === `Bearer ${secret}`) return true

  const header = req.headers['x-cron-secret']
  const headerValue = Array.isArray(header) ? header[0] : header
  return headerValue === secret
}

/** Validates x-extension-sync-secret (optional hardening alongside pairing code). */
export function isValidExtensionSyncSecret(req: {
  headers: Record<string, string | string[] | undefined>
}): boolean {
  const secret = env.extensionSyncSecret
  if (!secret) return true // optional when unset locally

  const header = req.headers['x-extension-sync-secret']
  const headerValue = Array.isArray(header) ? header[0] : header
  return headerValue === secret
}
