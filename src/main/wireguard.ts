import { execSync, exec } from 'child_process'
import { promisify } from 'util'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { parse as parseIni } from 'ini'
import type { Tunnel, WireGuardPeer, WireGuardInterface, WireGuardStatus } from './types'
import { getSettings } from './store'

const execAsync = promisify(exec)

export function getConfigDir(): string {
  const dir = path.join(os.homedir(), '.config', 'odn-connect', 'tunnels')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

function getPrivilegePrefix(): string {
  const { sudoMethod } = getSettings()
  if (sudoMethod === 'none') return ''
  if (sudoMethod === 'sudo') return 'sudo '
  return 'pkexec '
}

export function isWireGuardAvailable(): boolean {
  try {
    execSync('which wg-quick', { stdio: 'pipe' })
    return true
  } catch {
    return false
  }
}

export function isWireGuardInstalled(): { wg: boolean; wgQuick: boolean } {
  let wg = false
  let wgQuick = false
  try {
    execSync('which wg', { stdio: 'pipe' })
    wg = true
  } catch {}
  try {
    execSync('which wg-quick', { stdio: 'pipe' })
    wgQuick = true
  } catch {}
  return { wg, wgQuick }
}

export async function connectTunnel(configPath: string): Promise<{ success: boolean; error?: string }> {
  const prefix = getPrivilegePrefix()
  try {
    await execAsync(`${prefix}wg-quick up "${configPath}"`)
    return { success: true }
  } catch (err: any) {
    const msg = err.stderr || err.message || 'Unknown error'
    // If already up, that's fine
    if (msg.includes('already exists')) {
      return { success: true }
    }
    return { success: false, error: msg }
  }
}

export async function disconnectTunnel(interfaceName: string): Promise<{ success: boolean; error?: string }> {
  const prefix = getPrivilegePrefix()
  try {
    await execAsync(`${prefix}wg-quick down "${interfaceName}"`)
    return { success: true }
  } catch (err: any) {
    const msg = err.stderr || err.message || 'Unknown error'
    if (msg.includes('not found') || msg.includes('No such')) {
      return { success: true }
    }
    return { success: false, error: msg }
  }
}

export function getActiveInterfaces(): string[] {
  try {
    const result = execSync('wg show interfaces', { stdio: 'pipe' }).toString().trim()
    if (!result) return []
    return result.split(/\s+/).filter(Boolean)
  } catch {
    return []
  }
}

export function parseWgShowDump(): WireGuardInterface[] {
  try {
    const output = execSync('wg show all dump', { stdio: 'pipe' }).toString().trim()
    if (!output) return []

    const interfaces: Map<string, WireGuardInterface> = new Map()

    for (const line of output.split('\n')) {
      const parts = line.split('\t')
      if (parts.length === 5) {
        // Interface line: name, privatekey, publickey, listenport, fwmark
        const [name, , publicKey, listenPort] = parts
        interfaces.set(name, {
          name,
          publicKey,
          listenPort: listenPort !== 'off' ? parseInt(listenPort) : undefined,
          peers: []
        })
      } else if (parts.length === 9) {
        // Peer line: iface, pubkey, preshared, endpoint, allowed_ips, latest_handshake, rx, tx, keepalive
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
  } catch {
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
    const addresses = iface['Address']
      ? String(iface['Address']).split(',').map((s: string) => s.trim())
      : []
    const dns = iface['DNS']
      ? String(iface['DNS']).split(',').map((s: string) => s.trim())
      : []
    const listenPort = iface['ListenPort'] ? parseInt(String(iface['ListenPort'])) : undefined

    const peers: WireGuardPeer[] = []
    // ini may flatten multiple [Peer] sections — handle both array and object
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

    return { address: addresses, dns, listenPort, peers }
  } catch {
    return {}
  }
}

export function writeConfigFile(tunnel: Tunnel, privateKey: string): string {
  const configDir = getConfigDir()
  const configPath = path.join(configDir, `${tunnel.name}.conf`)

  let content = '[Interface]\n'
  if (privateKey) content += `PrivateKey = ${privateKey}\n`
  if (tunnel.address && tunnel.address.length > 0) {
    content += `Address = ${tunnel.address.join(', ')}\n`
  }
  if (tunnel.listenPort) content += `ListenPort = ${tunnel.listenPort}\n`
  if (tunnel.dns && tunnel.dns.length > 0) {
    content += `DNS = ${tunnel.dns.join(', ')}\n`
  }

  for (const peer of tunnel.peers) {
    content += '\n[Peer]\n'
    content += `PublicKey = ${peer.publicKey}\n`
    if (peer.endpoint) content += `Endpoint = ${peer.endpoint}\n`
    if (peer.allowedIPs.length > 0) content += `AllowedIPs = ${peer.allowedIPs.join(', ')}\n`
    if (peer.persistentKeepalive) content += `PersistentKeepalive = ${peer.persistentKeepalive}\n`
    if (peer.presharedKey) content += `PresharedKey = ${peer.presharedKey}\n`
  }

  fs.writeFileSync(configPath, content, { mode: 0o600 })
  return configPath
}

export function importConfigFile(sourcePath: string, tunnelName: string): string {
  const configDir = getConfigDir()
  const destPath = path.join(configDir, `${tunnelName}.conf`)
  fs.copyFileSync(sourcePath, destPath)
  fs.chmodSync(destPath, 0o600)
  return destPath
}

export function deleteConfigFile(configPath: string): void {
  try {
    if (fs.existsSync(configPath)) {
      fs.unlinkSync(configPath)
    }
  } catch {}
}

export function generateKeyPair(): { privateKey: string; publicKey: string } | null {
  try {
    const privateKey = execSync('wg genkey', { stdio: 'pipe' }).toString().trim()
    const publicKey = execSync(`echo "${privateKey}" | wg pubkey`, { stdio: 'pipe' }).toString().trim()
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
