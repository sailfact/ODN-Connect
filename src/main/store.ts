import Store from 'electron-store'
import type { AppStore, AppSettings, Tunnel } from './types'

const defaultSettings: AppSettings = {
  launchAtStartup: false,
  minimizeToTray: true,
  showNotifications: true,
  theme: 'dark',
  sudoMethod: 'pkexec'
}

const store = new Store<AppStore>({
  defaults: {
    tunnels: [],
    settings: defaultSettings
  },
  schema: {
    tunnels: { type: 'array' },
    settings: { type: 'object' }
  }
})

export function getTunnels(): Tunnel[] {
  return store.get('tunnels', [])
}

export function saveTunnel(tunnel: Tunnel): void {
  const tunnels = getTunnels()
  const idx = tunnels.findIndex((t) => t.id === tunnel.id)
  if (idx >= 0) {
    tunnels[idx] = tunnel
  } else {
    tunnels.push(tunnel)
  }
  store.set('tunnels', tunnels)
}

export function deleteTunnel(id: string): void {
  const tunnels = getTunnels().filter((t) => t.id !== id)
  store.set('tunnels', tunnels)
}

export function getSettings(): AppSettings {
  return store.get('settings', defaultSettings)
}

export function saveSettings(settings: AppSettings): void {
  store.set('settings', settings)
}

export function updateTunnelConnected(id: string, connected: boolean): void {
  const tunnels = getTunnels()
  const tunnel = tunnels.find((t) => t.id === id)
  if (tunnel) {
    tunnel.connected = connected
    if (connected) tunnel.lastConnected = Date.now()
    store.set('tunnels', tunnels)
  }
}
