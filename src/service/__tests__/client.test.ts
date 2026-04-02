import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import type { ServiceResponse } from '../protocol'

// Mock net module
const mockSocket = new EventEmitter() as EventEmitter & {
  write: ReturnType<typeof vi.fn>
  destroy: ReturnType<typeof vi.fn>
}
mockSocket.write = vi.fn()
mockSocket.destroy = vi.fn()

vi.mock('net', () => ({
  createConnection: vi.fn(() => {
    // Simulate immediate connection
    setTimeout(() => mockSocket.emit('connect'), 0)
    return mockSocket
  })
}))

vi.mock('crypto', () => ({
  randomUUID: vi.fn(() => 'test-uuid-' + Math.random().toString(36).slice(2, 8))
}))

describe('TunnelServiceClient', () => {
  let TunnelServiceClient: typeof import('../client').TunnelServiceClient

  beforeEach(async () => {
    vi.clearAllMocks()
    // Reset EventEmitter listeners
    mockSocket.removeAllListeners()
    mockSocket.write = vi.fn()
    mockSocket.destroy = vi.fn()

    const mod = await import('../client')
    TunnelServiceClient = mod.TunnelServiceClient
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('connects to the service', async () => {
    const client = new TunnelServiceClient()
    await client.connect()
    expect(client.isConnected()).toBe(true)
  })

  it('disconnects from the service', async () => {
    const client = new TunnelServiceClient()
    await client.connect()
    client.disconnect()
    expect(client.isConnected()).toBe(false)
  })

  it('reports not connected before connect()', () => {
    const client = new TunnelServiceClient()
    expect(client.isConnected()).toBe(false)
  })

  it('sends JSON messages over the socket', async () => {
    const client = new TunnelServiceClient()
    await client.connect()

    // Start a connect tunnel request (don't await — we'll simulate the response)
    const promise = client.connectTunnel('/path/to/tunnel.conf')

    // Verify the socket write was called with valid JSON
    expect(mockSocket.write).toHaveBeenCalled()
    const written = (mockSocket.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    const parsed = JSON.parse(written.trim())

    expect(parsed.command).toBe('connect')
    expect(parsed.args.configPath).toBe('/path/to/tunnel.conf')
    expect(parsed.id).toBeDefined()

    // Simulate a success response
    const response: ServiceResponse = {
      id: parsed.id,
      success: true,
      data: { connected: true }
    }
    mockSocket.emit('data', Buffer.from(JSON.stringify(response) + '\n'))

    const result = await promise
    expect(result.success).toBe(true)
  })

  it('handles disconnect tunnel requests', async () => {
    const client = new TunnelServiceClient()
    await client.connect()

    const promise = client.disconnectTunnel('wg0')

    const written = (mockSocket.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    const parsed = JSON.parse(written.trim())

    expect(parsed.command).toBe('disconnect')
    expect(parsed.args.interfaceName).toBe('wg0')

    const response: ServiceResponse = {
      id: parsed.id,
      success: true,
      data: { disconnected: true }
    }
    mockSocket.emit('data', Buffer.from(JSON.stringify(response) + '\n'))

    const result = await promise
    expect(result.success).toBe(true)
  })

  it('returns empty array for getActiveInterfaces on error', async () => {
    const client = new TunnelServiceClient()
    // Don't connect — should return empty
    const result = await client.getActiveInterfaces()
    expect(result).toEqual([])
  })

  it('returns empty interfaces for getWireGuardStatus on error', async () => {
    const client = new TunnelServiceClient()
    const result = await client.getWireGuardStatus()
    expect(result).toEqual({ interfaces: [] })
  })

  it('handles service error responses', async () => {
    const client = new TunnelServiceClient()
    await client.connect()

    const promise = client.connectTunnel('/bad/path.conf')

    const written = (mockSocket.write as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    const parsed = JSON.parse(written.trim())

    const response: ServiceResponse = {
      id: parsed.id,
      success: false,
      error: 'Config file does not exist'
    }
    mockSocket.emit('data', Buffer.from(JSON.stringify(response) + '\n'))

    const result = await promise
    expect(result.success).toBe(false)
    expect(result.error).toBe('Config file does not exist')
  })
})
