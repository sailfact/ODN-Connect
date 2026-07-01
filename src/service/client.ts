/**
 * Client for communicating with the elevated ODN Tunnel Service.
 *
 * Used by the Electron main process to send tunnel operations to the
 * privileged service over a local named pipe / Unix domain socket.
 */

import * as net from 'net'
import * as crypto from 'crypto'
import type { ServiceRequest, ServiceResponse, ServiceCommand } from './protocol'
import { SERVICE_PIPE_PATH } from './protocol'
import type { WireGuardInterface, WireGuardStatus } from '../main/types'

/** Default timeout for service requests (ms). */
const REQUEST_TIMEOUT = 10_000

export class TunnelServiceClient {
  private socket: net.Socket | null = null
  private buffer = ''
  private pendingRequests = new Map<string, {
    resolve: (res: ServiceResponse) => void
    reject: (err: Error) => void
    timer: ReturnType<typeof setTimeout>
  }>()
  private connected = false

  // ponytail: no in-client reconnect — the main process re-inits the client on a
  // 30s health poll (tryReconnectService), so a second backoff loop here is dead weight.
  /** Connect to the tunnel service. Resolves on connect, rejects on error. */
  connect(): Promise<void> {
    if (this.connected) return Promise.resolve()
    return new Promise((resolve, reject) => {
      this.socket = net.createConnection(SERVICE_PIPE_PATH)

      this.socket.on('connect', () => {
        this.connected = true
        this.buffer = ''
        resolve()
      })

      this.socket.on('error', () => {
        this.connected = false
        reject(new Error('Failed to connect to tunnel service'))
      })

      this.attachHandlers(this.socket)
    })
  }

  private attachHandlers(socket: net.Socket): void {
    socket.on('data', (chunk) => {
      this.buffer += chunk.toString()
      const lines = this.buffer.split('\n')
      this.buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const res = JSON.parse(line) as ServiceResponse
          const pending = this.pendingRequests.get(res.id)
          if (pending) {
            clearTimeout(pending.timer)
            this.pendingRequests.delete(res.id)
            pending.resolve(res)
          }
        } catch {
          // Ignore malformed responses
        }
      }
    })

    socket.on('close', () => {
      this.connected = false
      // Reject all pending requests
      for (const [id, pending] of this.pendingRequests) {
        clearTimeout(pending.timer)
        pending.reject(new Error('Service connection closed'))
        this.pendingRequests.delete(id)
      }
    })

    // Post-connect errors: mark disconnected. 'close' follows and rejects pending
    // requests; the main-process health poll re-inits the client.
    socket.on('error', () => {
      this.connected = false
    })
  }

  /** Disconnect from the service. */
  disconnect(): void {
    if (this.socket) {
      this.socket.destroy()
      this.socket = null
    }
    this.connected = false
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timer)
      pending.reject(new Error('Client disconnected'))
    }
    this.pendingRequests.clear()
  }

  /** Whether the client is currently connected to the service. */
  isConnected(): boolean {
    return this.connected
  }

  /** Send a request and wait for a correlated response. */
  private send(command: ServiceCommand, args?: ServiceRequest['args']): Promise<ServiceResponse> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.connected) {
        reject(new Error('Not connected to tunnel service'))
        return
      }

      const id = crypto.randomUUID()
      const req: ServiceRequest = { id, command, args }

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Request timed out: ${command}`))
      }, REQUEST_TIMEOUT)

      this.pendingRequests.set(id, { resolve, reject, timer })
      this.socket.write(JSON.stringify(req) + '\n')
    })
  }

  // ─── High-level tunnel operations ──────────────────────────────────────────

  async connectTunnel(configPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await this.send('connect', { configPath })
      if (!res.success) return { success: false, error: res.error }
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async disconnectTunnel(interfaceName: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await this.send('disconnect', { interfaceName })
      if (!res.success) return { success: false, error: res.error }
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }

  async getActiveInterfaces(): Promise<string[]> {
    try {
      const res = await this.send('interfaces')
      if (res.success && Array.isArray(res.data)) {
        return res.data as string[]
      }
      return []
    } catch {
      return []
    }
  }

  async getWireGuardStatus(): Promise<WireGuardStatus> {
    try {
      const res = await this.send('status')
      if (res.success && res.data) {
        return res.data as WireGuardStatus
      }
      return { interfaces: [] }
    } catch {
      return { interfaces: [] }
    }
  }

  async syncConf(interfaceName: string, configPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await this.send('syncconf', { interfaceName, configPath })
      if (!res.success) return { success: false, error: res.error }
      return { success: true }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  }
}
