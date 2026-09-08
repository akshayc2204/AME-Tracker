const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('ameAgent', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (input) => ipcRenderer.invoke('settings:save', input),
  login: (email, password) => ipcRenderer.invoke('auth:login', { email, password }),
  logout: () => ipcRenderer.invoke('auth:logout'),
  pickFolder: () => ipcRenderer.invoke('folder:pick'),
  runSync: () => ipcRenderer.invoke('sync:run'),
  startWatching: () => ipcRenderer.invoke('sync:start'),
  onSyncStatus: (callback) => {
    const handler = (_event, payload) => callback(payload)
    ipcRenderer.on('sync:status', handler)
    return () => ipcRenderer.removeListener('sync:status', handler)
  },
})
