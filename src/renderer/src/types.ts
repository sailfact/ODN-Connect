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
  theme: 'dark' | 'light' | 'system'
}

export type Route = 'dashboard' | 'tunnels' | 'settings'
