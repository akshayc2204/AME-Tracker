const $ = (id) => document.getElementById(id)

let currentSettings = {}
let currentFilter = 'today'
let allPairs = []

function formatTimestamp(isoString) {
  if (!isoString) return 'Never'
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return 'Never'
    const isToday = d.toDateString() === new Date().toDateString()
    const timeStr = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    return isToday ? `Today at ${timeStr}` : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${timeStr}`
  } catch {
    return 'Never'
  }
}

function showLoginAlert(text) {
  const el = $('loginAlert')
  const textEl = $('loginAlertText')
  if (!text) {
    el.style.display = 'none'
    textEl.textContent = ''
    return
  }
  textEl.textContent = text
  el.style.display = 'flex'
}

function showDashAlert(text, type = 'success') {
  const el = $('dashAlert')
  const textEl = $('dashAlertText')
  if (!text) {
    el.style.display = 'none'
    textEl.textContent = ''
    return
  }
  textEl.textContent = text
  el.className = `alert-banner ${type}`
  // Bug fix #8: swap the SVG icon so errors show an X, not a checkmark
  const svg = el.querySelector('svg')
  if (svg) {
    if (type === 'error') {
      svg.innerHTML = '<circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line>'
    } else {
      svg.innerHTML = '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline>'
    }
  }
  el.style.display = 'flex'
  setTimeout(() => {
    el.style.display = 'none'
  }, 4000)
}

function setView(isLoggedIn) {
  const viewLogin = $('viewLogin')
  const viewDashboard = $('viewDashboard')

  if (isLoggedIn) {
    viewLogin.classList.remove('active')
    viewDashboard.classList.add('active')
  } else {
    viewDashboard.classList.remove('active')
    viewLogin.classList.add('active')
  }
}

function renderSettings(settings) {
  currentSettings = settings || {}
  const loggedIn = Boolean(settings.loggedIn)

  // Login view inputs
  $('apiUrl').value = settings.apiUrl || 'http://localhost:3000'
  if (settings.userEmail) {
    $('email').value = settings.userEmail
  }
  $('password').value = ''

  // Dashboard view items
  const userEmail = settings.userEmail || 'operator@ame.local'
  $('userEmailText').textContent = userEmail
  $('serverUrlText').textContent = settings.apiUrl || 'http://localhost:3000'

  const hasFolder = Boolean(settings.folderPath)
  const folderPathEl = $('folderPath')
  if (hasFolder) {
    folderPathEl.textContent = settings.folderPath
    folderPathEl.classList.remove('empty')
    $('openFolderBtn').style.display = 'inline-flex'
  } else {
    folderPathEl.textContent = 'No folder selected — choose folder to start syncing'
    folderPathEl.classList.add('empty')
    $('openFolderBtn').style.display = 'none'
  }

  // Bug fix #11: set the select value from actual persisted settings, not the HTML default
  const intervalEl = $('intervalMinutes')
  if (intervalEl) {
    intervalEl.value = String(settings.intervalMinutes || 2)
    // If the stored value doesn't match any option (e.g. custom), fall back to 2
    if (!intervalEl.value) intervalEl.value = '2'
  }

  // Status badge in topbar
  const connBadge = $('connBadge')
  const connBadgeText = $('connBadgeText')
  if (loggedIn) {
    connBadge.classList.remove('offline')
    connBadgeText.textContent = 'Active'
  } else {
    connBadge.classList.add('offline')
    connBadgeText.textContent = 'Offline'
  }

  // Last Check display from persisted settings
  if (settings.lastCheckedAt) {
    $('lastCheckTime').textContent = formatTimestamp(settings.lastCheckedAt)
    if (settings.lastCheckSummary) {
      $('lastCheckSummary').textContent = settings.lastCheckSummary
    }
  } else {
    $('lastCheckTime').textContent = 'Never'
    $('lastCheckSummary').textContent = 'Awaiting first scan'
  }

  // Switch visible screen
  setView(loggedIn)
}

function renderStatus(status) {
  if (!status) return

  const phase = (status.phase || 'idle').toLowerCase()
  const chip = $('statusChip')
  const label = $('statusLabel')
  const detail = $('statusDetail')

  // Update Last Check box in real time
  if (phase === 'running') {
    $('lastCheckTime').textContent = 'Scanning now…'
    $('lastCheckSummary').textContent = 'Checking files in watched folder'
  } else if (status.finishedAt) {
    $('lastCheckTime').textContent = formatTimestamp(status.finishedAt)
    if (status.message) {
      $('lastCheckSummary').textContent = status.message
    }
  }

  let labelText = status.label || 'Idle'
  if (phase === 'running') {
    labelText = 'Syncing…'
  } else if (phase === 'error') {
    labelText = 'Sync Error'
  } else if (status.imported > 0) {
    labelText = `${status.imported} Imported`
  } else if (status.failed > 0) {
    labelText = `${status.failed} Failed`
  } else if (status.skipped > 0) {
    labelText = 'Up to date'
  }
  label.textContent = labelText

  let detailText = status.message || 'Monitoring watched folder'
  if (detailText.includes('=')) {
    const total = (status.imported || 0) + (status.skipped || 0) + (status.failed || 0)
    detailText = total > 0
      ? `${total} pairs scanned • ${status.imported || 0} imported, ${status.skipped || 0} skipped`
      : 'Monitoring watched folder'
  }
  detail.textContent = detailText

  chip.className = `status-chip ${phase}`

  const hasStats =
    status.imported != null ||
    status.skipped != null ||
    status.failed != null ||
    status.incomplete != null

  if (hasStats) {
    $('statImported').textContent = String(status.imported ?? 0)
    $('statSkipped').textContent = String(status.skipped ?? 0)
    $('statIncomplete').textContent = String(status.incomplete ?? 0)
    $('statFailed').textContent = String(status.failed ?? 0)
  }

  if (status.pairs) {
    allPairs = status.pairs
  }

  // Bug fix #6: if the backend cleared our tokens (session expired), redirect to login
  if (phase === 'auth_error') {
    setView(false)
    showLoginAlert(status.message || 'Your session has expired. Please sign in again.')
    return
  }

  renderPairList()
}

function isSameDay(date1, date2 = new Date()) {
  if (!date1) return false
  try {
    const d1 = new Date(date1)
    const d2 = new Date(date2)
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    )
  } catch {
    return false
  }
}

function formatPairTime(isoOrDate) {
  if (!isoOrDate) return ''
  try {
    const d = new Date(isoOrDate)
    if (isNaN(d.getTime())) return ''
    const isT = isSameDay(d, new Date())
    const t = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return isT ? `Today ${t}` : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })} ${t}`
  } catch {
    return ''
  }
}

function filterPairs(pairs, filter) {
  if (!Array.isArray(pairs)) return []
  let res = []
  if (filter === 'imports') {
    res = pairs.filter((p) => p.status === 'SYNCED')
  } else if (filter === 'all') {
    res = [...pairs]
  } else {
    // Default 'today': only show today's activity or imports!
    res = pairs.filter((p) => {
      if (p.status === 'SYNCED') return true
      if (p.isToday || isSameDay(p.at) || isSameDay(p.mtime)) return true
      return false
    })
  }

  // Sort newest first by timestamp or mtime
  return res.sort((a, b) => {
    const tA = new Date(a.at || a.mtime || 0).getTime()
    const tB = new Date(b.at || b.mtime || 0).getTime()
    return tB - tA
  })
}

function renderPairList() {
  const filtered = filterPairs(allPairs, currentFilter)
  const list = $('pairList')
  const empty = $('emptyState')
  const emptyText = $('emptyStateText')
  const badge = $('pairCountBadge')

  const filterLabel = currentFilter === 'today' ? 'today' : (currentFilter === 'imports' ? 'imported' : 'total')
  badge.textContent = `${filtered.length} ${filterLabel}`

  if (filtered.length === 0) {
    empty.style.display = 'block'
    list.style.display = 'none'
    list.innerHTML = ''
    if (emptyText) {
      if (currentFilter === 'today') {
        emptyText.innerHTML = 'No activity recorded today.<br>Files imported or processed today will appear here.'
      } else if (currentFilter === 'imports') {
        emptyText.innerHTML = 'No imports recorded yet.<br>Files synced to AME Tracker will appear here.'
      } else {
        emptyText.innerHTML = 'No job pairs found in the watched folder.'
      }
    }
  } else {
    empty.style.display = 'none'
    list.style.display = 'block'
    list.innerHTML = ''

    for (const pair of filtered) {
      const li = document.createElement('li')
      li.className = 'pair-item'
      const statusClass = escapeHtml(pair.status || 'SYNCED')
      const timeStr = formatPairTime(pair.at || pair.mtime)
      li.innerHTML = `
        <div class="pair-header">
          <span class="pair-name">${escapeHtml(pair.pairKey || 'Job')}</span>
          <div class="pair-header-right">
            ${timeStr ? `<span class="pair-time">${escapeHtml(timeStr)}</span>` : ''}
            <span class="tag-status ${statusClass}">${statusClass}</span>
          </div>
        </div>
        <div class="pair-meta">
          <span>${escapeHtml(pair.message || 'Processed successfully')}</span>
          ${pair.sourceJobId ? `<span class="pair-job-id">Job: ${escapeHtml(pair.sourceJobId)}</span>` : ''}
        </div>
      `
      list.appendChild(li)
    }
  }
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function cleanError(err) {
  const raw = err?.message || String(err || 'Unknown error')
  // Strip Electron IPC wrapper text
  const m = raw.match(/Error invoking remote method '[^']+': (?:Error: )?(.+)$/s)
  // Collapse whitespace/newlines to a single space for clean UI display
  return (m ? m[1] : raw).replace(/\s+/g, ' ').trim()
}

async function refresh() {
  try {
    const settings = await window.ameAgent.getSettings()
    renderSettings(settings)
  } catch (err) {
    console.error('Failed to get settings:', err)
  }
}

// ─── Event Handlers ──────────────────────────────────────────────────────────

// Password Visibility Toggle
$('togglePwdBtn').addEventListener('click', () => {
  const pwdInput = $('password')
  const eyeIcon = $('eyeIcon')
  const eyeOffIcon = $('eyeOffIcon')
  if (pwdInput.type === 'password') {
    pwdInput.type = 'text'
    eyeIcon.style.display = 'none'
    eyeOffIcon.style.display = 'block'
  } else {
    pwdInput.type = 'password'
    eyeIcon.style.display = 'block'
    eyeOffIcon.style.display = 'none'
  }
})

// Toggle Server URL settings input
$('toggleServerBtn').addEventListener('click', () => {
  const box = $('serverBox')
  box.classList.toggle('hidden')
  if (!box.classList.contains('hidden')) {
    $('apiUrl').focus()
  }
})

// Login Action
$('loginBtn').addEventListener('click', async () => {
  showLoginAlert('')
  const email = $('email').value.trim()
  const password = $('password').value
  const apiUrl = $('apiUrl').value.trim() || 'http://localhost:3000'

  if (!email) {
    showLoginAlert('Please enter your admin email')
    $('email').focus()
    return
  }
  if (!password) {
    showLoginAlert('Please enter your password')
    $('password').focus()
    return
  }

  const btn = $('loginBtn')
  btn.classList.add('loading')
  btn.disabled = true

  try {
    await window.ameAgent.saveSettings({ apiUrl })
    const settings = await window.ameAgent.login(email, password)
    renderSettings(settings)
    await window.ameAgent.startWatching()
    showDashAlert('Authenticated successfully — Sync Agent is ready', 'success')
  } catch (err) {
    showLoginAlert(cleanError(err))
  } finally {
    btn.classList.remove('loading')
    btn.disabled = false
  }
})

// Allow Enter key to submit login
$('password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    $('loginBtn').click()
  }
})
$('email').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    $('loginBtn').click()
  }
})

// Logout Action
$('logoutBtn').addEventListener('click', async () => {
  try {
    const settings = await window.ameAgent.logout()
    renderSettings(settings)
    showLoginAlert('')
  } catch (err) {
    console.error('Logout failed:', err)
    setView(false)
  }
})

// Pick Folder Action
$('pickFolderBtn').addEventListener('click', async () => {
  try {
    const settings = await window.ameAgent.pickFolder()
    if (settings) {
      renderSettings(settings)
      showDashAlert('Watched folder updated successfully', 'success')
    }
  } catch (err) {
    showDashAlert(cleanError(err), 'error')
  }
})

// Open Folder in Explorer
$('openFolderBtn').addEventListener('click', async () => {
  if (currentSettings.folderPath && window.ameAgent.openFolder) {
    await window.ameAgent.openFolder(currentSettings.folderPath)
  }
})

// Interval Change
$('intervalMinutes').addEventListener('change', async (e) => {
  const intervalMinutes = Number(e.target.value) || 2
  try {
    const settings = await window.ameAgent.saveSettings({ intervalMinutes })
    currentSettings = settings
    showDashAlert(`Auto-sync interval set to ${intervalMinutes} min`, 'success')
  } catch (err) {
    showDashAlert(cleanError(err), 'error')
  }
})

// Manual Sync Action
$('syncBtn').addEventListener('click', async () => {
  const btn = $('syncBtn')
  btn.classList.add('syncing')
  btn.disabled = true

  try {
    await window.ameAgent.runSync()
  } catch (err) {
    renderStatus({
      phase: 'error',
      label: 'Error',
      message: cleanError(err),
      pairs: [],
    })
  } finally {
    btn.classList.remove('syncing')
    btn.disabled = false
  }
})

// Open Web Portal Link
$('serverUrlLink').addEventListener('click', async (e) => {
  e.preventDefault()
  const targetUrl = currentSettings.apiUrl || 'http://localhost:3000'
  if (window.ameAgent.openWebPortal) {
    await window.ameAgent.openWebPortal(targetUrl)
  }
})

// Activity Filter Switcher (Today / Imports / All)
document.querySelectorAll('.filter-pill').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.filter-pill').forEach((b) => b.classList.remove('active'))
    btn.classList.add('active')
    currentFilter = btn.dataset.filter || 'today'
    renderPairList()
  })
})

// Subscribe to live sync engine status events
window.ameAgent.onSyncStatus(renderStatus)

// Initialize
void refresh()
