/**
 * Root application component.
 *
 * Manages top-level state (current route, tunnels, settings) and orchestrates
 * communication with the main process via `window.api`. Tunnel status is polled
 * every 5 seconds to keep the UI in sync with WireGuard's live state.
 */

import { useState, useEffect, useCallback } from 'react'
import Sidebar from './components/Sidebar'
import Dashboard from './components/Dashboard'
import Tunnels from './components/Tunnels'
import Settings from './components/Settings'
import type { Route, Tunnel, AppSettings, ServiceStatus } from './types'

/** Global type declaration for the IPC API exposed by the preload script. */
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
      getServiceStatus: () => Promise<ServiceStatus>
      installService: () => Promise<{ success: boolean; error?: string }>
    }
  }
}

export default function App() {
  const [route, setRoute] = useState<Route>('dashboard')
  const [tunnels, setTunnels] = useState<Tunnel[]>([])
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [wgInstalled, setWgInstalled] = useState<{ wg: boolean; wgQuick: boolean } | null>(null)
  const [serviceStatus, setServiceStatus] = useState<ServiceStatus | null>(null)
  const [loading, setLoading] = useState(true)

  const refreshTunnels = useCallback(async () => {
    const data = await window.api.getTunnelStatus()
    setTunnels(data)
  }, [])

  useEffect(() => {
    async function init() {
      const [installed, tunnelData, settingsData, svcStatus] = await Promise.all([
        window.api.checkInstalled(),
        window.api.getTunnelStatus(),
        window.api.getSettings(),
        window.api.getServiceStatus()
      ])
      setWgInstalled(installed)
      setTunnels(tunnelData)
      setSettings(settingsData)
      setServiceStatus(svcStatus)
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

    // Refresh service status every 30 seconds
    const serviceInterval = setInterval(async () => {
      const svcStatus = await window.api.getServiceStatus()
      setServiceStatus(svcStatus)
    }, 30_000)

    return () => {
      cleanup()
      clearInterval(interval)
      clearInterval(serviceInterval)
    }
  }, [refreshTunnels])

  // Apply theme to the document based on settings
  useEffect(() => {
    if (!settings) return

    type NamedTheme = 'midnight' | 'arctic-light' | 'slate-dusk' | 'nord-frost'
    const applyTheme = (theme: NamedTheme) => {
      document.documentElement.setAttribute('data-theme', theme)
    }

    if (settings.theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      applyTheme(mq.matches ? 'midnight' : 'arctic-light')
      const handler = (e: MediaQueryListEvent) => applyTheme(e.matches ? 'midnight' : 'arctic-light')
      mq.addEventListener('change', handler)
      return () => mq.removeEventListener('change', handler)
    } else {
      applyTheme(settings.theme)
    }
  }, [settings?.theme])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full bg-bg-primary">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-accent-blue border-t-transparent rounded-full animate-spin" />
          <p className="text-text-secondary text-sm">Starting ODN Client...</p>
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
            serviceStatus={serviceStatus}
            onNavigate={setRoute}
            onConnect={async (id) => {
              await window.api.connectTunnel(id)
              refreshTunnels()
            }}
            onDisconnect={async (id) => {
              await window.api.disconnectTunnel(id)
              refreshTunnels()
            }}
            onInstallService={async () => {
              const result = await window.api.installService()
              if (result.success) {
                setServiceStatus({ connected: true, installed: true })
              }
              return result
            }}
            onRefreshServiceStatus={async () => {
              const svcStatus = await window.api.getServiceStatus()
              setServiceStatus(svcStatus)
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
