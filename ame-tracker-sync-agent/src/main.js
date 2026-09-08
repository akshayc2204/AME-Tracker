const { app, BrowserWindow, Tray, Menu, ipcMain, dialog, nativeImage } = require('electron')
const path = require('path')
const Store = require('electron-store')
const { SyncEngine } = require('./sync-engine')
const { ApiClient } = require('./api-client')

const store = new Store({
  name: 'ame-sync-agent',
  defaults: {
    apiUrl: 'http://localhost:3000',
    folderPath: '',
    intervalMinutes: 2,
    accessToken: '',
    refreshToken: '',
    userEmail: '',
    syncedHashes: {},
  },
})

let mainWindow = null
let tray = null
let syncEngine = null
let apiClient = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 680,
    minWidth: 420,
    minHeight: 560,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'))

  mainWindow.once('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault()
      mainWindow.hide()
    }
  })
}

function createTray() {
  const iconPath = path.join(__dirname, 'icon.png')
  let icon = nativeImage.createFromPath(iconPath)
  if (icon.isEmpty()) {
    icon = nativeImage.createFromDataURL(
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAALElEQVRoge3OMQEAAAjDMMC/5+EIX0hggQAAAAAAAAAAAAAAwN0G/gAB9fQAcgAAAABJRU5ErkJggg==',
    )
  }
  tray = new Tray(icon)
  tray.setToolTip('AME Tracker Sync Agent')
  updateTrayMenu('Idle')
  tray.on('double-click', () => {
    if (mainWindow) {
      mainWindow.show()
      mainWindow.focus()
    }
  })
}

function updateTrayMenu(statusText) {
  if (!tray) return
  const menu = Menu.buildFromTemplate([
    { label: `Status: ${statusText}`, enabled: false },
    { type: 'separator' },
    {
      label: 'Open',
      click: () => {
        if (mainWindow) {
          mainWindow.show()
          mainWindow.focus()
        }
      },
    },
    {
      label: 'Sync now',
      click: () => {
        void runSync('manual')
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.isQuitting = true
        app.quit()
      },
    },
  ])
  tray.setContextMenu(menu)
  tray.setToolTip(`AME Tracker Sync Agent — ${statusText}`)
}

function sendToRenderer(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, payload)
  }
}

function getSettings() {
  return {
    apiUrl: store.get('apiUrl'),
    folderPath: store.get('folderPath'),
    intervalMinutes: store.get('intervalMinutes'),
    userEmail: store.get('userEmail'),
    loggedIn: Boolean(store.get('accessToken')),
  }
}

function ensureClients() {
  apiClient = new ApiClient({
    getApiUrl: () => store.get('apiUrl'),
    getAccessToken: () => store.get('accessToken'),
    getRefreshToken: () => store.get('refreshToken'),
    setTokens: (accessToken, refreshToken) => {
      store.set('accessToken', accessToken || '')
      if (refreshToken != null) store.set('refreshToken', refreshToken || '')
    },
    clearTokens: () => {
      store.set('accessToken', '')
      store.set('refreshToken', '')
      store.set('userEmail', '')
    },
  })

  syncEngine = new SyncEngine({
    getFolderPath: () => store.get('folderPath'),
    getSyncedHashes: () => store.get('syncedHashes') || {},
    setSyncedHash: (key, value) => {
      const map = { ...(store.get('syncedHashes') || {}) }
      map[key] = value
      store.set('syncedHashes', map)
    },
    apiClient,
    onStatus: (status) => {
      updateTrayMenu(status.label || status.phase || 'Running')
      sendToRenderer('sync:status', status)
    },
  })
}

async function runSync(reason) {
  if (!syncEngine) ensureClients()
  if (!store.get('accessToken')) {
    sendToRenderer('sync:status', {
      phase: 'error',
      label: 'Not logged in',
      message: 'Log in before syncing',
      pairs: [],
    })
    return null
  }
  if (!store.get('folderPath')) {
    sendToRenderer('sync:status', {
      phase: 'error',
      label: 'No folder',
      message: 'Choose a local folder to watch',
      pairs: [],
    })
    return null
  }
  updateTrayMenu('Syncing…')
  try {
    const result = await syncEngine.run(reason)
    updateTrayMenu(
      result
        ? `Last: ${result.imported} in / ${result.skipped} skip / ${result.failed} fail`
        : 'Idle',
    )
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    updateTrayMenu('Error')
    sendToRenderer('sync:status', {
      phase: 'error',
      label: 'Error',
      message,
      pairs: [],
    })
    return null
  }
}

function cleanError(err) {
  const raw = err instanceof Error ? err.message : String(err || 'Unknown error')
  // Electron wraps IPC failures as: Error invoking remote method 'x': Error: actual
  const m = raw.match(/Error invoking remote method '[^']+': (?:Error: )?(.+)$/s)
  return (m ? m[1] : raw).trim()
}

function registerIpc() {
  ipcMain.handle('settings:get', () => getSettings())

  ipcMain.handle('settings:save', (_event, input) => {
    if (typeof input.apiUrl === 'string') {
      store.set('apiUrl', input.apiUrl.trim().replace(/\/+$/, ''))
    }
    if (typeof input.intervalMinutes === 'number' && input.intervalMinutes >= 1) {
      store.set('intervalMinutes', Math.round(input.intervalMinutes))
      if (syncEngine) {
        syncEngine.setIntervalMinutes(store.get('intervalMinutes'))
      }
    }
    if (typeof input.folderPath === 'string') {
      store.set('folderPath', input.folderPath)
    }
    ensureClients()
    if (syncEngine) {
      syncEngine.setIntervalMinutes(store.get('intervalMinutes'))
      syncEngine.startTimer()
    }
    return getSettings()
  })

  ipcMain.handle('auth:login', async (_event, { email, password }) => {
    ensureClients()
    try {
      if (!password || String(password).length < 6) {
        throw new Error('Password must be at least 6 characters')
      }
      const data = await apiClient.login(email, password)
      store.set('accessToken', data.accessToken)
      store.set('refreshToken', data.refreshToken)
      store.set('userEmail', data.user?.email || email)
      if (syncEngine) syncEngine.startTimer()
      return getSettings()
    } catch (err) {
      throw new Error(cleanError(err))
    }
  })

  ipcMain.handle('auth:logout', async () => {
    try {
      if (apiClient && store.get('refreshToken')) {
        await apiClient.logout()
      }
    } catch {
      // ignore logout network errors
    }
    store.set('accessToken', '')
    store.set('refreshToken', '')
    store.set('userEmail', '')
    if (syncEngine) syncEngine.stopTimer()
    updateTrayMenu('Logged out')
    return getSettings()
  })

  ipcMain.handle('folder:pick', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Choose DataUploads folder',
    })
    if (result.canceled || !result.filePaths[0]) return null
    store.set('folderPath', result.filePaths[0])
    ensureClients()
    if (syncEngine) syncEngine.startTimer()
    return getSettings()
  })

  ipcMain.handle('sync:run', async () => runSync('manual'))

  ipcMain.handle('sync:start', () => {
    ensureClients()
    syncEngine.setIntervalMinutes(store.get('intervalMinutes'))
    syncEngine.startTimer()
    return { ok: true }
  })
}

app.whenReady().then(() => {
  registerIpc()
  ensureClients()
  createWindow()
  createTray()

  if (store.get('accessToken') && store.get('folderPath')) {
    syncEngine.setIntervalMinutes(store.get('intervalMinutes'))
    syncEngine.startTimer()
    setTimeout(() => {
      void runSync('startup')
    }, 3000)
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
    else if (mainWindow) mainWindow.show()
  })
})

app.on('before-quit', () => {
  app.isQuitting = true
  if (syncEngine) syncEngine.stopTimer()
})

app.on('window-all-closed', () => {
  // Stay alive in the tray on Windows/macOS; quit only via tray menu.
})
