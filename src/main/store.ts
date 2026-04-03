/**
 * Persistent storage for tunnel configurations and app settings.
 *
 * Uses electron-store which saves data as a JSON file in the user's app data directory.
 * This module provides CRUD operations for tunnels and read/write for settings.
 */

import Store from 'electron-store'
import type { AppStore, AppSettings, Tunnel } from './types'

/** Default settings applied on first launch. */
const defaultSettings: AppSettings = {
  launchAtStartup: false,
  minimizeToTray: true,
  showNotifications: true,
  theme: 'midnight'
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

/** Returns all stored tunnel configurations. */
export function getTunnels(): Tunnel[] {
  return store.get('tunnels', [])
}

/** Saves a tunnel config, updating in-place if the ID already exists. */
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

/** Removes a tunnel from the store by its ID. */
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

/** Updates a tunnel's connection state and records the last-connected timestamp. */
export function updateTunnelConnected(id: string, connected: boolean): void {
  const tunnels = getTunnels()
  const tunnel = tunnels.find((t) => t.id === id)
  if (tunnel) {
    tunnel.connected = connected
    if (connected) tunnel.lastConnected = Date.now()
    store.set('tunnels', tunnels)
  }
}
