/**
 * Dashboard view — provides an at-a-glance overview of the VPN network.
 *
 * Displays summary statistics (active tunnels, peer count, total transfer),
 * quick-action tunnel cards for connecting/disconnecting, and a detailed
 * view of active peers with their handshake and transfer status.
 */

import { useState } from 'react'
import type { Tunnel, Route } from '../types'

interface DashboardProps {
  tunnels: Tunnel[]
  wgInstalled: { wg: boolean; wgQuick: boolean } | null
  onNavigate: (r: Route) => void
  onConnect: (id: string) => Promise<void>
  onDisconnect: (id: string) => Promise<void>
}

/** A small card displaying a single statistic with a label and optional subtitle. */
function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card flex flex-col gap-1">
      <p className="text-text-muted text-xs font-medium uppercase tracking-wider">{label}</p>
      <p className="text-text-primary text-2xl font-bold">{value}</p>
      {sub && <p className="text-text-secondary text-xs">{sub}</p>}
    </div>
  )
}

/** A compact tunnel card with status dot, info summary, and connect/disconnect toggle. */
function TunnelCard({
  tunnel,
  onConnect,
  onDisconnect
}: {
  tunnel: Tunnel
  onConnect: () => void
  onDisconnect: () => void
}) {
  const [busy, setBusy] = useState(false)
  const totalRx = tunnel.peers.reduce((acc, p) => acc + (p.rxBytes || 0), 0)
  const totalTx = tunnel.peers.reduce((acc, p) => acc + (p.txBytes || 0), 0)

  const handleToggle = async () => {
    setBusy(true)
    try {
      if (tunnel.connected) {
        await onDisconnect()
      } else {
        await onConnect()
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`card flex items-center gap-4 transition-all ${tunnel.connected ? 'border-green-500/30' : ''}`}>
      {/* Status dot */}
      <div className={`w-3 h-3 rounded-full shrink-0 ${tunnel.connected ? 'bg-accent-green' : 'bg-text-muted'}`} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-text-primary font-semibold text-sm truncate">{tunnel.name}</p>
          {tunnel.connected && (
            <span className="badge-connected">Connected</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-text-secondary">
          {tunnel.address && tunnel.address.length > 0 && (
            <span className="font-mono">{tunnel.address.join(', ')}</span>
          )}
          <span>{tunnel.peers.length} peer{tunnel.peers.length !== 1 ? 's' : ''}</span>
          {tunnel.connected && totalRx + totalTx > 0 && (
            <span>↑{formatBytes(totalTx)} ↓{formatBytes(totalRx)}</span>
          )}
        </div>
      </div>

      {/* Toggle */}
      <button
        onClick={handleToggle}
        disabled={busy}
        className={`shrink-0 px-4 py-1.5 rounded-lg text-sm font-medium transition-all ${
          busy
            ? 'opacity-50 cursor-not-allowed bg-bg-elevated text-text-secondary'
            : tunnel.connected
            ? 'btn-secondary text-accent-red hover:border-red-500/50'
            : 'btn-primary'
        }`}
      >
        {busy ? '...' : tunnel.connected ? 'Disconnect' : 'Connect'}
      </button>
    </div>
  )
}

/** Converts a byte count to a human-readable string for display in the UI. */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KiB', 'MiB', 'GiB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

export default function Dashboard({ tunnels, wgInstalled, onNavigate, onConnect, onDisconnect }: DashboardProps) {
  const connected = tunnels.filter((t) => t.connected)
  const totalPeers = tunnels.reduce((acc, t) => acc + t.peers.length, 0)
  const totalRx = tunnels.reduce((acc, t) => acc + t.peers.reduce((a, p) => a + (p.rxBytes || 0), 0), 0)
  const totalTx = tunnels.reduce((acc, t) => acc + t.peers.reduce((a, p) => a + (p.txBytes || 0), 0), 0)

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-text-primary text-xl font-bold">Dashboard</h1>
          <p className="text-text-secondary text-sm mt-1">
            Overview of your WireGuard network
          </p>
        </div>

        {/* WireGuard not installed warning */}
        {wgInstalled && (!wgInstalled.wg || !wgInstalled.wgQuick) && (
          <div className="mb-6 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <div className="text-accent-yellow text-lg shrink-0">⚠</div>
              <div>
                <p className="text-accent-yellow font-semibold text-sm">WireGuard not fully installed</p>
                <p className="text-text-secondary text-xs mt-1">
                  {!wgInstalled.wg && 'wg not found. '}
                  {!wgInstalled.wgQuick && 'wg-quick / wireguard not found. '}
                  Download and install WireGuard from{' '}
                  <code className="bg-bg-elevated px-1 rounded text-text-primary">wireguard.com/install</code>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-4 gap-3 mb-6">
          <StatCard
            label="Active"
            value={String(connected.length)}
            sub={`of ${tunnels.length} tunnels`}
          />
          <StatCard
            label="Peers"
            value={String(totalPeers)}
            sub="configured"
          />
          <StatCard
            label="Downloaded"
            value={formatBytes(totalRx)}
            sub="total received"
          />
          <StatCard
            label="Uploaded"
            value={formatBytes(totalTx)}
            sub="total sent"
          />
        </div>

        {/* Tunnels */}
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-text-primary font-semibold text-sm">Your Tunnels</h2>
          <button
            className="text-accent-blue text-sm hover:underline"
            onClick={() => onNavigate('tunnels')}
          >
            Manage all →
          </button>
        </div>

        {tunnels.length === 0 ? (
          <div className="card text-center py-12">
            <div className="text-4xl mb-3">🔒</div>
            <p className="text-text-primary font-semibold">No tunnels configured</p>
            <p className="text-text-secondary text-sm mt-1 mb-4">
              Import a WireGuard .conf file to get started
            </p>
            <button className="btn-primary" onClick={() => onNavigate('tunnels')}>
              Add your first tunnel →
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {tunnels.map((tunnel) => (
              <TunnelCard
                key={tunnel.id}
                tunnel={tunnel}
                onConnect={() => onConnect(tunnel.id)}
                onDisconnect={() => onDisconnect(tunnel.id)}
              />
            ))}
          </div>
        )}

        {/* Connected peers detail */}
        {connected.length > 0 && (
          <div className="mt-6">
            <h2 className="text-text-primary font-semibold text-sm mb-3">Active Peers</h2>
            <div className="flex flex-col gap-2">
              {connected.flatMap((tunnel) =>
                tunnel.peers.map((peer, idx) => (
                  <div key={`${tunnel.id}-${idx}`} className="card py-3 px-4 flex items-center gap-4">
                    <div className={`w-2 h-2 rounded-full shrink-0 ${
                      peer.latestHandshake && Date.now() / 1000 - peer.latestHandshake < 180
                        ? 'bg-accent-green'
                        : 'bg-text-muted'
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-text-primary text-xs font-mono truncate">{peer.publicKey.slice(0, 24)}…</p>
                      <p className="text-text-muted text-xs mt-0.5">
                        {peer.endpoint || 'No endpoint'} · {peer.allowedIPs.join(', ')}
                      </p>
                    </div>
                    <div className="text-right text-xs text-text-secondary shrink-0">
                      {peer.handshakeFormatted && <p>Handshake: {peer.handshakeFormatted}</p>}
                      {(peer.rxFormatted || peer.txFormatted) && (
                        <p>↑{peer.txFormatted} ↓{peer.rxFormatted}</p>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
