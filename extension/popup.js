const PRODUCTION_APP = 'https://distrov2-teal.vercel.app'
const GROUPS_URL = 'https://www.facebook.com/groups/joins/'

const badge = document.getElementById('badge')
const badgeText = document.getElementById('badgeText')
const primaryBtn = document.getElementById('primaryBtn')
const syncBtn = document.getElementById('syncBtn')
const statusEl = document.getElementById('status')

function setStatus(msg, tone) {
  statusEl.textContent = msg || ''
  statusEl.classList.remove('ok', 'err')
  if (tone) statusEl.classList.add(tone)
}

function setConnected(connected) {
  badge.classList.toggle('ok', connected)
  badge.classList.toggle('wait', !connected)
  badgeText.textContent = connected ? 'מחובר' : 'לא מחובר'
  primaryBtn.textContent = connected ? 'פתח את Distro' : 'התחברות ל-Distro'
  syncBtn.hidden = !connected
}

async function getAuth() {
  return chrome.storage.local.get(['sessionToken', 'apiUrl'])
}

async function refreshUi() {
  const stored = await getAuth()
  setConnected(Boolean(stored.sessionToken))
  if (!stored.sessionToken) {
    setStatus('לחצו להתחברות באתר — התוסף יתחבר אוטומטית.', null)
  } else {
    setStatus('מוכנים לסנכרון קבוצות מפייסבוק.', 'ok')
  }
}

primaryBtn.addEventListener('click', async () => {
  const stored = await getAuth()
  const url = (stored.apiUrl || PRODUCTION_APP).replace(/\/$/, '')
  chrome.tabs.create({ url, active: true })
})

syncBtn.addEventListener('click', () => {
  void syncGroups()
})

async function syncGroups() {
  syncBtn.disabled = true
  setStatus('מסנכרן קבוצות...', null)
  try {
    const stored = await getAuth()
    const token = stored.sessionToken
    const apiUrl = (stored.apiUrl || PRODUCTION_APP).replace(/\/$/, '')
    if (!token) {
      setConnected(false)
      setStatus('יש להתחבר קודם באתר Distro.', 'err')
      return
    }

    const cookie = await chrome.cookies.get({
      url: 'https://www.facebook.com',
      name: 'c_user',
    })
    if (!cookie?.value) {
      setStatus('התחברו לפייסבוק ואז נסו שוב.', 'err')
      return
    }

    let [tab] = await chrome.tabs.query({
      url: ['https://www.facebook.com/*', 'https://*.facebook.com/*'],
    })
    if (!tab?.id) {
      tab = await chrome.tabs.create({ url: GROUPS_URL, active: true })
    } else if (!tab.url?.includes('/groups/joins')) {
      await chrome.tabs.update(tab.id, { url: GROUPS_URL, active: true })
    }
    await waitComplete(tab.id)
    await sleep(2000)

    const [{ result }] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeGroupsInPage,
    })

    const groups = (result?.groups || []).map((g) => ({
      name: g.name,
      fbGroupId: String(g.id),
      url: g.url,
      memberCount: g.memberCount,
      avatarUrl: null,
    }))

    if (!groups.length) {
      setStatus('לא נמצאו קבוצות. רעננו את עמוד הקבוצות ונסו שוב.', 'err')
      return
    }

    const res = await fetch(`${apiUrl}/api/sync-groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        extensionId: chrome.runtime.id,
        groups,
      }),
    })
    const body = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(body.error || `שגיאת שרת (${res.status})`)
    }

    setStatus(`הסנכרון הושלם! ${body.count ?? groups.length} קבוצות.`, 'ok')
  } catch (err) {
    setStatus(err instanceof Error ? err.message : 'שגיאה בסנכרון', 'err')
  } finally {
    syncBtn.disabled = false
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function waitComplete(tabId, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener)
      reject(new Error('טעינת העמוד ארכה יותר מדי'))
    }, timeoutMs)
    function listener(id, info) {
      if (id === tabId && info.status === 'complete') {
        clearTimeout(timer)
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
      }
    }
    chrome.tabs.get(tabId, (tab) => {
      if (chrome.runtime.lastError) {
        clearTimeout(timer)
        reject(new Error(chrome.runtime.lastError.message))
        return
      }
      if (tab.status === 'complete') {
        clearTimeout(timer)
        chrome.tabs.onUpdated.removeListener(listener)
        resolve()
        return
      }
      chrome.tabs.onUpdated.addListener(listener)
    })
  })
}

function scrapeGroupsInPage() {
  const reserved = new Set([
    'feed',
    'discover',
    'joins',
    'create',
    'search',
    'category',
    'requests',
    'notifications',
  ])
  const buckets = new Map()
  document.querySelectorAll('a[href*="/groups/"]').forEach((a) => {
    const href = a.href || a.getAttribute('href') || ''
    if (/\/groups\/[^/]+\/(user|members|permalink|posts)/i.test(href)) return
    let path = href
    try {
      path = new URL(href, location.origin).pathname
    } catch {
      path = String(href).split('?')[0]
    }
    const m = path.match(/\/groups\/([^/]+)/i)
    if (!m) return
    const id = decodeURIComponent(m[1]).trim()
    if (!id || reserved.has(id.toLowerCase())) return
    const name = (a.innerText || a.getAttribute('aria-label') || '')
      .replace(/\s+/g, ' ')
      .trim()
      .split('\n')[0]
    if (!name || name.length < 2 || name === id) return
    if (!buckets.has(id)) {
      buckets.set(id, {
        id,
        name,
        url: href.split('?')[0] || `https://www.facebook.com/groups/${id}`,
      })
    }
  })
  return { groups: Array.from(buckets.values()) }
}

void refreshUi()
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes.sessionToken || changes.apiUrl)) {
    void refreshUi()
  }
})
