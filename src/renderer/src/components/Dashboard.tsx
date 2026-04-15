/**
 * Dashboard view — provides an at-a-glance overview of the VPN network.
 *
 * Displays summary statistics (active tunnels, peer count, total transfer),
 * quick-action tunnel cards for connecting/disconnecting, and a detailed
 * view of active peers with their handshake and transfer status.
 */

import { useState } from 'react'
import { AlertTriangle, Zap, Lock, Loader2, RefreshCw } from 'lucide-react'
import type { Tunnel, Route, ServiceStatus } from '../types'

interface DashboardProps {
  tunnels: Tunnel[]
  wgInstalled: { wg: boolean; wgQuick: boolean } | null
  serviceStatus: ServiceStatus | null
  onNavigate: (r: Route) => void
  onConnect: (id: string) => Promise<void>
  onDisconnect: (id: string) => Promise<void>
  onInstallService: () => Promise<{ success: boolean; error?: string }>
  onRefreshServiceStatus: () => Promise<void>
  onRefreshTunnels: () => Promise<void>
  lastRefreshed: number
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
      <div className={`w-3 h-3 rounded-full shrink-0 ${tunnel.connected ? 'bg-accent-success' : 'bg-text-muted'}`} />

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
          {tunnel.connected && tunnel.lastConnected && (
            <span>Connected for {formatDuration(tunnel.lastConnected)}</span>
          )}
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
            ? 'btn-secondary text-accent-danger hover:border-red-500/50'
            : 'btn-primary'
        }`}
      >
        {busy ? (
          <><Loader2 className="w-3.5 h-3.5 animate-spin inline mr-1" />{tunnel.connected ? 'Disconnecting...' : 'Connecting...'}</>
        ) : tunnel.connected ? 'Disconnect' : 'Connect'}
      </button>
    </div>
  )
}

function formatDuration(sinceMs: number): string {
  const diffSec = Math.floor((Date.now() - sinceMs) / 1000)
  if (diffSec < 60) return `${diffSec}s`
  const min = Math.floor(diffSec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  const remMin = min % 60
  if (hr < 24) return `${hr}h ${remMin}m`
  const day = Math.floor(hr / 24)
  return `${day}d ${hr % 24}h`
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

export default function Dashboard({ tunnels, wgInstalled, serviceStatus, onNavigate, onConnect, onDisconnect, onInstallService, onRefreshServiceStatus, onRefreshTunnels, lastRefreshed }: DashboardProps) {
  const [installingService, setInstallingService] = useState(false)
  const [serviceError, setServiceError] = useState<string | null>(null)
  const connected = tunnels.filter((t) => t.connected)
  const totalPeers = tunnels.reduce((acc, t) => acc + t.peers.length, 0)
  const totalRx = tunnels.reduce((acc, t) => acc + t.peers.reduce((a, p) => a + (p.rxBytes || 0), 0), 0)
  const totalTx = tunnels.reduce((acc, t) => acc + t.peers.reduce((a, p) => a + (p.txBytes || 0), 0), 0)

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-3xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-text-primary text-xl font-bold">Dashboard</h1>
            <p className="text-text-secondary text-sm mt-1">
              Overview of your WireGuard network
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-text-muted text-xs">Updated {formatRelative(lastRefreshed)}</span>
            <button onClick={onRefreshTunnels} className="btn-ghost" aria-label="Refresh">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* WireGuard not installed warning */}
        {wgInstalled && (!wgInstalled.wg || !wgInstalled.wgQuick) && (
          <div className="mb-6 bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-accent-warning shrink-0" />
              <div>
                <p className="text-accent-warning font-semibold text-sm">WireGuard not fully installed</p>
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

        {/* Tunnel service not running warning */}
        {serviceStatus && !serviceStatus.connected && (
          <div className="mb-6 bg-orange-500/10 border border-orange-500/30 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <Zap className="w-5 h-5 text-orange-400 shrink-0" />
              <div className="flex-1">
                <p className="text-orange-400 font-semibold text-sm">Tunnel Service Not Running</p>
                <p className="text-text-secondary text-xs mt-1">
                  {serviceStatus.installed
                    ? 'The ODN Tunnel Service is installed but not responding. Try restarting it.'
                    : 'Install the ODN Tunnel Service to connect tunnels without running as Administrator.'}
                </p>
                {serviceError && (
                  <p className="text-accent-danger text-xs mt-1">{serviceError}</p>
                )}
                {!serviceStatus.installed ? (
                  <button
                    className="mt-2 px-3 py-1 rounded-lg text-xs font-medium bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition-colors"
                    disabled={installingService}
                    onClick={async () => {
                      setInstallingService(true)
                      setServiceError(null)
                      const result = await onInstallService()
                      if (!result.success) {
                        setServiceError(result.error || 'Failed to install service')
                      }
                      setInstallingService(false)
                    }}
                  >
                    {installingService ? 'Installing...' : 'Install Service'}
                  </button>
                ) : (
                  <button
                    className="mt-2 px-3 py-1 rounded-lg text-xs font-medium bg-orange-500/20 text-orange-400 hover:bg-orange-500/30 transition-colors"
                    onClick={onRefreshServiceStatus}
                  >
                    Retry Connection
                  </button>
                )}
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
            className="text-accent-primary text-sm hover:underline"
            onClick={() => onNavigate('tunnels')}
          >
            Manage all →
          </button>
        </div>

        {tunnels.length === 0 ? (
          <div className="card text-center py-12">
            <Lock className="w-10 h-10 text-text-muted mx-auto mb-3" />
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
                        ? 'bg-accent-success'
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
