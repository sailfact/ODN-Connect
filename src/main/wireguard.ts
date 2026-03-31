import { execSync, exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { parse as parseIni } from 'ini'
import type { Tunnel, WireGuardPeer, WireGuardInterface, WireGuardStatus } from './types'

const execAsync = promisify(exec)

// WireGuard for Windows installs to Program Files
const WG_DIR = 'C:\\Program Files\\WireGuard'
export const WG_EXE = path.join(WG_DIR, 'wireguard.exe')
export const WG_CLI = path.join(WG_DIR, 'wg.exe')

export function getConfigDir(): string {
  const dir = path.join(os.homedir(), 'AppData', 'Roaming', 'odn-client', 'tunnels')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

export function isWireGuardInstalled(): { wg: boolean; wgQuick: boolean } {
  return {
    wg: fs.existsSync(WG_CLI),
    wgQuick: fs.existsSync(WG_EXE)
  }
}

/**
 * Connect by installing a WireGuard tunnel as a Windows service.
 * Requires the app to be running with administrator privileges.
 */
export async function connectTunnel(configPath: string): Promise<{ success: boolean; error?: string }> {
  try {
    await execAsync(`"${WG_EXE}" /installtunnelservice "${configPath}"`)
    return { success: true }
  } catch (err: unknown) {
    const e = err as { stderr?: string; stdout?: string; message?: string }
    const msg: string = e.stderr || e.stdout || e.message || 'Unknown error'
    // Error 1073 = service already exists and is running
    if (msg.includes('already exists') || msg.includes('1073')) {
      return { success: true }
    }
    if (msg.includes('access') || msg.includes('1314') || msg.includes('privilege') || msg.includes('administrator')) {
      return { success: false, error: 'Administrator privileges required. Please run ODN Client as Administrator.' }
    }
    return { success: false, error: msg }
  }
}

/**
 * Disconnect by uninstalling the WireGuard tunnel Windows service.
 * Requires the app to be running with administrator privileges.
 */
export async function disconnectTunnel(interfaceName: string): Promise<{ success: boolean; error?: string }> {
  try {
    await execAsync(`"${WG_EXE}" /uninstalltunnelservice "${interfaceName}"`)
    return { success: true }
  } catch (err: unknown) {
    const e = err as { stderr?: string; stdout?: string; message?: string }
    const msg: string = e.stderr || e.stdout || e.message || 'Unknown error'
    // Error 1060 = service does not exist (already stopped)
    if (msg.includes('1060') || msg.includes('does not exist') || msg.includes('not found')) {
      return { success: true }
    }
    if (msg.includes('access') || msg.includes('1314') || msg.includes('privilege') || msg.includes('administrator')) {
      return { success: false, error: 'Administrator privileges required. Please run ODN Client as Administrator.' }
    }
    return { success: false, error: msg }
  }
}

/**
 * Returns names of currently active WireGuard interfaces by querying the wg CLI.
 */
export function getActiveInterfaces(): string[] {
  try {
    const result = execSync(`"${WG_CLI}" show interfaces`, { stdio: 'pipe' }).toString().trim()
    if (!result) return []
    return result.split(/\s+/).filter(Boolean)
  } catch {
    return []
  }
}

/**
 * Parses `wg show all dump` output into structured interface data.
 * The dump format is tab-separated:
 *   Interface line (5 cols): name, private-key, public-key, listen-port, fwmark
 *   Peer line (9 cols):      iface, pub-key, preshared-key, endpoint, allowed-ips, latest-handshake, rx-bytes, tx-bytes, keepalive
 */
export function parseWgShowDump(): WireGuardInterface[] {
  try {
    const output = execSync(`"${WG_CLI}" show all dump`, { stdio: 'pipe' }).toString().trim()
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

export function getWireGuardStatus(): WireGuardStatus {
  return { interfaces: parseWgShowDump() }
}

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

/**
 * Generates a WireGuard key pair using the wg CLI.
 * On Windows, piping is done via PowerShell.
 */
export function generateKeyPair(): { privateKey: string; publicKey: string } | null {
  try {
    const privateKey = execSync(`"${WG_CLI}" genkey`, { stdio: 'pipe' }).toString().trim()
    const publicKey = execSync(
      `powershell -Command "echo '${privateKey}' | & '${WG_CLI}' pubkey"`,
      { stdio: 'pipe' }
    ).toString().trim()
    return { privateKey, publicKey }
  } catch {
    return null
  }
}

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
