import type { Tunnel } from '../types'

interface StatusBarProps {
  tunnels: Tunnel[]
  lastRefreshed: number
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KiB', 'MiB', 'GiB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function formatRelative(ts: number): string {
  const sec = Math.floor((Date.now() - ts) / 1000)
  if (sec < 5) return 'just now'
  if (sec < 60) return `${sec}s ago`
  return `${Math.floor(sec / 60)}m ago`
}

export default function StatusBar({ tunnels, lastRefreshed }: StatusBarProps) {
  const activeCount = tunnels.filter((t) => t.connected).length
  const totalRx = tunnels.reduce((acc, t) => acc + t.peers.reduce((a, p) => a + (p.rxBytes || 0), 0), 0)
  const totalTx = tunnels.reduce((acc, t) => acc + t.peers.reduce((a, p) => a + (p.txBytes || 0), 0), 0)

  return (
    <div className="shrink-0 border-t border-border bg-bg-secondary px-4 py-1.5 flex items-center gap-4 text-xs text-text-muted">
      <span>
        <span className={activeCount > 0 ? 'text-accent-success' : ''}>{activeCount}</span> active tunnel{activeCount !== 1 ? 's' : ''}
      </span>
      {(totalRx > 0 || totalTx > 0) && (
        <span>↑{formatBytes(totalTx)} ↓{formatBytes(totalRx)}</span>
      )}
      <span className="ml-auto">Updated {formatRelative(lastRefreshed)}</span>
    </div>
  )
}
