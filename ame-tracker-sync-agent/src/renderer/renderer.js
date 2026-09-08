const $ = (id) => document.getElementById(id)

function showMsg(el, text, type) {
  if (!text) {
    el.hidden = true
    el.textContent = ''
    return
  }
  el.hidden = false
  el.textContent = text
  el.className = `msg ${type || ''}`
}

function renderSettings(settings) {
  $('apiUrl').value = settings.apiUrl || ''
  $('intervalMinutes').value = String(settings.intervalMinutes || 2)
  $('folderPath').textContent = settings.folderPath || 'No folder selected'
  $('email').value = settings.userEmail || $('email').value

  const loggedIn = Boolean(settings.loggedIn)
  $('connBadge').textContent = loggedIn ? `Logged in${settings.userEmail ? ` · ${settings.userEmail}` : ''}` : 'Offline'
  $('connBadge').classList.toggle('on', loggedIn)
  $('logoutBtn').hidden = !loggedIn
  $('loginBtn').textContent = loggedIn ? 'Re-login' : 'Log in'
  $('password').value = ''
}

function renderStatus(status) {
  if (!status) return
  $('statusLabel').textContent = status.label || status.phase || 'Status'
  $('statusMessage').textContent = status.message || ''

  const hasStats =
    status.imported != null ||
    status.skipped != null ||
    status.failed != null ||
    status.incomplete != null
  $('stats').hidden = !hasStats
  if (hasStats) {
    $('statImported').textContent = String(status.imported ?? 0)
    $('statSkipped').textContent = String(status.skipped ?? 0)
    $('statIncomplete').textContent = String(status.incomplete ?? 0)
    $('statFailed').textContent = String(status.failed ?? 0)
  }

  const list = $('pairList')
  list.innerHTML = ''
  for (const pair of status.pairs || []) {
    const li = document.createElement('li')
    li.innerHTML = `
      <div class="name">${escapeHtml(pair.pairKey)}
        <span class="tag ${escapeHtml(pair.status)}">${escapeHtml(pair.status)}</span>
      </div>
      <div class="meta">${escapeHtml(pair.message || '')}</div>
    `
    list.appendChild(li)
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
  const m = raw.match(/Error invoking remote method '[^']+': (?:Error: )?(.+)$/s)
  return (m ? m[1] : raw).trim()
}

async function refresh() {
  const settings = await window.ameAgent.getSettings()
  renderSettings(settings)
}

$('loginBtn').addEventListener('click', async () => {
  showMsg($('loginMsg'), '')
  try {
    await window.ameAgent.saveSettings({ apiUrl: $('apiUrl').value.trim() })
    await window.ameAgent.login($('email').value.trim(), $('password').value)
    showMsg($('loginMsg'), 'Logged in', 'ok')
    await refresh()
    await window.ameAgent.startWatching()
  } catch (err) {
    showMsg($('loginMsg'), cleanError(err), 'error')
  }
})

$('logoutBtn').addEventListener('click', async () => {
  await window.ameAgent.logout()
  showMsg($('loginMsg'), 'Logged out', 'ok')
  await refresh()
})

$('pickFolderBtn').addEventListener('click', async () => {
  const settings = await window.ameAgent.pickFolder()
  if (settings) {
    renderSettings(settings)
    showMsg($('settingsMsg'), 'Folder selected', 'ok')
  }
})

$('saveBtn').addEventListener('click', async () => {
  showMsg($('settingsMsg'), '')
  try {
    const settings = await window.ameAgent.saveSettings({
      apiUrl: $('apiUrl').value.trim(),
      intervalMinutes: Number($('intervalMinutes').value) || 2,
    })
    renderSettings(settings)
    await window.ameAgent.startWatching()
    showMsg($('settingsMsg'), 'Settings saved — watching folder', 'ok')
  } catch (err) {
    showMsg($('settingsMsg'), cleanError(err), 'error')
  }
})

$('syncBtn').addEventListener('click', async () => {
  $('syncBtn').disabled = true
  try {
    await window.ameAgent.saveSettings({
      apiUrl: $('apiUrl').value.trim(),
      intervalMinutes: Number($('intervalMinutes').value) || 2,
    })
    await window.ameAgent.runSync()
  } catch (err) {
    renderStatus({
      phase: 'error',
      label: 'Error',
      message: cleanError(err),
      pairs: [],
    })
  } finally {
    $('syncBtn').disabled = false
  }
})

window.ameAgent.onSyncStatus(renderStatus)
void refresh()
