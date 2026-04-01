/**
 * WireGuard CLI integration layer.
 *
 * This module wraps the WireGuard CLI tools (wg, wg-quick / wireguard.exe)
 * to provide tunnel management capabilities:
 * - Connect/disconnect tunnels (Windows: service install; Linux/macOS: wg-quick)
 * - Query active interfaces and live peer statistics
 * - Parse and import WireGuard .conf files
 * - Generate key pairs for new configurations
 *
 * Platform support:
 * - Windows: uses wireguard.exe /installtunnelservice (requires Administrator)
 * - Linux: uses wg-quick up/down (requires root or sudo)
 * - macOS: uses wg-quick up/down (requires root or sudo)
 */

import { execSync, exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { parse as parseIni } from 'ini'
import type { Tunnel, WireGuardPeer, WireGuardInterface, WireGuardStatus } from './types'

const execAsync = promisify(exec)
const platform = process.platform

// ─── Platform-specific binary paths ──────────────────────────────────────────

/**
 * Resolves the path to a CLI tool by checking if it exists on the system PATH.
 * Returns the tool name itself (for PATH-based lookup) or a platform-specific default.
 */
function resolveWgPaths(): { wgExe: string; wgCli: string } {
  if (platform === 'win32') {
    // Windows: WireGuard installs to Program Files with .exe extensions
    const wgDir = 'C:\\Program Files\\WireGuard'
    return {
      wgExe: path.join(wgDir, 'wireguard.exe'),
      wgCli: path.join(wgDir, 'wg.exe')
    }
  }
  // Linux and macOS: wg and wg-quick are typically on the system PATH
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
 *
 * Locations by platform:
 * - Windows: %APPDATA%\odn-client\tunnels\
 * - macOS:   ~/Library/Application Support/odn-client/tunnels/
 * - Linux:   ~/.config/odn-client/tunnels/
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
 * On Windows, checks for files on disk. On Linux/macOS, checks the system PATH.
 */
export function isWireGuardInstalled(): { wg: boolean; wgQuick: boolean } {
  if (platform === 'win32') {
    return {
      wg: fs.existsSync(WG_CLI),
      wgQuick: fs.existsSync(WG_EXE)
    }
  }
  // On Unix, check if the binaries are reachable via PATH
  return {
    wg: commandExists('wg'),
    wgQuick: commandExists('wg-quick')
  }
}

/** Returns true if a command is available on the system PATH. */
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
 * Connect a WireGuard tunnel.
 * - Windows: installs the tunnel as a Windows service via wireguard.exe
 * - Linux/macOS: brings the interface up via wg-quick
 *
 * Requires elevated privileges (Administrator on Windows, root/sudo on Unix).
 */
export async function connectTunnel(configPath: string): Promise<{ success: boolean; error?: string }> {
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

    // Already connected — treat as success
    if (platform === 'win32') {
      // Error 1073 = Windows service already exists and is running
      if (msg.includes('already exists') || msg.includes('1073')) {
        return { success: true }
      }
    } else {
      if (msg.includes('already exists') || msg.includes('already configured')) {
        return { success: true }
      }
    }

    // Permission errors
    if (msg.includes('access') || msg.includes('1314') || msg.includes('privilege') ||
        msg.includes('administrator') || msg.includes('Operation not permitted') ||
        msg.includes('Permission denied')) {
      const hint = platform === 'win32'
        ? 'Administrator privileges required. Please run ODN Client as Administrator.'
        : 'Root privileges required. Please run ODN Client with sudo.'
      return { success: false, error: hint }
    }

    return { success: false, error: msg }
  }
}

/**
 * Disconnect a WireGuard tunnel.
 * - Windows: uninstalls the tunnel service via wireguard.exe
 * - Linux/macOS: brings the interface down via wg-quick
 *
 * Requires elevated privileges (Administrator on Windows, root/sudo on Unix).
 */
export async function disconnectTunnel(interfaceName: string): Promise<{ success: boolean; error?: string }> {
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

    // Already disconnected — treat as success
    if (platform === 'win32') {
      // Error 1060 = Windows service does not exist (already stopped)
      if (msg.includes('1060') || msg.includes('does not exist') || msg.includes('not found')) {
        return { success: true }
      }
    } else {
      if (msg.includes('is not a WireGuard interface') || msg.includes('does not exist')) {
        return { success: true }
      }
    }

    // Permission errors
    if (msg.includes('access') || msg.includes('1314') || msg.includes('privilege') ||
        msg.includes('administrator') || msg.includes('Operation not permitted') ||
        msg.includes('Permission denied')) {
      const hint = platform === 'win32'
        ? 'Administrator privileges required. Please run ODN Client as Administrator.'
        : 'Root privileges required. Please run ODN Client with sudo.'
      return { success: false, error: hint }
    }

    return { success: false, error: msg }
  }
}

// ─── Status queries ──────────────────────────────────────────────────────────

/**
 * Returns names of currently active WireGuard interfaces by querying the wg CLI.
 * Works identically on all platforms (wg show interfaces).
 */
export function getActiveInterfaces(): string[] {
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
 * Parses `wg show all dump` output into structured interface data.
 * The dump format is tab-separated and identical across all platforms:
 *   Interface line (5 cols): name, private-key, public-key, listen-port, fwmark
 *   Peer line (9 cols):      iface, pub-key, preshared-key, endpoint, allowed-ips, latest-handshake, rx-bytes, tx-bytes, keepalive
 */
export function parseWgShowDump(): WireGuardInterface[] {
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

/** Returns structured status data for all active WireGuard interfaces and their peers. */
export function getWireGuardStatus(): WireGuardStatus {
  return { interfaces: parseWgShowDump() }
}

// ─── Config file operations ──────────────────────────────────────────────────

/**
 * Parses a WireGuard .conf file (INI format) into structured tunnel data.
 * Extracts the [Interface] section (address, DNS, listen port) and all [Peer] sections.
 * Returns a partial Tunnel object; missing fields will be empty arrays/undefined.
 */
export function parseTunnelConfig(configPath: string): Partial<Tunnel> {
  try {
    const content = fs.readFileSync(configPath, 'utf-8')
    const parsed = parseIni(content)

    // Extract [Interface] section fields
    const iface = parsed['Interface'] || {}
    const address = iface['Address']
      ? String(iface['Address']).split(',').map((s: string) => s.trim())
      : []
    const dns = iface['DNS']
      ? String(iface['DNS']).split(',').map((s: string) => s.trim())
      : []
    const listenPort = iface['ListenPort'] ? parseInt(String(iface['ListenPort'])) : undefined

    // Extract [Peer] sections — the ini parser returns a single object for one peer
    // or an array for multiple peers, so we normalize to an array
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

/** Copies a WireGuard .conf file into the app's config directory, named by tunnel. */
export function importConfigFile(sourcePath: string, tunnelName: string): string {
  const configDir = getConfigDir()
  const destPath = path.join(configDir, `${tunnelName}.conf`)
  fs.copyFileSync(sourcePath, destPath)
  return destPath
}

/** Removes a tunnel's .conf file from disk. Silently succeeds if file is already gone. */
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

/**
 * Generates a WireGuard key pair using the wg CLI.
 * On Windows, piping is done via PowerShell. On Unix, uses standard shell piping.
 */
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

/** Converts a byte count to a human-readable string (e.g., 1536 -> "1.5 KiB"). */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

/** Converts a Unix timestamp to a relative time string (e.g., "2m ago", "Never"). */
export function formatHandshake(timestamp?: number): string {
  if (!timestamp) return 'Never'
  const diff = Math.floor(Date.now() / 1000) - timestamp
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}
