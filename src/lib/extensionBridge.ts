/**
 * Web ↔ Distro Chrome Extension (v1.0.9) bridge.
 * READ-ONLY contract (do not change extension files):
 *
 * Listens (background + web-bridge):
 *   { type: 'DISTRO_AUTH_SYNC', token: string, apiUrl: string }
 *   { type: 'DISTRO_PING' } / { action: 'PING' }
 *
 * web-bridge.js also forwards any other { source: 'distro-web', … } message
 * to the service worker. We emit SYNC_GROUPS / DISTRO_SYNC_GROUPS so a
 * future/patched SW can pull groups with zero clicks; v1.0.9 popup scrape
 * remains the scrape engine until then.
 */

const STORE_EXTENSION_ID = 'oogolchahhanackcmgicnnokaaehmkaj'

function readEnvExtensionId(): string {
  const vite = import.meta.env.VITE_EXTENSION_ID
  if (typeof vite === 'string' && /^[a-p]{32}$/i.test(vite.trim())) {
    return vite.trim()
  }
  const next = (import.meta.env as Record<string, unknown>).NEXT_PUBLIC_EXTENSION_ID
  if (typeof next === 'string' && /^[a-p]{32}$/i.test(next.trim())) {
    return next.trim()
  }
  return STORE_EXTENSION_ID
}

export const DISTRO_EXTENSION_ID = readEnvExtensionId()

export type DistroAuthSyncPayload = {
  type: 'DISTRO_AUTH_SYNC'
  token: string
  apiUrl: string
}

declare global {
  interface Window {
    chrome?: {
      runtime?: {
        sendMessage?: (
          extensionId: string,
          message: unknown,
          responseCallback?: (response: unknown) => void,
        ) => void
        lastError?: { message?: string }
      }
    }
  }
}

function postToBridge(message: Record<string, unknown>): void {
  try {
    window.postMessage({ source: 'distro-web', ...message }, window.location.origin)
  } catch {
    /* ignore */
  }
}

function sendExternal(message: unknown): Promise<boolean> {
  return new Promise((resolve) => {
    try {
      if (!window.chrome?.runtime?.sendMessage) {
        resolve(false)
        return
      }
      window.chrome.runtime.sendMessage(DISTRO_EXTENSION_ID, message, (response) => {
        const err = window.chrome?.runtime?.lastError
        if (err) {
          resolve(false)
          return
        }
        resolve(
          Boolean(
            response && typeof response === 'object' && (response as { ok?: boolean }).ok,
          ),
        )
      })
      window.setTimeout(() => resolve(false), 1200)
    } catch {
      resolve(false)
    }
  })
}

export function isExtensionBridgePresent(): boolean {
  try {
    return document.documentElement.getAttribute('data-distro-extension') === '1'
  } catch {
    return false
  }
}

/** Push session token to v1.0.9 (DISTRO_AUTH_SYNC). */
export function broadcastAuthToExtension(token: string, apiUrl: string): Promise<boolean> {
  const payload: DistroAuthSyncPayload = {
    type: 'DISTRO_AUTH_SYNC',
    token,
    apiUrl: apiUrl.replace(/\/$/, ''),
  }

  return new Promise((resolve) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      resolve(ok)
    }

    postToBridge(payload)

    void sendExternal(payload).then((ok) => {
      if (ok) finish(true)
      else window.setTimeout(() => finish(isExtensionBridgePresent()), 350)
    })

    window.setTimeout(() => finish(isExtensionBridgePresent()), 1500)
  })
}

/**
 * Ask the extension to pull Facebook groups (zero UI clicks).
 * Emits every known alias; web-bridge forwards to the SW.
 */
export function requestExtensionGroupSync(token?: string, apiUrl?: string): void {
  const base = (apiUrl || window.location.origin).replace(/\/$/, '')
  const variants: Record<string, unknown>[] = [
    { type: 'DISTRO_SYNC_GROUPS', token, apiUrl: base },
    { type: 'SYNC_GROUPS', token, apiUrl: base },
    { action: 'SYNC_GROUPS', token, apiUrl: base },
    { type: 'DISTRO_PULL_GROUPS', token, apiUrl: base },
  ]
  for (const msg of variants) {
    postToBridge(msg)
    void sendExternal(msg)
  }
}

export async function fetchExtensionToken(): Promise<{ token: string; apiUrl: string } | null> {
  const origin =
    typeof window !== 'undefined' ? window.location.origin.replace(/\/$/, '') : ''

  try {
    const { authHeaders, getStoredSessionToken } = await import('./sessionStore')
    const res = await fetch('/api/extension/token', {
      credentials: 'include',
      cache: 'no-store',
      headers: { ...authHeaders() },
    })
    if (res.ok) {
      const json = (await res.json()) as { token?: string; apiUrl?: string }
      if (json.token) {
        return {
          token: json.token,
          apiUrl: (json.apiUrl || origin).replace(/\/$/, ''),
        }
      }
    }
    const local = getStoredSessionToken()
    if (local) return { token: local, apiUrl: origin }
    return null
  } catch {
    try {
      const { getStoredSessionToken } = await import('./sessionStore')
      const local = getStoredSessionToken()
      if (local) return { token: local, apiUrl: origin }
    } catch {
      /* ignore */
    }
    return null
  }
}

/** Auth handshake only. */
export async function syncSessionToExtension(): Promise<boolean> {
  const data = await fetchExtensionToken()
  if (!data) return false
  return broadcastAuthToExtension(data.token, data.apiUrl)
}

/**
 * One-shot after Google sign-in: AUTH + SYNC_GROUPS trigger + groups poll hook.
 * Returns true when AUTH was acknowledged / bridge present.
 */
export async function connectAndAutoSyncExtension(): Promise<boolean> {
  const data = await fetchExtensionToken()
  if (!data) return false

  const ok = await broadcastAuthToExtension(data.token, data.apiUrl)
  // Fire immediately and again shortly (bridge may load after OAuth redirect).
  requestExtensionGroupSync(data.token, data.apiUrl)
  window.setTimeout(() => requestExtensionGroupSync(data.token, data.apiUrl), 800)
  window.setTimeout(() => requestExtensionGroupSync(data.token, data.apiUrl), 2500)
  return ok || isExtensionBridgePresent()
}

/**
 * Keep AUTH+SYNC alive: on bridge ready, focus, and periodic retry while signed in.
 * Returns a cleanup function.
 */
export function startAutoExtensionLoop(onSynced?: () => void): () => void {
  let cancelled = false

  const run = async () => {
    if (cancelled) return
    const ok = await connectAndAutoSyncExtension()
    if (ok) onSynced?.()
  }

  void run()

  const onMessage = (event: MessageEvent) => {
    if (event.source !== window) return
    const data = event.data
    if (!data || data.source !== 'distro-extension') return
    if (data.type === 'DISTRO_EXTENSION_READY') {
      void run()
    }
  }

  const onFocus = () => void run()
  window.addEventListener('message', onMessage)
  window.addEventListener('focus', onFocus)
  const interval = window.setInterval(() => void run(), 15000)

  return () => {
    cancelled = true
    window.removeEventListener('message', onMessage)
    window.removeEventListener('focus', onFocus)
    window.clearInterval(interval)
  }
}
