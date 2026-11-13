const PRODUCTION_APP = 'https://distrov2-teal.vercel.app'
const GROUPS_URL = 'https://www.facebook.com/groups/joins/'

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.set({
    apiUrl: PRODUCTION_APP,
    apiBase: PRODUCTION_APP,
  })
})

chrome.runtime.onStartup.addListener(() => {
  chrome.storage.local.set({
    apiUrl: PRODUCTION_APP,
    apiBase: PRODUCTION_APP,
  })
})

function saveAuth(token, apiUrl) {
  const base = (apiUrl || PRODUCTION_APP).replace(/\/$/, '')
  return chrome.storage.local.set({
    sessionToken: token,
    apiUrl: base,
    apiBase: base,
    authenticatedAt: Date.now(),
  })
}

/** Messages from web-bridge content script */
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== 'object') return false

  if (message.type === 'DISTRO_AUTH_SYNC' && typeof message.token === 'string') {
    void saveAuth(message.token, message.apiUrl).then(() => {
      sendResponse({ ok: true })
      void pingServer(message.token, message.apiUrl)
    })
    return true
  }

  if (message.type === 'DISTRO_PING' || message.action === 'PING') {
    chrome.storage.local.get(['sessionToken', 'apiUrl'], (stored) => {
      sendResponse({
        ok: true,
        connected: Boolean(stored.sessionToken),
        apiUrl: stored.apiUrl || PRODUCTION_APP,
      })
    })
    return true
  }

  return false
})

/** Messages from the web app via chrome.runtime.sendMessage(extensionId, …) */
chrome.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
  const origin = sender.url || ''
  const allowed =
    origin.startsWith('https://distrov2-teal.vercel.app') ||
    origin.startsWith('http://localhost:5173') ||
    origin.startsWith('http://127.0.0.1:5173')

  if (!allowed) {
    sendResponse({ ok: false, error: 'origin_not_allowed' })
    return false
  }

  if (message?.type === 'DISTRO_AUTH_SYNC' && typeof message.token === 'string') {
    void saveAuth(message.token, message.apiUrl || PRODUCTION_APP).then(() => {
      sendResponse({ ok: true })
      void pingServer(message.token, message.apiUrl || PRODUCTION_APP)
    })
    return true
  }

  sendResponse({ ok: false })
  return false
})

async function pingServer(token, apiUrl) {
  const base = (apiUrl || PRODUCTION_APP).replace(/\/$/, '')
  try {
    await fetch(`${base}/api/extension/ping`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ extensionId: chrome.runtime.id }),
    })
  } catch {
    /* offline / CORS — ignore */
  }
}

chrome.action.onClicked.addListener(() => {
  chrome.tabs.create({ url: PRODUCTION_APP })
})
