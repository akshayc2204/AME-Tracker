const { app, BrowserWindow, dialog } = require('electron')
const { spawn } = require('child_process')
const fs = require('fs')
const http = require('http')
const net = require('net')
const path = require('path')

const DESKTOP_RESTART_CODE = 86
const PORT = 3000

let mainWindow = null
let backend = null
let quitting = false

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.ame.tracker')
  }
  app.on('second-instance', () => {
    if (!mainWindow) return
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })
}

function backendDir() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'backend')
  return path.resolve(__dirname, '../../ame-tracker-backend')
}

function portalDir() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'portal')
  return path.resolve(__dirname, '../../ame-tracker-web-portal/dist')
}

function nodeBin() {
  if (process.env.AME_NODE_BIN) return process.env.AME_NODE_BIN
  if (app.isPackaged) {
    const name = process.platform === 'win32' ? 'node.exe' : 'node'
    return path.join(process.resourcesPath, 'node', name)
  }
  return process.platform === 'win32' ? 'node.exe' : 'node'
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close(() => resolve(true))
    })
    server.listen(port, '0.0.0.0')
  })
}

function getJson(pathname) {
  return new Promise((resolve, reject) => {
    const request = http.get(`http://127.0.0.1:${PORT}${pathname}`, (response) => {
      let body = ''
      response.setEncoding('utf8')
      response.on('data', (chunk) => {
        body += chunk
      })
      response.on('end', () => {
        try {
          resolve({ status: response.statusCode || 0, body: JSON.parse(body) })
        } catch {
          resolve({ status: response.statusCode || 0, body: null })
        }
      })
    })
    request.on('error', reject)
    request.setTimeout(1000, () => {
      request.destroy(new Error('timeout'))
    })
  })
}

function startBackend() {
  const entry = path.join(backendDir(), 'dist', 'main.js')
  if (!fs.existsSync(entry)) {
    dialog.showErrorBox(
      'AME Tracker',
      `API build not found at ${entry}. Run npm run dev from ame-tracker-desktop first.`,
    )
    app.quit()
    return false
  }

  const portal = portalDir()
  if (!fs.existsSync(path.join(portal, 'index.html'))) {
    dialog.showErrorBox(
      'AME Tracker',
      `Portal build not found at ${portal}. Run npm run build in ame-tracker-web-portal, then try again.`,
    )
    app.quit()
    return false
  }

  backend = spawn(nodeBin(), [entry], {
    cwd: backendDir(),
    env: {
      ...process.env,
      AME_DESKTOP: '1',
      PORTAL_DIST: portal,
      PORT: String(PORT),
    },
    stdio: 'inherit',
    windowsHide: true,
  })

  const child = backend
  child.on('exit', (code, signal) => {
    if (child !== backend) return
    backend = null
    if (quitting) return
    if (code === DESKTOP_RESTART_CODE) {
      void restartBackend()
      return
    }
    const reason = code ?? signal ?? 'unknown'
    dialog.showErrorBox('AME Tracker stopped', `The server exited (${reason}).`)
    app.quit()
  })
  return true
}

async function restartBackend() {
  if (!startBackend()) return
  try {
    await waitForApi()
    await mainWindow?.loadURL(`http://127.0.0.1:${PORT}/login`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    dialog.showErrorBox('AME Tracker', message)
    app.quit()
  }
}

function stopBackend() {
  quitting = true
  const child = backend
  backend = null
  if (!child || child.killed || child.exitCode !== null) return
  if (process.platform === 'win32' && child.pid) {
    spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true })
    return
  }
  child.kill('SIGTERM')
}

function waitForApi() {
  const started = Date.now()
  return new Promise((resolve, reject) => {
    const tick = async () => {
      try {
        const health = await getJson('/api/health')
        const data = health.body?.data
        // Only accept the desktop process we just launched (portal mounted).
        // An older API on the same port would otherwise look "healthy" and show Cannot GET /login.
        if (health.status === 200 && data?.ok && data?.desktop && data?.portal) {
          resolve()
          return
        }
      } catch {
        // keep waiting
      }
      if (Date.now() - started > 40000) {
        reject(
          new Error(
            `AME Tracker did not start on port ${PORT}. If another Node process is using that port, stop it and try again.`,
          ),
        )
        return
      }
      setTimeout(() => {
        void tick()
      }, 400)
    }
    void tick()
  })
}

function appIconPath() {
  const ico = path.join(__dirname, 'assets', 'icon.ico')
  const png = path.join(__dirname, 'assets', 'icon.png')
  if (process.platform === 'win32' && fs.existsSync(ico)) return ico
  if (fs.existsSync(png)) return png
  if (fs.existsSync(ico)) return ico
  return undefined
}

async function createWindow() {
  const icon = appIconPath()
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    title: 'AME Tracker',
    autoHideMenuBar: true,
    backgroundColor: '#0f172a',
    ...(icon ? { icon } : {}),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  const loading = `<!doctype html><html><body style="margin:0;height:100vh;display:flex;align-items:center;justify-content:center;font-family:Segoe UI,sans-serif;background:#0f172a;color:#e2e8f0">Starting AME Tracker…</body></html>`
  await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(loading)}`)

  try {
    await waitForApi()
    await mainWindow.loadURL(`http://127.0.0.1:${PORT}/login`)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    dialog.showErrorBox('AME Tracker', message)
    app.quit()
  }
}

if (gotLock) {
  app.whenReady().then(async () => {
    const free = await isPortFree(PORT)
    if (!free) {
      dialog.showErrorBox(
        'AME Tracker',
        `Port ${PORT} is already in use.\n\nStop the other AME Tracker / Nest API (the process listening on port ${PORT}), then open AME Tracker again.`,
      )
      app.quit()
      return
    }
    if (!startBackend()) return
    await createWindow()
  })

  app.on('before-quit', () => {
    stopBackend()
  })

  app.on('window-all-closed', () => {
    stopBackend()
    app.quit()
  })
}
