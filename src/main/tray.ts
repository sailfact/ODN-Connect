/**
 * System tray integration for ODN Connect.
 *
 * Displays a small circle icon in the system tray that reflects connection status:
 * - Green circle: at least one tunnel is connected
 * - Grey circle: no tunnels connected
 *
 * The tray context menu shows all tunnels, their status, and quick-access links.
 * Left-clicking the tray icon toggles window visibility.
 * The menu auto-refreshes every 5 seconds to stay in sync with WireGuard state.
 */

import { app, Tray, Menu, nativeImage, BrowserWindow } from 'electron'
import * as path from 'path'
import { getActiveInterfaces } from './wireguard'
import { getTunnels } from './store'

let tray: Tray | null = null

/**
 * Generates a 16x16 circle icon as a NativeImage using raw RGBA pixel data.
 * Green when connected, grey when disconnected.
 */
function createIcon(connected: boolean): Electron.NativeImage {
  const size = 16
  const buf = Buffer.alloc(size * size * 4)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4
      const cx = size / 2 - 0.5
      const cy = size / 2 - 0.5
      const dist = Math.sqrt((x - cx) ** 2 + (y - cy) ** 2)

      if (dist <= size / 2 - 1) {
        if (connected) {
          buf[idx] = 34   // R (green)
          buf[idx + 1] = 197 // G
          buf[idx + 2] = 94  // B
        } else {
          buf[idx] = 100  // R (grey)
          buf[idx + 1] = 116 // G
          buf[idx + 2] = 139 // B
        }
        buf[idx + 3] = 255 // A
      } else {
        buf[idx + 3] = 0 // transparent
      }
    }
  }

  return nativeImage.createFromBuffer(buf, { width: size, height: size })
}

/** Creates the system tray icon, sets up click behavior, and starts a 5-second refresh loop. */
export function createTray(mainWindow: BrowserWindow): Tray {
  const activeInterfaces = getActiveInterfaces()
  const connected = activeInterfaces.length > 0

  tray = new Tray(createIcon(connected))
  tray.setToolTip('ODN Client')

  updateTrayMenu(mainWindow)

  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  // Refresh every 5s
  setInterval(() => updateTrayMenu(mainWindow), 5000)

  return tray
}

/** Rebuilds the tray context menu with current tunnel status and connection state. */
export function updateTrayMenu(mainWindow: BrowserWindow): void {
  if (!tray) return

  const activeInterfaces = getActiveInterfaces()
  const connected = activeInterfaces.length > 0
  const tunnels = getTunnels()

  tray.setImage(createIcon(connected))

  const statusLabel = connected
    ? `Connected (${activeInterfaces.join(', ')})`
    : 'Not connected'

  const tunnelMenuItems: Electron.MenuItemConstructorOptions[] = tunnels.map((t) => {
    const isActive = activeInterfaces.includes(t.name)
    return {
      label: `${isActive ? '● ' : '○ '}${t.name}`,
      enabled: true,
      click: () => {
        mainWindow.show()
        mainWindow.focus()
        mainWindow.webContents.send('navigate', 'tunnels')
      }
    }
  })

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'ODN Client',
      enabled: false
    },
    { type: 'separator' },
    {
      label: statusLabel,
      enabled: false
    },
    { type: 'separator' },
    ...(tunnelMenuItems.length > 0
      ? [...tunnelMenuItems, { type: 'separator' as const }]
      : []),
    {
      label: 'Open ODN Client',
      click: () => {
        mainWindow.show()
        mainWindow.focus()
      }
    },
    {
      label: 'Settings',
      click: () => {
        mainWindow.show()
        mainWindow.focus()
        mainWindow.webContents.send('navigate', 'settings')
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)
}
