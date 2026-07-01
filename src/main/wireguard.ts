/**
 * WireGuard integration layer.
 *
 * This module provides tunnel management capabilities by delegating
 * elevated operations (connect, disconnect, status queries) to the
 * ODN Tunnel Service running as SYSTEM/root.
 *
 * Non-elevated operations (config parsing, file management, key generation)
 * run directly in the Electron process. Elevated operations require the
 * tunnel service; if it is not connected they return an error / empty result.
 */

import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import { parse as parseIni } from 'ini'
import type { Tunnel, WireGuardPeer, WireGuardStatus } from './types'
import { TunnelServiceClient } from '../service/client'
import { getConfigDirPath } from '../shared/config-dir'

const platform = process.platform

const SERVICE_UNAVAILABLE = 'Tunnel service is not running. Please install the ODN Tunnel Service.'

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

const { wgExe, wgCli } = resolveWgPaths()
/** Path to wireguard.exe (Windows) or wg-quick (Linux/macOS) — manages tunnel lifecycle. */
export const WG_EXE = wgExe
/** Path to wg.exe (Windows) or wg (Linux/macOS) — queries interface status and generates keys. */
export const WG_CLI = wgCli

// ─── Config directory ────────────────────────────────────────────────────────

/**
 * Returns the directory where tunnel .conf files are stored.
 * Creates the directory if it doesn't exist.
 */
export function getConfigDir(): string {
  const dir = getConfigDirPath()
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

/** Connect a WireGuard tunnel via the tunnel service. */
export async function connectTunnel(configPath: string): Promise<{ success: boolean; error?: string }> {
  if (serviceClient?.isConnected()) {
    return serviceClient.connectTunnel(configPath)
  }
  return { success: false, error: SERVICE_UNAVAILABLE }
}

/** Disconnect a WireGuard tunnel via the tunnel service. */
export async function disconnectTunnel(interfaceName: string): Promise<{ success: boolean; error?: string }> {
  if (serviceClient?.isConnected()) {
    return serviceClient.disconnectTunnel(interfaceName)
  }
  return { success: false, error: SERVICE_UNAVAILABLE }
}

// ─── Status queries ──────────────────────────────────────────────────────────

/** Returns names of currently active WireGuard interfaces (empty if no service). */
export async function getActiveInterfaces(): Promise<string[]> {
  return serviceClient?.isConnected() ? serviceClient.getActiveInterfaces() : []
}

/** Returns structured status for all active interfaces (empty if no service). */
export async function getWireGuardStatus(): Promise<WireGuardStatus> {
  return serviceClient?.isConnected()
    ? serviceClient.getWireGuardStatus()
    : { interfaces: [] }
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

/**
 * Sanitize a tunnel name for use as a .conf filename and WireGuard interface name.
 * Applied to user-picked filenames on import and to peer names received from an
 * ODN VPN Server (which are not guaranteed to be filesystem-safe).
 */
export function sanitizeTunnelName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '_')
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
