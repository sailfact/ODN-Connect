/**
 * Renderer-side TypeScript types.
 *
 * These mirror the main process types but include additional display fields
 * (rxFormatted, txFormatted, handshakeFormatted) that are computed by the
 * main process and sent over IPC for convenient rendering.
 */

/** A WireGuard peer with optional pre-formatted display strings from the main process. */
export interface WireGuardPeer {
  publicKey: string
  endpoint?: string
  allowedIPs: string[]
  latestHandshake?: number
  rxBytes?: number
  txBytes?: number
  rxFormatted?: string
  txFormatted?: string
  handshakeFormatted?: string
  persistentKeepalive?: number
  presharedKey?: string
  name?: string
}

/** A tunnel configuration with live connection status, as received from the main process. */
export interface Tunnel {
  id: string
  name: string
  configPath: string
  address?: string[]
  dns?: string[]
  listenPort?: number
  peers: WireGuardPeer[]
  connected: boolean
  createdAt: number
  lastConnected?: number
}

export interface AppSettings {
  launchAtStartup: boolean
  minimizeToTray: boolean
  showNotifications: boolean
  theme: 'midnight' | 'arctic-light' | 'slate-dusk' | 'nord-frost' | 'system'
}

/** Status of the elevated tunnel service. */
export interface ServiceStatus {
  connected: boolean
  installed: boolean
}

/** The three navigable views in the application. */
export type Route = 'dashboard' | 'tunnels' | 'settings'
