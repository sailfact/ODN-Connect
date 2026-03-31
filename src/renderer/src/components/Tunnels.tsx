import { useState } from 'react'
import type { Tunnel } from '../types'

interface TunnelsProps {
  tunnels: Tunnel[]
  onRefresh: () => Promise<void>
}

function PeerRow({ peer }: { peer: Tunnel['peers'][0] }) {
  return (
    <div className="border-t border-border/50 px-4 py-3 flex items-start gap-3">
      <div
        className={`w-2 h-2 rounded-full mt-1 shrink-0 ${
          peer.latestHandshake && Date.now() / 1000 - peer.latestHandshake < 180
            ? 'bg-accent-green'
            : 'bg-text-muted'
        }`}
      />
      <div className="flex-1 min-w-0 grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
        <div>
          <span className="text-text-muted">Public Key</span>
          <p className="text-text-primary font-mono truncate">{peer.publicKey}</p>
        </div>
        {peer.endpoint && (
          <div>
            <span className="text-text-muted">Endpoint</span>
            <p className="text-text-primary font-mono">{peer.endpoint}</p>
          </div>
        )}
        <div>
          <span className="text-text-muted">Allowed IPs</span>
          <p className="text-text-primary font-mono">{peer.allowedIPs.join(', ')}</p>
        </div>
        {peer.handshakeFormatted && (
          <div>
            <span className="text-text-muted">Last Handshake</span>
            <p className="text-text-primary">{peer.handshakeFormatted}</p>
          </div>
        )}
        {(peer.rxBytes !== undefined || peer.txBytes !== undefined) && (
          <div>
            <span className="text-text-muted">Transfer</span>
            <p className="text-text-primary">
              ↑ {peer.txFormatted || '0 B'} &nbsp;↓ {peer.rxFormatted || '0 B'}
            </p>
          </div>
        )}
        {peer.persistentKeepalive && (
          <div>
            <span className="text-text-muted">Keepalive</span>
            <p className="text-text-primary">{peer.persistentKeepalive}s</p>
          </div>
        )}
      </div>
    </div>
  )
}

function TunnelRow({
  tunnel,
  onConnect,
  onDisconnect,
  onDelete,
  expanded,
  onToggleExpand
}: {
  tunnel: Tunnel
  onConnect: () => Promise<void>
  onDisconnect: () => Promise<void>
  onDelete: () => Promise<void>
  expanded: boolean
  onToggleExpand: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleConnect = async () => {
    setBusy(true)
    setError(null)
    try {
      await onConnect()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const handleDisconnect = async () => {
    setBusy(true)
    setError(null)
    try {
      await onDisconnect()
    } catch (e: any) {
      setError(e.message)
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm(`Delete tunnel "${tunnel.name}"? This cannot be undone.`)) return
    setDeleting(true)
    try {
      await onDelete()
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className={`bg-bg-secondary border rounded-xl overflow-hidden transition-all ${
      tunnel.connected ? 'border-green-500/30' : 'border-border'
    }`}>
      {/* Header row */}
      <div className="flex items-center gap-3 px-4 py-3">
        <button onClick={onToggleExpand} className="flex items-center gap-3 flex-1 min-w-0 text-left">
          <div className={`w-3 h-3 rounded-full shrink-0 ${tunnel.connected ? 'bg-accent-green' : 'bg-text-muted'}`} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-text-primary font-semibold text-sm">{tunnel.name}</span>
              {tunnel.connected && <span className="badge-connected">Active</span>}
            </div>
            <div className="flex items-center gap-3 mt-0.5 text-xs text-text-secondary">
              {tunnel.address && tunnel.address.length > 0 && (
                <span className="font-mono">{tunnel.address.join(', ')}</span>
              )}
              {tunnel.dns && tunnel.dns.length > 0 && (
                <span>DNS: {tunnel.dns.join(', ')}</span>
              )}
              <span>{tunnel.peers.length} peer{tunnel.peers.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <span className={`text-text-muted text-xs transition-transform ${expanded ? 'rotate-180' : ''}`}>▼</span>
        </button>

        <div className="flex items-center gap-2 shrink-0">
          {tunnel.connected ? (
            <button
              onClick={handleDisconnect}
              disabled={busy}
              className="btn-secondary text-accent-red hover:border-red-500/50 disabled:opacity-50"
            >
              {busy ? '...' : 'Disconnect'}
            </button>
          ) : (
            <button
              onClick={handleConnect}
              disabled={busy}
              className="btn-primary disabled:opacity-50"
            >
              {busy ? '...' : 'Connect'}
            </button>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting || tunnel.connected}
            title={tunnel.connected ? 'Disconnect before deleting' : 'Delete tunnel'}
            className="p-2 text-text-muted hover:text-accent-red hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-30"
          >
            🗑
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-4 mb-3 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-accent-red">
          {error}
        </div>
      )}

      {/* Expanded peers */}
      {expanded && tunnel.peers.length > 0 && (
        <div>
          <div className="px-4 py-1 bg-bg-primary/50">
            <span className="text-text-muted text-xs font-semibold uppercase tracking-wider">Peers</span>
          </div>
          {tunnel.peers.map((peer, idx) => (
            <PeerRow key={idx} peer={peer} />
          ))}
        </div>
      )}

      {expanded && tunnel.peers.length === 0 && (
        <div className="border-t border-border/50 px-4 py-3 text-text-muted text-xs">
          No peers configured
        </div>
      )}
    </div>
  )
}

export default function Tunnels({ tunnels, onRefresh }: TunnelsProps) {
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const handleImport = async () => {
    setImporting(true)
    setImportError(null)
    try {
      const result = await window.api.importTunnel()
      if (result.canceled) return
      if (!result.success) {
        setImportError(result.error || 'Failed to import config')
        return
      }
      await onRefresh()
    } finally {
      setImporting(false)
    }
  }

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleConnect = async (tunnel: Tunnel) => {
    const result = await window.api.connectTunnel(tunnel.id)
    if (!result.success) throw new Error(result.error)
    await onRefresh()
  }

  const handleDisconnect = async (tunnel: Tunnel) => {
    const result = await window.api.disconnectTunnel(tunnel.id)
    if (!result.success) throw new Error(result.error)
    await onRefresh()
  }

  const handleDelete = async (tunnel: Tunnel) => {
    const result = await window.api.deleteTunnel(tunnel.id)
    if (!result.success) throw new Error(result.error)
    await onRefresh()
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-text-primary text-xl font-bold">Tunnels</h1>
            <p className="text-text-secondary text-sm mt-1">
              Manage your WireGuard tunnel configurations
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={onRefresh}
              className="btn-ghost"
            >
              ↺ Refresh
            </button>
            <button
              onClick={handleImport}
              disabled={importing}
              className="btn-primary"
            >
              {importing ? 'Importing...' : '+ Import .conf'}
            </button>
          </div>
        </div>

        {/* Import error */}
        {importError && (
          <div className="mb-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-accent-red">
            {importError}
          </div>
        )}

        {/* Tunnel list */}
        {tunnels.length === 0 ? (
          <div className="card text-center py-16">
            <div className="text-5xl mb-4">🔐</div>
            <p className="text-text-primary font-semibold text-lg">No tunnels yet</p>
            <p className="text-text-secondary text-sm mt-2 mb-6 max-w-sm mx-auto">
              Import an existing WireGuard .conf file to add your first tunnel.
              You can get these from your VPN provider or server admin.
            </p>
            <button onClick={handleImport} disabled={importing} className="btn-primary">
              Import WireGuard Config
            </button>

            <div className="mt-8 text-left max-w-sm mx-auto">
              <p className="text-text-muted text-xs font-semibold uppercase tracking-wider mb-2">Tips</p>
              <ul className="text-text-secondary text-xs space-y-1">
                <li>• WireGuard config files end in .conf</li>
                <li>• WireGuard must be installed from wireguard.com/install</li>
                <li>• Run ODN Client as Administrator for tunnel management</li>
              </ul>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {tunnels.map((tunnel) => (
              <TunnelRow
                key={tunnel.id}
                tunnel={tunnel}
                onConnect={() => handleConnect(tunnel)}
                onDisconnect={() => handleDisconnect(tunnel)}
                onDelete={() => handleDelete(tunnel)}
                expanded={expanded.has(tunnel.id)}
                onToggleExpand={() => toggleExpand(tunnel.id)}
              />
            ))}
          </div>
        )}

        {/* Info box */}
        <div className="mt-6 bg-accent-blue/5 border border-accent-blue/20 rounded-xl p-4 text-xs text-text-secondary">
          <p className="text-accent-blue font-semibold mb-1">How it works</p>
          <p>
            ODN Client uses the WireGuard Windows service to manage tunnels. Configs are stored in{' '}
            <code className="bg-bg-elevated px-1 rounded text-text-primary">%APPDATA%\odn-client\tunnels\</code>.
          </p>
          <button
            onClick={() => window.api.openConfigDir()}
            className="text-accent-blue hover:underline mt-1 inline-block"
          >
            Open config directory →
          </button>
        </div>
      </div>
    </div>
  )
}
