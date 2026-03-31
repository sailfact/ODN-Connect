import { app, BrowserWindow, ipcMain, dialog, shell, Notification } from 'electron'
import { join } from 'path'
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
  formatHandshake
} from './wireguard'
import { getTunnels, saveTunnel, deleteTunnel, getSettings, saveSettings, updateTunnelConnected } from './store'
import type { Tunnel, AppSettings } from './types'
import * as path from 'path'
import * as crypto from 'crypto'

let mainWindow: BrowserWindow | null = null

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
      preload: join(__dirname, '../preload/index.js'),
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

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return mainWindow
}

// ─── IPC Handlers ────────────────────────────────────────────────────────────

ipcMain.handle('wg:installed', () => {
  return isWireGuardInstalled()
})

ipcMain.handle('tunnels:list', () => {
  const tunnels = getTunnels()
  const active = getActiveInterfaces()
  return tunnels.map((t) => ({ ...t, connected: active.includes(t.name) }))
})

ipcMain.handle('tunnels:status', () => {
  const status = getWireGuardStatus()
  const tunnels = getTunnels()
  const active = getActiveInterfaces()

  // Merge wg stats into tunnel data
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

ipcMain.handle('tunnels:connect', async (_, tunnelId: string) => {
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
})

ipcMain.handle('tunnels:disconnect', async (_, tunnelId: string) => {
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
})

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

ipcMain.handle('tunnels:delete', async (_, tunnelId: string) => {
  const tunnels = getTunnels()
  const tunnel = tunnels.find((t) => t.id === tunnelId)
  if (!tunnel) return { success: false, error: 'Tunnel not found' }

  // Disconnect first if connected
  const active = getActiveInterfaces()
  if (active.includes(tunnel.name)) {
    await disconnectTunnel(tunnel.name)
  }

  deleteConfigFile(tunnel.configPath)
  deleteTunnel(tunnelId)
  mainWindow && updateTrayMenu(mainWindow)
  return { success: true }
})

ipcMain.handle('tunnels:generate-keys', () => {
  return generateKeyPair()
})

ipcMain.handle('settings:get', () => {
  return getSettings()
})

ipcMain.handle('settings:save', (_, settings: AppSettings) => {
  saveSettings(settings)
  app.setLoginItemSettings({ openAtLogin: settings.launchAtStartup })
  return { success: true }
})

ipcMain.handle('app:version', () => {
  return app.getVersion()
})

ipcMain.handle('app:open-config-dir', () => {
  const dir = path.join(app.getPath('home'), '.config', 'odn-client', 'tunnels')
  shell.openPath(dir)
})

// ─── App Lifecycle ────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  electronApp.setAppUserModelId('com.odn.client')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

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
