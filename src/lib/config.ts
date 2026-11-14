/**
 * Client-side public config (only VITE_* vars are available in the browser).
 */

function trimSlash(url: string): string {
  return url.replace(/\/$/, '')
}

/** Env vars required on Vercel for Google Sign-In (no Meta keys). */
export const REQUIRED_OAUTH_ENV_VARS = [
  'APP_URL',
  'VITE_APP_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_REDIRECT_URI',
  'AUTH_SECRET',
  'TOKEN_ENCRYPTION_KEY',
  'VITE_EXTENSION_ID',
] as const

export const appConfig = {
  /**
   * Public app origin. Prefer the live browser origin so production always
   * resolves to e.g. https://distrov2-teal.vercel.app — never a baked-in localhost.
   */
  get appUrl(): string {
    if (typeof window !== 'undefined' && window.location?.origin) {
      return trimSlash(window.location.origin)
    }
    const fromEnv = import.meta.env.VITE_APP_URL
    if (fromEnv && typeof fromEnv === 'string' && fromEnv.length > 0) {
      return trimSlash(fromEnv)
    }
    return 'http://localhost:5173'
  },

  get apiBaseUrl(): string {
    return `${this.appUrl}/api`
  },

  get syncGroupsUrl(): string {
    return `${this.apiBaseUrl}/sync-groups`
  },

  get syncStatusUrl(): string {
    return `${this.apiBaseUrl}/sync-status`
  },

  get groupsUrl(): string {
    return `${this.apiBaseUrl}/groups`
  },

  get extensionPingUrl(): string {
    return `${this.apiBaseUrl}/extension/ping`
  },

  get healthUrl(): string {
    return `${this.apiBaseUrl}/health`
  },

  get googleConnectUrl(): string {
    return `${this.apiBaseUrl}/auth/google`
  },

  get extensionStoreUrl(): string {
    const fromEnv = import.meta.env.VITE_EXTENSION_STORE_URL
    if (fromEnv && typeof fromEnv === 'string' && fromEnv.length > 0) {
      // Guard against duplicated KEY=VALUE paste accidents in .env
      const cleaned = fromEnv.includes('http')
        ? fromEnv.slice(fromEnv.indexOf('http'))
        : fromEnv
      return cleaned
    }
    return 'https://chromewebstore.google.com/detail/oogolchahhanackcmgicnnokaaehmkaj'
  },
} as const
