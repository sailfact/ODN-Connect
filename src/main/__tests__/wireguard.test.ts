import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock Electron and external modules before importing wireguard
vi.mock('electron', () => ({ app: { getPath: () => '/tmp' } }))
vi.mock('electron-store', () => ({ default: vi.fn() }))
vi.mock('child_process', () => ({
  execSync: vi.fn(),
  exec: vi.fn()
}))
vi.mock('ini', () => ({
  parse: vi.fn((content: string) => {
    // Simple mock INI parser
    const result: Record<string, Record<string, string>> = {}
    let section = ''
    for (const line of content.split('\n')) {
      const trimmed = line.trim()
      if (trimmed.startsWith('[')) {
        section = trimmed.slice(1, -1)
        result[section] = result[section] || {}
      } else if (trimmed.includes('=') && section) {
        const [key, ...rest] = trimmed.split('=')
        result[section][key.trim()] = rest.join('=').trim()
      }
    }
    return result
  })
}))

// Test the pure utility functions by importing them directly
// We need to test formatBytes and formatHandshake which are exported

describe('formatBytes', () => {
  // Import dynamically to avoid Electron dependency issues
  let formatBytes: (bytes: number) => string

  beforeEach(async () => {
    const mod = await import('../wireguard')
    formatBytes = mod.formatBytes
  })

  it('returns "0 B" for zero bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
  })

  it('formats bytes correctly', () => {
    expect(formatBytes(500)).toBe('500 B')
  })

  it('formats KiB correctly', () => {
    expect(formatBytes(1024)).toBe('1 KiB')
    expect(formatBytes(1536)).toBe('1.5 KiB')
  })

  it('formats MiB correctly', () => {
    expect(formatBytes(1048576)).toBe('1 MiB')
    expect(formatBytes(1572864)).toBe('1.5 MiB')
  })

  it('formats GiB correctly', () => {
    expect(formatBytes(1073741824)).toBe('1 GiB')
  })

  it('handles large numbers', () => {
    expect(formatBytes(1099511627776)).toBe('1 TiB')
  })
})

describe('formatHandshake', () => {
  let formatHandshake: (timestamp?: number) => string

  beforeEach(async () => {
    const mod = await import('../wireguard')
    formatHandshake = mod.formatHandshake
  })

  it('returns "Never" for undefined', () => {
    expect(formatHandshake(undefined)).toBe('Never')
  })

  it('returns "Never" for 0', () => {
    expect(formatHandshake(0)).toBe('Never')
  })

  it('formats seconds ago', () => {
    const now = Math.floor(Date.now() / 1000)
    expect(formatHandshake(now - 30)).toBe('30s ago')
  })

  it('formats minutes ago', () => {
    const now = Math.floor(Date.now() / 1000)
    expect(formatHandshake(now - 120)).toBe('2m ago')
  })

  it('formats hours ago', () => {
    const now = Math.floor(Date.now() / 1000)
    expect(formatHandshake(now - 7200)).toBe('2h ago')
  })

  it('formats days ago', () => {
    const now = Math.floor(Date.now() / 1000)
    expect(formatHandshake(now - 172800)).toBe('2d ago')
  })
})
