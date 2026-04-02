/**
 * Main process entry point for ODN Connect.
 *
 * Responsibilities:
 * - Create and manage the BrowserWindow
 * - Register IPC handlers that bridge the renderer to WireGuard CLI operations
 * - Manage app lifecycle (tray, single-instance, close-to-tray)
 * - Initialize the tunnel service client for non-elevated operation
 */

import { app, BrowserWindow, ipcMain, dialog, shell, Notification } from 'electron'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import { createTray, updateTrayMenu } from './tray'
import {
  connectTunnel,
  disconnectTunnel,
  getActiveInterfaces,
  getWireGuardStatus,
  parseTunnelConfig,
  importConfigFile,
  deleteConfigFile,
  generateKeyPair,
  isWireGuardInstalled,
  formatBytes,
  formatHandshake,
  getConfigDir,
  initServiceClient,
  isServiceConnected
} from './wireguard'
import { getTunnels, saveTunnel, deleteTunnel, getSettings, saveSettings, updateTunnelConnected } from './store'
import { installService, uninstallService, isServiceInstalled } from '../service/installer'
import type { Tunnel, AppSettings } from './types'
import * as path from 'node:path'
import * as crypto from 'node:crypto'

/** Singleton reference to the main application window. */
let mainWindow: BrowserWindow | null = null

/**
 * Creates the main application window with context-isolated preload script.
 * The window starts hidden and shows itself once content is ready to avoid a white flash.
 * If "minimize to tray" is enabled, closing the window hides it instead of quitting.
 */
function createWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 680,
    minWidth: 800,
    minHeight: 560,
    show: false,
    frame: true,
    titleBarStyle: 'default',
    backgroundColor: '#0f1117',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow!.show()
  })

  mainWindow.on('close', (e) => {
    const settings = getSettings()
    if (settings.minimizeToTray) {
      e.preventDefault()
      mainWindow!.hide()
    }
  })

  // Open external links in the default browser instead of a new Electron window
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

/** Check whether WireGuard binaries (wg.exe, wireguard.exe) are present on disk. */
ipcMain.handle('wg:installed', () => {
  return isWireGuardInstalled()
})

/** Return all stored tunnels with their live connection status from WireGuard. */
ipcMain.handle('tunnels:list', async () => {
  const tunnels = getTunnels()
  const active = await getActiveInterfaces()
  return tunnels.map((t) => ({ ...t, connected: active.includes(t.name) }))
})

/**
 * Return tunnels enriched with live WireGuard stats (peer transfer, handshake times).
 * This is polled every 5 seconds from the renderer to keep the UI current.
 */
ipcMain.handle('tunnels:status', async () => {
  const status = await getWireGuardStatus()
  const tunnels = getTunnels()
  const active = await getActiveInterfaces()

  // Merge live wg peer stats into stored tunnel data
  return tunnels.map((tunnel) => {
    const ifc = status.interfaces.find((i) => i.name === tunnel.name)
    return {
      ...tunnel,
      connected: active.includes(tunnel.name),
      peers: ifc ? ifc.peers.map((p) => ({
        ...p,
        rxFormatted: formatBytes(p.rxBytes || 0),
        txFormatted: formatBytes(p.txBytes || 0),
        handshakeFormatted: formatHandshake(p.latestHandshake)
      })) : tunnel.peers
    }
  })
})

/** Install a WireGuard tunnel as a Windows service and notify the user on success. */
ipcMain.handle('tunnels:connect', async (_, tunnelId: string) => {
  try {
    const tunnels = getTunnels()
    const tunnel = tunnels.find((t) => t.id === tunnelId)
    if (!tunnel) return { success: false, error: 'Tunnel not found' }

    const result = await connectTunnel(tunnel.configPath)
    if (result.success) {
      updateTunnelConnected(tunnelId, true)
      mainWindow && updateTrayMenu(mainWindow)
      const settings = getSettings()
      if (settings.showNotifications) {
        new Notification({
          title: 'ODN Client',
          body: `Connected to ${tunnel.name}`
        }).show()
      }
    }
    return result
  } catch (err) {
    console.error('Failed to connect tunnel:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
})

/** Uninstall a WireGuard tunnel service and notify the user on success. */
ipcMain.handle('tunnels:disconnect', async (_, tunnelId: string) => {
  try {
    const tunnels = getTunnels()
    const tunnel = tunnels.find((t) => t.id === tunnelId)
    if (!tunnel) return { success: false, error: 'Tunnel not found' }

    const result = await disconnectTunnel(tunnel.name)
    if (result.success) {
      updateTunnelConnected(tunnelId, false)
      mainWindow && updateTrayMenu(mainWindow)
      const settings = getSettings()
      if (settings.showNotifications) {
        new Notification({
          title: 'ODN Client',
          body: `Disconnected from ${tunnel.name}`
        }).show()
      }
    }
    return result
  } catch (err) {
    console.error('Failed to disconnect tunnel:', err)
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' }
  }
})

/**
 * Open a file dialog for the user to pick a WireGuard .conf file.
 * The config is copied into the app's data directory, parsed, and saved to the store.
 */
ipcMain.handle('tunnels:import', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    title: 'Import WireGuard Config',
    filters: [{ name: 'WireGuard Config', extensions: ['conf'] }],
    properties: ['openFile']
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, canceled: true }
  }

  const sourcePath = result.filePaths[0]
  const baseName = path.basename(sourcePath, '.conf')
  const tunnelName = baseName.replace(/[^a-zA-Z0-9_-]/g, '_')

  try {
    const configPath = importConfigFile(sourcePath, tunnelName)
    const parsed = parseTunnelConfig(configPath)

    const tunnel: Tunnel = {
      id: crypto.randomUUID(),
      name: tunnelName,
      configPath,
      address: parsed.address || [],
      dns: parsed.dns || [],
      listenPort: parsed.listenPort,
      peers: parsed.peers || [],
      connected: false,
      createdAt: Date.now()
    }

    saveTunnel(tunnel)
    return { success: true, tunnel }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
})

/** Disconnect a tunnel (if active), remove its config file, and delete it from the store. */
ipcMain.handle('tunnels:delete', async (_, tunnelId: string) => {
  const tunnels = getTunnels()
  const tunnel = tunnels.find((t) => t.id === tunnelId)
  if (!tunnel) return { success: false, error: 'Tunnel not found' }

  // Disconnect first if connected
  const active = await getActiveInterfaces()
  if (active.includes(tunnel.name)) {
    await disconnectTunnel(tunnel.name)
  }

  deleteConfigFile(tunnel.configPath)
  deleteTunnel(tunnelId)
  mainWindow && updateTrayMenu(mainWindow)
  return { success: true }
})

/** Generate a WireGuard key pair (private + public) via the wg CLI. */
ipcMain.handle('tunnels:generate-keys', () => {
  return generateKeyPair()
})

ipcMain.handle('settings:get', () => {
  return getSettings()
})

/** Persist settings and sync the OS login-item state with the launchAtStartup preference. */
ipcMain.handle('settings:save', (_, settings: AppSettings) => {
  saveSettings(settings)
  app.setLoginItemSettings({ openAtLogin: settings.launchAtStartup })
  return { success: true }
})

ipcMain.handle('app:version', () => {
  return app.getVersion()
})

/** Open the tunnel config directory in the OS file explorer. */
ipcMain.handle('app:open-config-dir', () => {
  shell.openPath(getConfigDir())
})

// ─── Service management IPC ──────────────────────────────────────────────────

/** Check if the tunnel service is running and reachable. */
ipcMain.handle('service:status', async () => {
  return {
    connected: isServiceConnected(),
    installed: await isServiceInstalled()
  }
})

/** Install the tunnel service (one-time, prompts for elevation). */
ipcMain.handle('service:install', async () => {
  const result = await installService()
  if (result.success) {
    // Try to connect to the newly installed service
    await initServiceClient()
  }
  return result
})

/** Uninstall the tunnel service. */
ipcMain.handle('service:uninstall', async () => {
  return uninstallService()
})

// ─── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.odn.client')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // Connect to the tunnel service before creating the window
  await initServiceClient()

  const win = createWindow()

  // System tray
  createTray(win)

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else {
      win.show()
    }
  })
})

app.on('window-all-closed', () => {
  const settings = getSettings()
  if (!settings.minimizeToTray) {
    app.quit()
  }
})
