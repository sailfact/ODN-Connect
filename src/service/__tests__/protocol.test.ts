import { describe, it, expect } from 'vitest'
import { SERVICE_PIPE_PATH } from '../protocol'
import type { ServiceRequest, ServiceResponse, ServiceCommand } from '../protocol'

describe('protocol', () => {
  it('exports a valid pipe path for the current platform', () => {
    expect(typeof SERVICE_PIPE_PATH).toBe('string')
    expect(SERVICE_PIPE_PATH.length).toBeGreaterThan(0)

    if (process.platform === 'win32') {
      expect(SERVICE_PIPE_PATH).toMatch(/^\\\\.\\pipe\\/)
    } else {
      expect(SERVICE_PIPE_PATH).toMatch(/\.sock$/)
    }
  })

  it('ServiceRequest shape is compatible with JSON serialization', () => {
    const req: ServiceRequest = {
      id: 'test-123',
      command: 'connect',
      args: { configPath: '/path/to/tunnel.conf' }
    }

    const serialized = JSON.stringify(req)
    const parsed = JSON.parse(serialized) as ServiceRequest

    expect(parsed.id).toBe('test-123')
    expect(parsed.command).toBe('connect')
    expect(parsed.args?.configPath).toBe('/path/to/tunnel.conf')
  })

  it('ServiceResponse shape is compatible with JSON serialization', () => {
    const res: ServiceResponse = {
      id: 'test-456',
      success: true,
      data: { connected: true }
    }

    const serialized = JSON.stringify(res)
    const parsed = JSON.parse(serialized) as ServiceResponse

    expect(parsed.id).toBe('test-456')
    expect(parsed.success).toBe(true)
    expect(parsed.data).toEqual({ connected: true })
  })

  it('ServiceResponse error shape works correctly', () => {
    const res: ServiceResponse = {
      id: 'err-789',
      success: false,
      error: 'Config file does not exist'
    }

    const serialized = JSON.stringify(res)
    const parsed = JSON.parse(serialized) as ServiceResponse

    expect(parsed.success).toBe(false)
    expect(parsed.error).toBe('Config file does not exist')
    expect(parsed.data).toBeUndefined()
  })

  it('all ServiceCommand values are valid', () => {
    const commands: ServiceCommand[] = ['connect', 'disconnect', 'status', 'interfaces', 'ping']
    commands.forEach((cmd) => {
      expect(typeof cmd).toBe('string')
    })
    expect(commands).toHaveLength(5)
  })
})
