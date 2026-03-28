import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {
  // WireGuard & Tunnels
  checkInstalled: () => ipcRenderer.invoke('wg:installed'),
  listTunnels: () => ipcRenderer.invoke('tunnels:list'),
  getTunnelStatus: () => ipcRenderer.invoke('tunnels:status'),
  connectTunnel: (id: string) => ipcRenderer.invoke('tunnels:connect', id),
  disconnectTunnel: (id: string) => ipcRenderer.invoke('tunnels:disconnect', id),
  importTunnel: () => ipcRenderer.invoke('tunnels:import'),
  deleteTunnel: (id: string) => ipcRenderer.invoke('tunnels:delete', id),
  generateKeys: () => ipcRenderer.invoke('tunnels:generate-keys'),

  // Settings
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: unknown) => ipcRenderer.invoke('settings:save', settings),

  // App
  getVersion: () => ipcRenderer.invoke('app:version'),
  openConfigDir: () => ipcRenderer.invoke('app:open-config-dir'),

  // Events from main process
  onNavigate: (cb: (route: string) => void) => {
    ipcRenderer.on('navigate', (_, route) => cb(route))
    return () => ipcRenderer.removeAllListeners('navigate')
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (err) {
    console.error(err)
  }
} else {
  // @ts-ignore
  window.electron = electronAPI
  // @ts-ignore
  window.api = api
}
