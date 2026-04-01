/**
 * Preload script — runs in a sandboxed context before the renderer loads.
 *
 * Exposes a typed `window.api` object to the renderer via contextBridge.
 * This is the only way the renderer can communicate with the main process,
 * ensuring context isolation (no direct access to Node.js or Electron APIs).
 */

import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

/** IPC API exposed to the renderer as `window.api`. */
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

  // Service management
  getServiceStatus: () => ipcRenderer.invoke('service:status'),
  installService: () => ipcRenderer.invoke('service:install'),

  // Events from main process (tray menu triggers navigation)
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
  ;(window as Record<string, unknown>).electron = electronAPI
  ;(window as Record<string, unknown>).api = api
}
