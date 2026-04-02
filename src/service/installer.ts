/**
 * Service installer — registers the ODN Tunnel Service on each platform.
 *
 * This module is called from the Electron main process when the user clicks
 * "Install Service" in the UI. It requires a one-time elevation prompt
 * (UAC on Windows, password on macOS/Linux).
 */

import { exec } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

const execAsync = promisify(exec)
const platform = process.platform

/** Name of the Windows service / systemd unit / launchd label. */
const SERVICE_NAME = 'OdnTunnelService'
const SERVICE_DISPLAY_NAME = 'ODN Tunnel Service'
const SERVICE_DESCRIPTION = 'Manages WireGuard tunnel connections for ODN Connect'

/**
 * Returns the path to the service binary.
 * In production, it's bundled alongside the Electron app.
 * In development, it's in the project's out directory.
 */
export function getServiceBinaryPath(): string {
  const isDev = !process.resourcesPath || process.resourcesPath.includes('node_modules')

  if (isDev) {
    // Development: use the compiled service in the out directory
    return path.join(process.cwd(), 'out', 'service', 'server.js')
  }

  // Production: bundled in app resources
  if (platform === 'win32') {
    return path.join(process.resourcesPath, 'service', 'odn-tunnel-service.exe')
  }
  return path.join(process.resourcesPath, 'service', 'odn-tunnel-service')
}

/**
 * Returns the path to the Node.js binary for running the service script in dev mode.
 */
function getNodePath(): string {
  return process.execPath
}

// ─── Windows ─────────────────────────────────────────────────────────────────

async function installWindows(): Promise<void> {
  const binPath = getServiceBinaryPath()
  const isScript = binPath.endsWith('.js')

  // Build the command the service will run
  const binPathCmd = isScript
    ? `"${getNodePath()}" "${binPath}"`
    : `"${binPath}"`

  // Create the service using sc.exe (runs with the current elevation)
  await execAsync(
    `sc create ${SERVICE_NAME} binPath= ${binPathCmd} start= auto DisplayName= "${SERVICE_DISPLAY_NAME}"`
  )
  await execAsync(`sc description ${SERVICE_NAME} "${SERVICE_DESCRIPTION}"`)
  await execAsync(`sc start ${SERVICE_NAME}`)
}

async function uninstallWindows(): Promise<void> {
  try { await execAsync(`sc stop ${SERVICE_NAME}`) } catch { /* may already be stopped */ }
  await execAsync(`sc delete ${SERVICE_NAME}`)
}

async function isInstalledWindows(): Promise<boolean> {
  try {
    await execAsync(`sc query ${SERVICE_NAME}`)
    return true
  } catch {
    return false
  }
}

// ─── macOS (launchd) ─────────────────────────────────────────────────────────

function getLaunchdPlistPath(): string {
  return `/Library/LaunchDaemons/com.odn.tunnel-service.plist`
}

async function installMacOS(): Promise<void> {
  const binPath = getServiceBinaryPath()
  const isScript = binPath.endsWith('.js')
  const plistPath = getLaunchdPlistPath()

  const programArgs = isScript
    ? `    <array>\n      <string>${getNodePath()}</string>\n      <string>${binPath}</string>\n    </array>`
    : `    <array>\n      <string>${binPath}</string>\n    </array>`

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.odn.tunnel-service</string>
    <key>ProgramArguments</key>
${programArgs}
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/var/log/odn-tunnel-service.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/odn-tunnel-service.log</string>
</dict>
</plist>`

  // Write plist and load (requires sudo — will prompt via osascript)
  const tmpPlist = path.join(os.tmpdir(), 'com.odn.tunnel-service.plist')
  fs.writeFileSync(tmpPlist, plist)

  await execAsync(
    `osascript -e 'do shell script "cp ${tmpPlist} ${plistPath} && launchctl load -w ${plistPath}" with administrator privileges'`
  )
  fs.unlinkSync(tmpPlist)
}

async function uninstallMacOS(): Promise<void> {
  const plistPath = getLaunchdPlistPath()
  await execAsync(
    `osascript -e 'do shell script "launchctl unload -w ${plistPath} && rm -f ${plistPath}" with administrator privileges'`
  )
}

async function isInstalledMacOS(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('launchctl list com.odn.tunnel-service')
    return stdout.includes('com.odn.tunnel-service')
  } catch {
    return false
  }
}

// ─── Linux (systemd) ─────────────────────────────────────────────────────────

const SYSTEMD_UNIT_PATH = '/etc/systemd/system/odn-tunnel-service.service'

async function installLinux(): Promise<void> {
  const binPath = getServiceBinaryPath()
  const isScript = binPath.endsWith('.js')

  const execStart = isScript
    ? `${getNodePath()} ${binPath}`
    : binPath

  const unit = `[Unit]
Description=${SERVICE_DESCRIPTION}
After=network.target

[Service]
Type=simple
ExecStart=${execStart}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`

  const tmpUnit = path.join(os.tmpdir(), 'odn-tunnel-service.service')
  fs.writeFileSync(tmpUnit, unit)

  // pkexec provides a graphical privilege prompt on Linux
  await execAsync(
    `pkexec sh -c "cp ${tmpUnit} ${SYSTEMD_UNIT_PATH} && systemctl daemon-reload && systemctl enable --now odn-tunnel-service"`
  )
  fs.unlinkSync(tmpUnit)
}

async function uninstallLinux(): Promise<void> {
  await execAsync(
    `pkexec sh -c "systemctl disable --now odn-tunnel-service && rm -f ${SYSTEMD_UNIT_PATH} && systemctl daemon-reload"`
  )
}

async function isInstalledLinux(): Promise<boolean> {
  try {
    const { stdout } = await execAsync('systemctl is-enabled odn-tunnel-service')
    return stdout.trim() === 'enabled'
  } catch {
    return false
  }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/** Install and start the tunnel service. Prompts for elevation once. */
export async function installService(): Promise<{ success: boolean; error?: string }> {
  try {
    switch (platform) {
      case 'win32': await installWindows(); break
      case 'darwin': await installMacOS(); break
      default: await installLinux(); break
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Stop and remove the tunnel service. */
export async function uninstallService(): Promise<{ success: boolean; error?: string }> {
  try {
    switch (platform) {
      case 'win32': await uninstallWindows(); break
      case 'darwin': await uninstallMacOS(); break
      default: await uninstallLinux(); break
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

/** Check if the tunnel service is installed on this system. */
export async function isServiceInstalled(): Promise<boolean> {
  switch (platform) {
    case 'win32': return isInstalledWindows()
    case 'darwin': return isInstalledMacOS()
    default: return isInstalledLinux()
  }
}
