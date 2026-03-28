export interface WireGuardPeer {
  publicKey: string
  endpoint?: string
  allowedIPs: string[]
  latestHandshake?: number // unix timestamp seconds
  rxBytes?: number
  txBytes?: number
  persistentKeepalive?: number
  presharedKey?: string
  name?: string
}

export interface WireGuardInterface {
  name: string
  publicKey: string
  listenPort?: number
  privateKey?: string
  address?: string[]
  dns?: string[]
  peers: WireGuardPeer[]
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

export interface WireGuardStatus {
  interfaces: WireGuardInterface[]
}

export interface AppSettings {
  launchAtStartup: boolean
  minimizeToTray: boolean
  showNotifications: boolean
  theme: 'dark' | 'light' | 'system'
  sudoMethod: 'pkexec' | 'sudo' | 'none'
}

export interface AppStore {
  tunnels: Tunnel[]
  settings: AppSettings
}
