/**
 * Shared TypeScript interfaces for the main process.
 * These types define the data shapes for WireGuard entities, app settings, and storage.
 */

/** A WireGuard peer as parsed from a config file or live `wg show` output. */
export interface WireGuardPeer {
  publicKey: string
  endpoint?: string
  allowedIPs: string[]
  /** Unix timestamp in seconds of the most recent handshake, from `wg show`. */
  latestHandshake?: number
  /** Bytes received from this peer (live stat from `wg show`). */
  rxBytes?: number
  /** Bytes sent to this peer (live stat from `wg show`). */
  txBytes?: number
  persistentKeepalive?: number
  presharedKey?: string
  name?: string
}

/** A WireGuard network interface with its associated peers. */
export interface WireGuardInterface {
  name: string
  publicKey: string
  listenPort?: number
  privateKey?: string
  address?: string[]
  dns?: string[]
  peers: WireGuardPeer[]
}

/** A stored tunnel configuration — combines config file data with app metadata. */
export interface Tunnel {
  /** Unique identifier (UUID). */
  id: string
  /** Human-readable name derived from the .conf filename. */
  name: string
  /** Absolute path to the .conf file in the app's config directory. */
  configPath: string
  address?: string[]
  dns?: string[]
  listenPort?: number
  peers: WireGuardPeer[]
  /** Whether this tunnel's WireGuard service is currently running. */
  connected: boolean
  /** Timestamp (ms) when this tunnel was first imported. */
  createdAt: number
  /** Timestamp (ms) of the last successful connection. */
  lastConnected?: number
}

/** Wrapper for the `wg show all dump` result. */
export interface WireGuardStatus {
  interfaces: WireGuardInterface[]
}

/** User-configurable application preferences, persisted via electron-store. */
export interface AppSettings {
  launchAtStartup: boolean
  minimizeToTray: boolean
  showNotifications: boolean
  theme: 'midnight' | 'arctic-light' | 'slate-dusk' | 'nord-frost' | 'system'
}

/** Top-level shape of the electron-store JSON file. */
export interface AppStore {
  tunnels: Tunnel[]
  settings: AppSettings
  serverProfile?: ServerProfile
}

/** Persistent server connection profile — stored in electron-store, never sent to renderer. */
export interface ServerProfile {
  apiBaseUrl: string
  serverName: string
  serverPublicKey: string   // from server-info, needed for .conf generation
  serverEndpoint: string    // host:port, from server-info
  accessToken: string
  refreshToken: string
  tokenExpiresAt: number    // ms since epoch
}

/** Sync loop status exposed to the renderer via window.api.getSyncStatus(). */
export interface SyncStatus {
  lastSyncAt: number | null
  syncing: boolean
  error: string | null
}

// ─── Server API response shapes (snake_case — matches server exactly) ─────────

export interface ServerInfo {
  server_name: string
  public_key: string
  endpoint: string
  dns: string[]
  allowed_ips: string
  api_base_url: string
}

export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: 'bearer'
  expires_in: number
}

export interface PeerOut {
  id: string
  name: string
  public_key: string
  allowed_ips: string
  assigned_ip: string
  dns: string | null
  enabled: boolean
  last_handshake: string | null
  client_label: string | null
  created_at: string
  preshared_key?: string
}
