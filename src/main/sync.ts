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
import { getConfigDir, parseTunnelConfig } from './wireguard'
import { getTunnels, saveTunnel, deleteTunnel } from './store'
import type { ServerClient } from './server-client'
import type { TunnelServiceClient } from '../service/client'
import type { SyncStatus, Tunnel } from './types'

const SYNC_INTERVAL_MS = 30_000

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
      const serverNames = new Set(peers.map((p) => p.name))
      const configDir = getConfigDir()

      // Fetch/update configs for each server peer
      for (const peer of peers) {
        const configPath = path.join(configDir, `${peer.name}.conf`)
        const result = await this.client.getPeerConfig(peer.id, this.lastModified.get(peer.id))

        if (result.status === 200) {
          // Write updated config to disk
          fs.writeFileSync(configPath, result.body, 'utf-8')
          this.lastModified.set(peer.id, result.lastModified)

          // Add to store if not already present
          const existing = getTunnels().find((t) => t.configPath === configPath)
          if (!existing) {
            const parsed = parseTunnelConfig(configPath)
            const tunnel: Tunnel = {
              id: crypto.randomUUID(),
              name: peer.name,
              configPath,
              address: parsed.address ?? [],
              dns: parsed.dns ?? [],
              listenPort: parsed.listenPort,
              peers: parsed.peers ?? [],
              connected: false,
              createdAt: Date.now()
            }
            saveTunnel(tunnel)
          }

          // If this tunnel is currently active, apply the new config live
          const serviceClient = this.getServiceClient()
          if (serviceClient) {
            const activeInterfaces = await serviceClient.getActiveInterfaces()
            if (activeInterfaces.includes(peer.name)) {
              const syncResult = await serviceClient.syncConf(peer.name, configPath)
              if (!syncResult.success) {
                console.error(`syncconf failed for ${peer.name}:`, syncResult.error)
                this.status.error = `Config updated but live sync failed for ${peer.name} — reconnect to apply`
              }
            }
          }
        }
        // status 304 — config unchanged, nothing to do
      }

      // Remove .conf files for peers deleted on the server
      const confFiles = fs.readdirSync(configDir).filter((f) => f.endsWith('.conf'))
      for (const file of confFiles) {
        const name = file.replace(/\.conf$/, '')
        if (!serverNames.has(name)) {
          const configPath = path.join(configDir, file)
          try {
            fs.unlinkSync(configPath)
          } catch (err) {
            console.error(`Failed to remove stale config ${file}:`, err)
          }
          // Remove from store by configPath
          const tunnel = getTunnels().find((t) => t.configPath === configPath)
          if (tunnel) deleteTunnel(tunnel.id)
        }
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
