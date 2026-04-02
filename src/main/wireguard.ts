/**
 * WireGuard integration layer.
 *
 * This module provides tunnel management capabilities by delegating
 * elevated operations (connect, disconnect, status queries) to the
 * ODN Tunnel Service running as SYSTEM/root.
 *
 * Non-elevated operations (config parsing, file management, key generation)
 * run directly in the Electron process.
 *
 * Fallback: If the service is unavailable and the app is already elevated,
 * commands are executed directly (for development workflow).
 */

import { execSync, exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { parse as parseIni } from 'ini'
import type { Tunnel, WireGuardPeer, WireGuardInterface, WireGuardStatus } from './types'
import { TunnelServiceClient } from '../service/client'

const execAsync = promisify(exec)
const platform = process.platform

// ─── Service client singleton ────────────────────────────────────────────────

let serviceClient: TunnelServiceClient | null = null

/** Initialize the service client connection. Call once during app startup. */
export async function initServiceClient(): Promise<boolean> {
  serviceClient = new TunnelServiceClient()
  try {
    await serviceClient.connect()
    console.log('Connected to ODN Tunnel Service')
    return true
  } catch {
    console.warn('ODN Tunnel Service not available — elevated operations will use direct fallback if running as admin')
    serviceClient = null
    return false
  }
}

/** Returns whether the service client is connected. */
export function isServiceConnected(): boolean {
  return serviceClient?.isConnected() ?? false
}

/** Returns the service client instance (or null if not connected). */
export function getServiceClient(): TunnelServiceClient | null {
  return serviceClient
}

/**
 * Attempt to reconnect to the tunnel service if not currently connected.
 * Called periodically by the health monitor.
 */
export async function tryReconnectService(): Promise<boolean> {
  if (serviceClient?.isConnected()) return true
  if (serviceClient) {
    serviceClient.disconnect()
    serviceClient = null
  }
  return initServiceClient()
}

// ─── Platform-specific binary paths ──────────────────────────────────────────

function resolveWgPaths(): { wgExe: string; wgCli: string } {
  if (platform === 'win32') {
    const wgDir = 'C:\\Program Files\\WireGuard'
    return {
      wgExe: path.join(wgDir, 'wireguard.exe'),
      wgCli: path.join(wgDir, 'wg.exe')
    }
  }
  return {
    wgExe: 'wg-quick',
    wgCli: 'wg'
  }
}

/** Path to wireguard.exe (Windows) or wg-quick (Linux/macOS) — manages tunnel lifecycle. */
export const WG_EXE = resolveWgPaths().wgExe
/** Path to wg.exe (Windows) or wg (Linux/macOS) — queries interface status and generates keys. */
export const WG_CLI = resolveWgPaths().wgCli

// ─── Config directory ────────────────────────────────────────────────────────

/**
 * Returns the directory where tunnel .conf files are stored.
 * Creates the directory if it doesn't exist.
 */
export function getConfigDir(): string {
  let baseDir: string
  if (platform === 'win32') {
    baseDir = path.join(os.homedir(), 'AppData', 'Roaming')
  } else if (platform === 'darwin') {
    baseDir = path.join(os.homedir(), 'Library', 'Application Support')
  } else {
    baseDir = path.join(os.homedir(), '.config')
  }

  const dir = path.join(baseDir, 'odn-client', 'tunnels')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

// ─── Installation check ──────────────────────────────────────────────────────

/**
 * Checks whether the WireGuard CLI and tunnel manager are available.
 */
export function isWireGuardInstalled(): { wg: boolean; wgQuick: boolean } {
  if (platform === 'win32') {
    return {
      wg: fs.existsSync(WG_CLI),
      wgQuick: fs.existsSync(WG_EXE)
    }
  }
  return {
    wg: commandExists('wg'),
    wgQuick: commandExists('wg-quick')
  }
}

function commandExists(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

// ─── Connect / Disconnect ────────────────────────────────────────────────────

/**
 * Connect a WireGuard tunnel via the tunnel service.
 * Falls back to direct CLI execution if the service is unavailable (dev mode).
 */
export async function connectTunnel(configPath: string): Promise<{ success: boolean; error?: string }> {
  // Prefer service client
  if (serviceClient?.isConnected()) {
    return serviceClient.connectTunnel(configPath)
  }

  // Fallback: direct execution (requires elevation)
  return connectTunnelDirect(configPath)
}

async function connectTunnelDirect(configPath: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (platform === 'win32') {
      await execAsync(`"${WG_EXE}" /installtunnelservice "${configPath}"`)
    } else {
      await execAsync(`sudo ${WG_EXE} up "${configPath}"`)
    }
    return { success: true }
  } catch (err: unknown) {
    const e = err as { stderr?: string; stdout?: string; message?: string }
    const msg: string = e.stderr || e.stdout || e.message || 'Unknown error'

    if (platform === 'win32') {
      if (msg.includes('already exists') || msg.includes('1073')) {
        return { success: true }
      }
    } else {
      if (msg.includes('already exists') || msg.includes('already configured')) {
        return { success: true }
      }
    }

    if (msg.includes('access') || msg.includes('1314') || msg.includes('privilege') ||
        msg.includes('administrator') || msg.includes('Operation not permitted') ||
        msg.includes('Permission denied')) {
      const hint = 'Tunnel service is not running. Please install the ODN Tunnel Service.'
      return { success: false, error: hint }
    }

    return { success: false, error: msg }
  }
}

/**
 * Disconnect a WireGuard tunnel via the tunnel service.
 * Falls back to direct CLI execution if the service is unavailable (dev mode).
 */
export async function disconnectTunnel(interfaceName: string): Promise<{ success: boolean; error?: string }> {
  if (serviceClient?.isConnected()) {
    return serviceClient.disconnectTunnel(interfaceName)
  }

  return disconnectTunnelDirect(interfaceName)
}

async function disconnectTunnelDirect(interfaceName: string): Promise<{ success: boolean; error?: string }> {
  try {
    if (platform === 'win32') {
      await execAsync(`"${WG_EXE}" /uninstalltunnelservice "${interfaceName}"`)
    } else {
      await execAsync(`sudo ${WG_EXE} down "${interfaceName}"`)
    }
    return { success: true }
  } catch (err: unknown) {
    const e = err as { stderr?: string; stdout?: string; message?: string }
    const msg: string = e.stderr || e.stdout || e.message || 'Unknown error'

    if (platform === 'win32') {
      if (msg.includes('1060') || msg.includes('does not exist') || msg.includes('not found')) {
        return { success: true }
      }
    } else {
      if (msg.includes('is not a WireGuard interface') || msg.includes('does not exist')) {
        return { success: true }
      }
    }

    if (msg.includes('access') || msg.includes('1314') || msg.includes('privilege') ||
        msg.includes('administrator') || msg.includes('Operation not permitted') ||
        msg.includes('Permission denied')) {
      const hint = 'Tunnel service is not running. Please install the ODN Tunnel Service.'
      return { success: false, error: hint }
    }

    return { success: false, error: msg }
  }
}

// ─── Status queries (now async) ─────────────────────────────────────────────

/**
 * Returns names of currently active WireGuard interfaces.
 * Queries via the tunnel service, or falls back to direct CLI.
 */
export async function getActiveInterfaces(): Promise<string[]> {
  if (serviceClient?.isConnected()) {
    return serviceClient.getActiveInterfaces()
  }

  // Fallback: direct execution
  try {
    const cmd = platform === 'win32' ? `"${WG_CLI}" show interfaces` : `sudo ${WG_CLI} show interfaces`
    const result = execSync(cmd, { stdio: 'pipe' }).toString().trim()
    if (!result) return []
    return result.split(/\s+/).filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Returns structured status data for all active WireGuard interfaces.
 * Queries via the tunnel service, or falls back to direct CLI.
 */
export async function getWireGuardStatus(): Promise<WireGuardStatus> {
  if (serviceClient?.isConnected()) {
    return serviceClient.getWireGuardStatus()
  }

  // Fallback: direct execution
  return { interfaces: parseWgShowDumpDirect() }
}

function parseWgShowDumpDirect(): WireGuardInterface[] {
  try {
    const cmd = platform === 'win32' ? `"${WG_CLI}" show all dump` : `sudo ${WG_CLI} show all dump`
    const output = execSync(cmd, { stdio: 'pipe' }).toString().trim()
    if (!output) return []

    const interfaces: Map<string, WireGuardInterface> = new Map()

    for (const line of output.split('\n')) {
      const parts = line.split('\t')
      if (parts.length === 5) {
        const [name, , publicKey, listenPort] = parts
        interfaces.set(name, {
          name,
          publicKey,
          listenPort: listenPort !== 'off' ? parseInt(listenPort) : undefined,
          peers: []
        })
      } else if (parts.length === 9) {
        const [iface, pubkey, preshared, endpoint, allowedIPs, latestHandshake, rx, tx, keepalive] = parts
        const ifc = interfaces.get(iface)
        if (ifc) {
          const peer: WireGuardPeer = {
            publicKey: pubkey,
            presharedKey: preshared !== '(none)' ? preshared : undefined,
            endpoint: endpoint !== '(none)' ? endpoint : undefined,
            allowedIPs: allowedIPs.split(',').map((s) => s.trim()),
            latestHandshake: latestHandshake !== '0' ? parseInt(latestHandshake) : undefined,
            rxBytes: parseInt(rx) || 0,
            txBytes: parseInt(tx) || 0,
            persistentKeepalive: keepalive !== 'off' ? parseInt(keepalive) : undefined
          }
          ifc.peers.push(peer)
        }
      }
    }

    return Array.from(interfaces.values())
  } catch (err) {
    console.error('Failed to parse wg show dump:', err)
    return []
  }
}

// ─── Config file operations ──────────────────────────────────────────────────

export function parseTunnelConfig(configPath: string): Partial<Tunnel> {
  try {
    const content = fs.readFileSync(configPath, 'utf-8')
    const parsed = parseIni(content)

    const iface = parsed['Interface'] || {}
    const address = iface['Address']
      ? String(iface['Address']).split(',').map((s: string) => s.trim())
      : []
    const dns = iface['DNS']
      ? String(iface['DNS']).split(',').map((s: string) => s.trim())
      : []
    const listenPort = iface['ListenPort'] ? parseInt(String(iface['ListenPort'])) : undefined

    const peers: WireGuardPeer[] = []
    const rawPeers = parsed['Peer']
    if (rawPeers) {
      const peerList = Array.isArray(rawPeers) ? rawPeers : [rawPeers]
      for (const p of peerList) {
        peers.push({
          publicKey: String(p['PublicKey'] || ''),
          endpoint: p['Endpoint'] ? String(p['Endpoint']) : undefined,
          allowedIPs: p['AllowedIPs']
            ? String(p['AllowedIPs']).split(',').map((s: string) => s.trim())
            : [],
          persistentKeepalive: p['PersistentKeepalive']
            ? parseInt(String(p['PersistentKeepalive']))
            : undefined
        })
      }
    }

    return { address, dns, listenPort, peers }
  } catch (err) {
    console.error('Failed to parse tunnel config:', err)
    return {}
  }
}

export function importConfigFile(sourcePath: string, tunnelName: string): string {
  const configDir = getConfigDir()
  const destPath = path.join(configDir, `${tunnelName}.conf`)
  fs.copyFileSync(sourcePath, destPath)
  return destPath
}

export function deleteConfigFile(configPath: string): void {
  try {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath)
    }
  } catch (err) {
    console.error('Failed to delete config file:', err)
  }
}

// ─── Key generation ──────────────────────────────────────────────────────────

export function generateKeyPair(): { privateKey: string; publicKey: string } | null {
  try {
    if (platform === 'win32') {
      const privateKey = execSync(`"${WG_CLI}" genkey`, { stdio: 'pipe' }).toString().trim()
      const publicKey = execSync(
        `powershell -Command "echo '${privateKey}' | & '${WG_CLI}' pubkey"`,
        { stdio: 'pipe' }
      ).toString().trim()
      return { privateKey, publicKey }
    } else {
      const privateKey = execSync(`${WG_CLI} genkey`, { stdio: 'pipe' }).toString().trim()
      const publicKey = execSync(`echo '${privateKey}' | ${WG_CLI} pubkey`, {
        stdio: 'pipe',
        shell: '/bin/sh'
      }).toString().trim()
      return { privateKey, publicKey }
    }
  } catch {
    return null
  }
}

// ─── Formatting utilities ────────────────────────────────────────────────────

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export function formatHandshake(timestamp?: number): string {
  if (!timestamp) return 'Never'
  const diff = Math.floor(Date.now() / 1000) - timestamp
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}
