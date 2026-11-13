/**
 * Central server-side environment config for Distro V2.
 * Used by Vercel serverless functions (and local `vercel dev`).
 */

function read(key: string, fallback = ''): string {
  const value = process.env[key]
  if (typeof value !== 'string') return fallback
  // Strip wrapping quotes often pasted into .env / Vercel UI
  return value.trim().replace(/^["']|["']$/g, '')
}

export const env = {
  /** Public app origin for redirects & client-facing URLs */
  get appUrl(): string {
    return read('APP_URL') || read('VITE_APP_URL') || 'http://localhost:5173'
  },

  get viteAppUrl(): string {
    return read('VITE_APP_URL') || read('APP_URL') || 'http://localhost:5173'
  },

  // Google OAuth (user login — Continue with Google)
  get googleClientId(): string {
    return read('GOOGLE_CLIENT_ID')
  },
  get googleClientSecret(): string {
    return read('GOOGLE_CLIENT_SECRET')
  },
  get googleRedirectUri(): string {
    return (
      read('GOOGLE_REDIRECT_URI') ||
      `${this.appUrl.replace(/\/$/, '')}/api/auth/google/callback`
    )
  },
  get hasGoogleOAuth(): boolean {
    return Boolean(this.googleClientId && this.googleClientSecret)
  },

  // Meta / Facebook OAuth
  get metaAppId(): string {
    return read('META_APP_ID')
  },
  get metaAppSecret(): string {
    return read('META_APP_SECRET')
  },
  get metaRedirectUri(): string {
    return (
      read('META_REDIRECT_URI') ||
      `${this.appUrl.replace(/\/$/, '')}/api/auth/meta/callback`
    )
  },
  get metaGraphVersion(): string {
    return read('META_GRAPH_VERSION', 'v27.0') || 'v27.0'
  },
  get metaConfigId(): string {
    return read('META_CONFIG_ID')
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

/** Throws if required Meta OAuth vars are missing. */
export function assertMetaConfigured(): void {
  if (!env.metaAppId || !env.metaAppSecret) {
    throw new Error(
      'META_APP_ID and META_APP_SECRET must be set in .env.local (or Vercel env).',
    )
  }
}

/** Throws if auth/encryption secrets are missing. */
export function assertAuthSecrets(): void {
  if (!env.authSecret || env.authSecret.length < 32) {
    throw new Error('AUTH_SECRET must be a random string of at least 32 characters.')
  }
  if (!env.tokenEncryptionKey || env.tokenEncryptionKey.length < 32) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY must be a random hex string of at least 32 characters.',
    )
  }
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
