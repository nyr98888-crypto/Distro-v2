/**
 * Web ↔ Distro Chrome Extension (v1.0.9) bridge.
 *
 * v1.0.9 listens for (read-only contract — do not change extension):
 *   { type: 'DISTRO_AUTH_SYNC', token: string, apiUrl: string }
 * via chrome.runtime.onMessageExternal + web-bridge postMessage
 *   { source: 'distro-web', type: 'DISTRO_AUTH_SYNC', token, apiUrl }
 */

/** Chrome Web Store ID for DISTRO - Smart Group Campaign Manager v1.0.9 */
const STORE_EXTENSION_ID = 'oogolchahhanackcmgicnnokaaehmkaj'

function readEnvExtensionId(): string {
  const vite = import.meta.env.VITE_EXTENSION_ID
  if (typeof vite === 'string' && /^[a-p]{32}$/i.test(vite.trim())) {
    return vite.trim()
  }
  // Also accept NEXT_PUBLIC_* if ever injected into the Vite define/env
  const next = (import.meta.env as Record<string, unknown>).NEXT_PUBLIC_EXTENSION_ID
  if (typeof next === 'string' && /^[a-p]{32}$/i.test(next.trim())) {
    return next.trim()
  }
  return STORE_EXTENSION_ID
}

/** Resolved production / env override extension ID. */
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

export function isExtensionBridgePresent(): boolean {
  try {
    return document.documentElement.getAttribute('data-distro-extension') === '1'
  } catch {
    return false
  }
}

/**
 * Push the logged-in session token to the Distro extension (v1.0.9 format).
 * Returns true when the extension acknowledges `{ ok: true }`, or when the
 * content-script bridge attribute is present after postMessage fallback.
 */
export function broadcastAuthToExtension(
  token: string,
  apiUrl: string,
): Promise<boolean> {
  const payload: DistroAuthSyncPayload = {
    type: 'DISTRO_AUTH_SYNC',
    token,
    apiUrl: apiUrl.replace(/\/$/, ''),
  }
  const extensionId = DISTRO_EXTENSION_ID

  return new Promise((resolve) => {
    let settled = false
    const finish = (ok: boolean) => {
      if (settled) return
      settled = true
      resolve(ok)
    }

    // Fallback path: web-bridge.js on distrov2-teal forwards to the SW
    try {
      window.postMessage({ source: 'distro-web', ...payload }, window.location.origin)
    } catch {
      /* ignore */
    }

    // Primary path: externally_connectable → onMessageExternal
    try {
      if (!window.chrome?.runtime?.sendMessage) {
        window.setTimeout(() => finish(isExtensionBridgePresent()), 400)
        return
      }
      window.chrome.runtime.sendMessage(extensionId, payload, (response) => {
        const err = window.chrome?.runtime?.lastError
        if (err) {
          console.warn('[Distro] extension sendMessage error', err.message, {
            extensionId,
          })
          // Bridge may still have received postMessage
          window.setTimeout(() => finish(isExtensionBridgePresent()), 350)
          return
        }
        const ok =
          Boolean(response && typeof response === 'object' && (response as { ok?: boolean }).ok) ||
          isExtensionBridgePresent()
        finish(ok)
      })
    } catch (err) {
      console.warn('[Distro] extension handshake failed', err)
      window.setTimeout(() => finish(isExtensionBridgePresent()), 350)
    }

    // Safety timeout
    window.setTimeout(() => finish(isExtensionBridgePresent()), 1500)
  })
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
    // Fallback: hand the same signed session token the web app already has
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

/** Fetch token and auto-sync to the v1.0.9 extension (call after Google login). */
export async function syncSessionToExtension(): Promise<boolean> {
  const data = await fetchExtensionToken()
  if (!data) return false
  return broadcastAuthToExtension(data.token, data.apiUrl)
}
