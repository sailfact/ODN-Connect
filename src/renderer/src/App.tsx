import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import Tunnels from './components/Tunnels'
import Settings from './components/Settings'
import type { Route, Tunnel, AppSettings } from './types'

declare global {
  interface Window {
    api: {
      checkInstalled: () => Promise<{ wg: boolean; wgQuick: boolean }>
      listTunnels: () => Promise<Tunnel[]>
      getTunnelStatus: () => Promise<Tunnel[]>
      connectTunnel: (id: string) => Promise<{ success: boolean; error?: string }>
      disconnectTunnel: (id: string) => Promise<{ success: boolean; error?: string }>
      importTunnel: () => Promise<{ success: boolean; canceled?: boolean; tunnel?: Tunnel; error?: string }>
      deleteTunnel: (id: string) => Promise<{ success: boolean; error?: string }>
      generateKeys: () => Promise<{ privateKey: string; publicKey: string } | null>
      getSettings: () => Promise<AppSettings>
      saveSettings: (s: AppSettings) => Promise<{ success: boolean }>
      getVersion: () => Promise<string>
      openConfigDir: () => Promise<void>
      onNavigate: (cb: (route: string) => void) => () => void
    }
  }
}

export default function App() {
  const [route, setRoute] = useState<Route>('dashboard')
  const [tunnels, setTunnels] = useState<Tunnel[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [wgInstalled, setWgInstalled] = useState<{ wg: boolean; wgQuick: boolean } | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshTunnels = useCallback(async () => {
    const data = await window.api.getTunnelStatus()
    setTunnels(data)
  }, [])

  useEffect(() => {
    async function init() {
      const [installed, tunnelData, settingsData] = await Promise.all([
        window.api.checkInstalled(),
        window.api.getTunnelStatus(),
        window.api.getSettings()
      ])
      setWgInstalled(installed)
      setTunnels(tunnelData)
      setSettings(settingsData)
      setLoading(false)
    }
    init()

    // Listen for tray navigation
    const cleanup = window.api.onNavigate((r) => {
      if (r === 'tunnels' || r === 'settings' || r === 'dashboard') {
        setRoute(r as Route)
      }
    })

    // Refresh tunnel status every 5 seconds
    const interval = setInterval(refreshTunnels, 5000)

    return () => {
      cleanup()
      clearInterval(interval)
    }
  }, [refreshTunnels])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-bg-primary">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
          <p className="text-text-secondary text-sm">Starting ODN Connect...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full bg-bg-primary overflow-hidden">
      <Sidebar
        route={route}
        onNavigate={setRoute}
        tunnels={tunnels}
      />
      <main className="flex-1 overflow-hidden">
        {route === 'dashboard' && (
          <Dashboard
            tunnels={tunnels}
            wgInstalled={wgInstalled}
            onNavigate={setRoute}
            onConnect={async (id) => {
              await window.api.connectTunnel(id)
              refreshTunnels()
            }}
            onDisconnect={async (id) => {
              await window.api.disconnectTunnel(id)
              refreshTunnels()
            }}
          />
        )}
        {route === 'tunnels' && (
          <Tunnels
            tunnels={tunnels}
            onRefresh={refreshTunnels}
          />
        )}
        {route === 'settings' && settings && (
          <Settings
            settings={settings}
            onSave={async (s) => {
              await window.api.saveSettings(s)
              setSettings(s)
            }}
          />
        )}
      </main>
    </div>
  )
}
