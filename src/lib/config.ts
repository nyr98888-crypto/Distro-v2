/**
 * Client-side public config (only VITE_* vars are available in the browser).
 */

function trimSlash(url: string): string {
  return url.replace(/\/$/, '')
}

export const appConfig = {
  get appUrl(): string {
    const fromEnv = import.meta.env.VITE_APP_URL
    if (fromEnv && typeof fromEnv === 'string' && fromEnv.length > 0) {
      return trimSlash(fromEnv)
    }
    if (typeof window !== 'undefined' && window.location?.origin) {
      return trimSlash(window.location.origin)
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

  get metaConnectUrl(): string {
    return `${this.apiBaseUrl}/auth/meta`
  },

  get googleConnectUrl(): string {
    return `${this.apiBaseUrl}/auth/google`
  },

  get extensionStoreUrl(): string {
    const fromEnv = import.meta.env.VITE_EXTENSION_STORE_URL
    if (fromEnv && typeof fromEnv === 'string' && fromEnv.length > 0) {
      return fromEnv
    }
    return 'https://chromewebstore.google.com/'
  },
} as const
