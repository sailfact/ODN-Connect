/**
 * Elevated tunnel service daemon.
 *
 * This is a standalone Node.js script (not part of Electron) that runs as:
 * - Windows: a Windows Service under SYSTEM
 * - Linux: a systemd service under root
 * - macOS: a launchd daemon under root
 *
 * It listens on a local named pipe / Unix domain socket and executes
 * WireGuard CLI commands on behalf of the unprivileged Electron app.
 */

import * as net from 'net'
import * as path from 'path'
import * as fs from 'fs'
import { execFile, execSync } from 'child_process'
import { promisify } from 'util'
import type { ServiceRequest, ServiceResponse } from './protocol'
import { SERVICE_PIPE_PATH } from './protocol'
import { getConfigDirPath } from '../shared/config-dir'

const execFileAsync = promisify(execFile)
const platform = process.platform

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
    wgExe: resolveUnixBinary('wg-quick'),
    wgCli: resolveUnixBinary('wg')
  }
}

function resolveUnixBinary(name: string): string {
  try {
    return execSync(`which ${name}`, { stdio: 'pipe' }).toString().trim()
  } catch {
    return name
  }
}

const { wgExe, wgCli } = resolveWgPaths()

// ─── Input validation ────────────────────────────────────────────────────────

const SAFE_NAME = /^[a-zA-Z0-9_-]+$/

function validateConfigPath(configPath: string): void {
  const resolved = path.resolve(configPath)
  const configDir = path.resolve(getConfigDirPath())
  if (!resolved.startsWith(configDir + path.sep) && resolved !== configDir) {
    throw new Error('Config path is outside the allowed directory')
  }
  if (!resolved.endsWith('.conf')) {
    throw new Error('Config path must end with .conf')
  }
  if (!fs.existsSync(resolved)) {
    throw new Error('Config file does not exist')
  }
}

function validateInterfaceName(name: string): void {
  if (!SAFE_NAME.test(name)) {
    throw new Error('Invalid interface name — only alphanumeric, dash, and underscore allowed')
  }
}

// ─── Command handlers ────────────────────────────────────────────────────────

async function handleConnect(configPath: string): Promise<ServiceResponse['data']> {
  validateConfigPath(configPath)
  try {
    if (platform === 'win32') {
      await execFileAsync(wgExe, ['/installtunnelservice', configPath])
    } else {
      await execFileAsync(wgExe, ['up', configPath])
    }
    return { connected: true }
  } catch (err: unknown) {
    const msg = String((err as { stderr?: string }).stderr || (err as Error).message || '')
    // Already connected — treat as success
    if (msg.includes('already exists') || msg.includes('1073') || msg.includes('already configured')) {
      return { connected: true }
    }
    throw new Error(msg || 'Failed to connect tunnel')
  }
}

async function handleDisconnect(interfaceName: string): Promise<ServiceResponse['data']> {
  validateInterfaceName(interfaceName)
  try {
    if (platform === 'win32') {
      await execFileAsync(wgExe, ['/uninstalltunnelservice', interfaceName])
    } else {
      await execFileAsync(wgExe, ['down', interfaceName])
    }
    return { disconnected: true }
  } catch (err: unknown) {
    const msg = String((err as { stderr?: string }).stderr || (err as Error).message || '')
    // Already disconnected — treat as success
    if (msg.includes('1060') || msg.includes('does not exist') || msg.includes('not found') ||
        msg.includes('is not a WireGuard interface')) {
      return { disconnected: true }
    }
    throw new Error(msg || 'Failed to disconnect tunnel')
  }
}

function handleInterfaces(): string[] {
  try {
    const cmd = platform === 'win32' ? `"${wgCli}" show interfaces` : `${wgCli} show interfaces`
    const output = execSync(cmd, { stdio: 'pipe' }).toString().trim()
    if (!output) return []
    return output.split(/\s+/).filter(Boolean)
  } catch {
    return []
  }
}

function handleStatus(): unknown {
  try {
    const cmd = platform === 'win32' ? `"${wgCli}" show all dump` : `${wgCli} show all dump`
    const output = execSync(cmd, { stdio: 'pipe' }).toString().trim()
    if (!output) return { interfaces: [] }

    const interfaces: Record<string, { name: string; publicKey: string; listenPort?: number; peers: unknown[] }> = {}

    for (const line of output.split('\n')) {
      const parts = line.split('\t')
      if (parts.length === 5) {
        const [name, , publicKey, listenPort] = parts
        interfaces[name] = {
          name,
          publicKey,
          listenPort: listenPort !== 'off' ? parseInt(listenPort) : undefined,
          peers: []
        }
      } else if (parts.length === 9) {
        const [iface, pubkey, preshared, endpoint, allowedIPs, latestHandshake, rx, tx, keepalive] = parts
        const ifc = interfaces[iface]
        if (ifc) {
          ifc.peers.push({
            publicKey: pubkey,
            presharedKey: preshared !== '(none)' ? preshared : undefined,
            endpoint: endpoint !== '(none)' ? endpoint : undefined,
            allowedIPs: allowedIPs.split(',').map((s) => s.trim()),
            latestHandshake: latestHandshake !== '0' ? parseInt(latestHandshake) : undefined,
            rxBytes: parseInt(rx) || 0,
            txBytes: parseInt(tx) || 0,
            persistentKeepalive: keepalive !== 'off' ? parseInt(keepalive) : undefined
          })
        }
      }
    }

    return { interfaces: Object.values(interfaces) }
  } catch {
    return { interfaces: [] }
  }
}

// ─── Request dispatcher ──────────────────────────────────────────────────────

async function handleRequest(req: ServiceRequest): Promise<ServiceResponse> {
  try {
    switch (req.command) {
      case 'ping':
        return { id: req.id, success: true, data: { pong: true } }

      case 'connect': {
        if (!req.args?.configPath) {
          return { id: req.id, success: false, error: 'Missing configPath argument' }
        }
        const data = await handleConnect(req.args.configPath)
        return { id: req.id, success: true, data }
      }

      case 'disconnect': {
        if (!req.args?.interfaceName) {
          return { id: req.id, success: false, error: 'Missing interfaceName argument' }
        }
        const data = await handleDisconnect(req.args.interfaceName)
        return { id: req.id, success: true, data }
      }

      case 'interfaces':
        return { id: req.id, success: true, data: handleInterfaces() }

      case 'status':
        return { id: req.id, success: true, data: handleStatus() }

      default:
        return { id: req.id, success: false, error: `Unknown command: ${req.command}` }
    }
  } catch (err) {
    return { id: req.id, success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

// ─── Server ──────────────────────────────────────────────────────────────────

function startServer(): void {
  // On Unix, remove stale socket file
  if (platform !== 'win32' && fs.existsSync(SERVICE_PIPE_PATH)) {
    fs.unlinkSync(SERVICE_PIPE_PATH)
  }

  const server = net.createServer((socket) => {
    let buffer = ''

    socket.on('data', (chunk) => {
      buffer += chunk.toString()
      // Process complete JSON messages (newline-delimited)
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const req = JSON.parse(line) as ServiceRequest
          handleRequest(req).then((res) => {
            socket.write(JSON.stringify(res) + '\n')
          })
        } catch {
          socket.write(JSON.stringify({ id: 'unknown', success: false, error: 'Invalid JSON' }) + '\n')
        }
      }
    })

    socket.on('error', (err) => {
      console.error('Socket error:', err.message)
    })
  })

  server.listen(SERVICE_PIPE_PATH, () => {
    // On Unix, make the socket world-readable/writable so the unprivileged
    // Electron app can connect to the root-owned service socket.
    if (platform !== 'win32') {
      fs.chmodSync(SERVICE_PIPE_PATH, 0o666)
    }
    console.log(`ODN Tunnel Service listening on ${SERVICE_PIPE_PATH}`)
  })

  server.on('error', (err) => {
    console.error('Server error:', err)
    process.exit(1)
  })

  // Graceful shutdown
  const shutdown = (): void => {
    console.log('Shutting down ODN Tunnel Service...')
    server.close(() => {
      if (platform !== 'win32' && fs.existsSync(SERVICE_PIPE_PATH)) {
        fs.unlinkSync(SERVICE_PIPE_PATH)
      }
      process.exit(0)
    })
  }

  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

startServer()
