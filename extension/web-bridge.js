/**
 * Distro web ↔ extension bridge (runs on distrov2-teal / localhost).
 * Forwards DISTRO_AUTH_SYNC and other distro-web messages to the background.
 */
(function () {
  function announceReady() {
    try {
      document.documentElement.setAttribute('data-distro-extension', '1')
    } catch {
      /* ignore */
    }
    try {
      window.postMessage(
        {
          source: 'distro-extension',
          type: 'DISTRO_EXTENSION_READY',
          version: chrome.runtime?.getManifest?.()?.version || null,
        },
        window.location.origin,
      )
    } catch {
      /* ignore */
    }
  }

  announceReady()
  window.setTimeout(announceReady, 500)
  window.setTimeout(announceReady, 2000)

  window.addEventListener('message', (event) => {
    if (event.source !== window) return
    const data = event.data
    if (!data || data.source !== 'distro-web') return

    const type = data.type || data.action
    if (type === 'DISTRO_AUTH_SYNC') {
      chrome.runtime.sendMessage(
        {
          type: 'DISTRO_AUTH_SYNC',
          token: data.token,
          apiUrl: data.apiUrl,
        },
        () => void chrome.runtime.lastError,
      )
      return
    }

    const { source: _s, ...rest } = data
    chrome.runtime.sendMessage(rest, () => void chrome.runtime.lastError)
  })
})()
