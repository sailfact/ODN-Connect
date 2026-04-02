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
 * Returns the path to the service script.
 * Both dev and production use server.js — the service runs via Node.js
 * (or Electron with ELECTRON_RUN_AS_NODE=1 in production).
 */
export function getServiceBinaryPath(): string {
  const isDev = !process.resourcesPath || process.resourcesPath.includes('node_modules')

  if (isDev) {
    return path.join(process.cwd(), 'out', 'service', 'server.js')
  }

  // Production: bundled in app resources
  return path.join(process.resourcesPath, 'service', 'server.js')
}

/**
 * Returns the path to the runtime binary for running the service script.
 * In dev, this is the Node.js binary. In production, this is the Electron
 * binary (used with ELECTRON_RUN_AS_NODE=1 to act as plain Node.js).
 */
function getNodePath(): string {
  return process.execPath
}

/** Whether we're running in a packaged (production) Electron app. */
function isProduction(): boolean {
  return !!process.resourcesPath && !process.resourcesPath.includes('node_modules')
}

// ─── Windows ─────────────────────────────────────────────────────────────────

async function installWindows(): Promise<void> {
  const binPath = getServiceBinaryPath()
  const nodePath = getNodePath()

  // In production, we use a wrapper script that sets ELECTRON_RUN_AS_NODE=1
  // so the Electron binary acts as plain Node.js for the service.
  if (isProduction()) {
    const wrapperPath = path.join(process.resourcesPath, 'service-wrapper.cmd')
    const wrapperContent = `@echo off\r\nset ELECTRON_RUN_AS_NODE=1\r\n"${nodePath}" "${binPath}"\r\n`
    fs.writeFileSync(wrapperPath, wrapperContent)

    await execAsync(
      `sc create ${SERVICE_NAME} binPath= "${wrapperPath}" start= auto DisplayName= "${SERVICE_DISPLAY_NAME}"`
    )
  } else {
    // Dev mode: use node directly
    await execAsync(
      `sc create ${SERVICE_NAME} binPath= "${nodePath}" "${binPath}" start= auto DisplayName= "${SERVICE_DISPLAY_NAME}"`
    )
  }

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
  const nodePath = getNodePath()
  const plistPath = getLaunchdPlistPath()

  // In production, set ELECTRON_RUN_AS_NODE=1 so Electron acts as Node.js
  const envSection = isProduction()
    ? `    <key>EnvironmentVariables</key>
    <dict>
        <key>ELECTRON_RUN_AS_NODE</key>
        <string>1</string>
    </dict>`
    : ''

  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.odn.tunnel-service</string>
    <key>ProgramArguments</key>
    <array>
      <string>${nodePath}</string>
      <string>${binPath}</string>
    </array>
${envSection}
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
  const nodePath = getNodePath()

  // In production, set ELECTRON_RUN_AS_NODE=1 so Electron acts as Node.js
  const envLine = isProduction() ? 'Environment=ELECTRON_RUN_AS_NODE=1' : ''

  const unit = `[Unit]
Description=${SERVICE_DESCRIPTION}
After=network.target

[Service]
Type=simple
ExecStart=${nodePath} ${binPath}
${envLine}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
`

  const tmpUnit = path.join(os.tmpdir(), 'odn-tunnel-service.service')
  fs.writeFileSync(tmpUnit, unit)

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
