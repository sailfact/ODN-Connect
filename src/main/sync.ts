/**
 * Periodic config sync loop for the ODN VPN Server integration.
 *
 * Polls the server every 30 seconds, writes updated .conf files to disk,
 * calls `wg syncconf` on active tunnels when their config changes, and
 * removes .conf files for peers deleted on the server.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as crypto from 'node:crypto'
import { getConfigDir, parseTunnelConfig, sanitizeTunnelName } from './wireguard'
import { getTunnels, saveTunnel, deleteTunnel } from './store'
import type { ServerClient } from './server-client'
import type { TunnelServiceClient } from '../service/client'
import type { SyncStatus, Tunnel } from './types'

const SYNC_INTERVAL_MS = 30_000

const PRIVATE_KEY_RE = /^[ \t]*PrivateKey[ \t]*=[ \t]*(.+)$/m

function extractPrivateKey(conf: string): string | null {
  const match = conf.match(PRIVATE_KEY_RE)
  return match ? match[1].trim() : null
}

/**
 * Self-service peers keep their private key on this device — the server never
 * sees it, so the .conf it serves has no PrivateKey line. Re-inject the key
 * from the existing local file so a sync never breaks a working tunnel.
 */
function withLocalPrivateKey(newConf: string, configPath: string): string {
  if (extractPrivateKey(newConf)) return newConf
  if (!fs.existsSync(configPath)) return newConf
  const localKey = extractPrivateKey(fs.readFileSync(configPath, 'utf-8'))
  if (!localKey) return newConf
  return newConf.replace(
    /^[ \t]*\[Interface\][ \t]*$/m,
    `[Interface]\nPrivateKey = ${localKey}`
  )
}

export class SyncManager {
  private status: SyncStatus = { lastSyncAt: null, syncing: false, error: null }
  private timer: ReturnType<typeof setInterval> | null = null
  /** Stores the Last-Modified header per peer ID for conditional requests. */
  private lastModified = new Map<string, string>()

  constructor(
    private client: ServerClient,
    private getServiceClient: () => TunnelServiceClient | null
  ) {}

  start(): void {
    this.syncNow().catch(() => {})
    this.timer = setInterval(() => this.syncNow().catch(() => {}), SYNC_INTERVAL_MS)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  getSyncStatus(): SyncStatus {
    return { ...this.status }
  }

  async syncNow(): Promise<void> {
    if (this.status.syncing) return
    this.status.syncing = true
    this.status.error = null

    try {
      const peers = await this.client.getPeers()
      const serverNames = new Set(peers.map((p) => sanitizeTunnelName(p.name)))
      const configDir = getConfigDir()

      // Fetch/update configs for each server peer
      for (const peer of peers) {
        const tunnelName = sanitizeTunnelName(peer.name)
        const configPath = path.join(configDir, `${tunnelName}.conf`)
        const result = await this.client.getPeerConfig(peer.id, this.lastModified.get(peer.id))

        if (result.status === 200) {
          // Write updated config to disk, keeping a locally held private key
          fs.writeFileSync(configPath, withLocalPrivateKey(result.body, configPath), 'utf-8')
          this.lastModified.set(peer.id, result.lastModified)

          // Add to store if not already present; mark as server-owned either way
          const existing = getTunnels().find((t) => t.configPath === configPath)
          if (!existing) {
            const parsed = parseTunnelConfig(configPath)
            const tunnel: Tunnel = {
              id: crypto.randomUUID(),
              name: tunnelName,
              configPath,
              address: parsed.address ?? [],
              dns: parsed.dns ?? [],
              listenPort: parsed.listenPort,
              peers: parsed.peers ?? [],
              connected: false,
              createdAt: Date.now(),
              source: 'server'
            }
            saveTunnel(tunnel)
          } else if (existing.source !== 'server') {
            saveTunnel({ ...existing, source: 'server' })
          }

          // If this tunnel is currently active, apply the new config live
          const serviceClient = this.getServiceClient()
          if (serviceClient) {
            const activeInterfaces = await serviceClient.getActiveInterfaces()
            if (activeInterfaces.includes(tunnelName)) {
              const syncResult = await serviceClient.syncConf(tunnelName, configPath)
              if (!syncResult.success) {
                console.error(`syncconf failed for ${tunnelName}:`, syncResult.error)
                this.status.error = `Config updated but live sync failed for ${tunnelName} — reconnect to apply`
              }
            }
          }
        }
        // status 304 — config unchanged, nothing to do
      }

      // Remove server-owned tunnels whose peer was deleted on the server.
      // Locally imported tunnels are never touched by the sync loop.
      for (const tunnel of getTunnels()) {
        if (tunnel.source !== 'server' || serverNames.has(tunnel.name)) continue
        try {
          fs.unlinkSync(tunnel.configPath)
        } catch (err) {
          console.error(`Failed to remove stale config ${tunnel.configPath}:`, err)
        }
        deleteTunnel(tunnel.id)
      }

      this.status.lastSyncAt = Date.now()
    } catch (err) {
      console.error('Sync error:', err)
      this.status.error = err instanceof Error ? err.message : String(err)
    } finally {
      this.status.syncing = false
    }
  }
}
