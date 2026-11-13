/** Distro Chrome Extension ID (Chrome Web Store). */
export const DISTRO_EXTENSION_ID = 'oogolchahhanackcmgicnnokaaehmkaj'

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

/**
 * Push the logged-in session token to the Distro Chrome extension.
 * Uses chrome.runtime.sendMessage (externally_connectable) + window.postMessage
 * so a content-script bridge on our domain can catch it immediately.
 */
export function broadcastAuthToExtension(token: string, apiUrl: string): void {
  const payload: DistroAuthSyncPayload = {
    type: 'DISTRO_AUTH_SYNC',
    token,
    apiUrl: apiUrl.replace(/\/$/, ''),
  }

  try {
    window.postMessage({ source: 'distro-web', ...payload }, window.location.origin)
  } catch {
    /* ignore */
  }

  try {
    window.chrome?.runtime?.sendMessage?.(DISTRO_EXTENSION_ID, payload, () => {
      void window.chrome?.runtime?.lastError
    })
  } catch {
    /* ignore — extension not installed or wrong context */
  }
}

export async function fetchExtensionToken(): Promise<{ token: string; apiUrl: string } | null> {
  try {
    const res = await fetch('/api/extension/token', {
      credentials: 'include',
      cache: 'no-store',
    })
    if (!res.ok) return null
    const json = (await res.json()) as { token?: string; apiUrl?: string }
    if (!json.token || !json.apiUrl) return null
    return { token: json.token, apiUrl: json.apiUrl }
  } catch {
    return null
  }
}

/** Fetch token and auto-sync to the extension (call after login). */
export async function syncSessionToExtension(): Promise<boolean> {
  const data = await fetchExtensionToken()
  if (!data) return false
  broadcastAuthToExtension(data.token, data.apiUrl)
  return true
}
