/**
 * Install / uninstall the ODN Tunnel Service as an OS-managed daemon.
 *
 * The service (`out/service/server.js`) must run elevated — as SYSTEM on
 * Windows, root on Linux/macOS — so it can drive `wireguard.exe` / `wg-quick`.
 * Registration therefore requires a one-time privilege escalation, which we
 * trigger with each platform's native GUI elevation prompt:
 *   - Windows: PowerShell `Start-Process -Verb RunAs` (UAC)
 *   - macOS:   `osascript … with administrator privileges`
 *   - Linux:   `pkexec` (PolicyKit)
 *
 * The daemon is launched through the Electron binary with
 * `ELECTRON_RUN_AS_NODE=1`, so no separate Node runtime needs to ship.
 */

import { app } from 'electron'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

const execFileAsync = promisify(execFile)
const platform = process.platform

const WINDOWS_SERVICE_NAME = 'ODNTunnelService'
const WINDOWS_DISPLAY_NAME = 'ODN Tunnel Service'
const LINUX_UNIT_NAME = 'odn-tunnel-service'
const LINUX_UNIT_PATH = `/etc/systemd/system/${LINUX_UNIT_NAME}.service`
const MACOS_LABEL = 'com.odn.tunnelservice'
const MACOS_PLIST_PATH = `/Library/LaunchDaemons/${MACOS_LABEL}.plist`

type Result = { success: boolean; error?: string }

// ─── Path resolution ───────────────────────────────────────────────────────────

/**
 * Locate the bundled service entry point. In a packaged app the service is
 * unpacked from the asar (it spawns child processes); in development it lives
 * in the build output directory.
 */
function resolveServiceScript(): string {
  const candidates = [
    process.resourcesPath &&
      path.join(process.resourcesPath, 'app.asar.unpacked', 'out', 'service', 'server.js'),
    process.resourcesPath && path.join(process.resourcesPath, 'out', 'service', 'server.js'),
    path.join(app.getAppPath(), 'out', 'service', 'server.js')
  ].filter(Boolean) as string[]

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate
  }
  // Fall back to the dev path; install will surface a clear error if it's missing.
  return path.join(app.getAppPath(), 'out', 'service', 'server.js')
}

/** The Electron binary, run with ELECTRON_RUN_AS_NODE=1 to behave as plain Node. */
function resolveRuntime(): string {
  return process.execPath
}

// ─── Elevation ─────────────────────────────────────────────────────────────────

/**
 * Run a shell script elevated via the platform's native GUI prompt.
 * Resolves with the child's stdout; rejects (non-zero exit / cancelled prompt)
 * are surfaced to the caller as a failed Result.
 */
async function runElevated(scriptBody: string, promptName: string): Promise<void> {
  if (platform === 'win32') {
    // Write the batch commands to a temp file and elevate it with UAC.
    const cmdFile = path.join(os.tmpdir(), `odn-svc-${Date.now()}.cmd`)
    fs.writeFileSync(cmdFile, `@echo off\r\n${scriptBody}\r\n`, 'utf-8')
    try {
      await execFileAsync('powershell.exe', [
        '-NoProfile',
        '-Command',
        `$p = Start-Process -FilePath '${cmdFile}' -Verb RunAs -WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode`
      ])
    } finally {
      try {
        fs.unlinkSync(cmdFile)
      } catch {
        /* best effort */
      }
    }
    return
  }

  if (platform === 'darwin') {
    // osascript escapes embedded quotes/backslashes for the AppleScript string.
    const escaped = scriptBody.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
    await execFileAsync('osascript', [
      '-e',
      `do shell script "${escaped}" with administrator privileges with prompt "${promptName}"`
    ])
    return
  }

  // Linux: hand the script to pkexec via a temp file so PolicyKit can prompt.
  const shFile = path.join(os.tmpdir(), `odn-svc-${Date.now()}.sh`)
  fs.writeFileSync(shFile, `#!/bin/bash\nset -e\n${scriptBody}\n`, { mode: 0o700 })
  try {
    await execFileAsync('pkexec', ['bash', shFile])
  } finally {
    try {
      fs.unlinkSync(shFile)
    } catch {
      /* best effort */
    }
  }
}

// ─── Install ───────────────────────────────────────────────────────────────────

export async function installService(): Promise<Result> {
  const script = resolveServiceScript()
  const runtime = resolveRuntime()

  if (!fs.existsSync(script)) {
    return { success: false, error: `Service bundle not found at ${script} — run the build first` }
  }

  try {
    if (platform === 'win32') {
      // `Environment` (REG_MULTI_SZ) under the service key supplies the env var
      // to the SCM-launched process, since `sc create` can't set env directly.
      const regKey = `HKLM\\SYSTEM\\CurrentControlSet\\Services\\${WINDOWS_SERVICE_NAME}`
      const body = [
        `sc create ${WINDOWS_SERVICE_NAME} binPath= "\\"${runtime}\\" \\"${script}\\"" start= auto DisplayName= "${WINDOWS_DISPLAY_NAME}"`,
        `reg add "${regKey}" /v Environment /t REG_MULTI_SZ /d "ELECTRON_RUN_AS_NODE=1" /f`,
        `sc start ${WINDOWS_SERVICE_NAME}`
      ].join('\r\n')
      await runElevated(body, WINDOWS_DISPLAY_NAME)
    } else if (platform === 'darwin') {
      const plist = buildLaunchdPlist(runtime, script)
      const tmpPlist = path.join(os.tmpdir(), `odn-svc-${Date.now()}.plist`)
      fs.writeFileSync(tmpPlist, plist, 'utf-8')
      const body = [
        `cp '${tmpPlist}' '${MACOS_PLIST_PATH}'`,
        `chown root:wheel '${MACOS_PLIST_PATH}'`,
        `chmod 644 '${MACOS_PLIST_PATH}'`,
        `launchctl load -w '${MACOS_PLIST_PATH}'`
      ].join(' && ')
      try {
        await runElevated(body, 'ODN Tunnel Service')
      } finally {
        try {
          fs.unlinkSync(tmpPlist)
        } catch {
          /* best effort */
        }
      }
    } else {
      const unit = buildSystemdUnit(runtime, script)
      // Heredoc writes the unit file as root, then enable + start it.
      const body = [
        `cat > '${LINUX_UNIT_PATH}' <<'ODN_UNIT_EOF'\n${unit}\nODN_UNIT_EOF`,
        `systemctl daemon-reload`,
        `systemctl enable --now ${LINUX_UNIT_NAME}.service`
      ].join('\n')
      await runElevated(body, 'ODN Tunnel Service')
    }

    return { success: true }
  } catch (err) {
    return { success: false, error: elevationError(err) }
  }
}

// ─── Uninstall ─────────────────────────────────────────────────────────────────

export async function uninstallService(): Promise<Result> {
  try {
    if (platform === 'win32') {
      const body = [`sc stop ${WINDOWS_SERVICE_NAME}`, `sc delete ${WINDOWS_SERVICE_NAME}`].join(
        '\r\n'
      )
      await runElevated(body, WINDOWS_DISPLAY_NAME)
    } else if (platform === 'darwin') {
      const body = [
        `launchctl unload -w '${MACOS_PLIST_PATH}' 2>/dev/null || true`,
        `rm -f '${MACOS_PLIST_PATH}'`
      ].join(' && ')
      await runElevated(body, 'ODN Tunnel Service')
    } else {
      const body = [
        `systemctl disable --now ${LINUX_UNIT_NAME}.service 2>/dev/null || true`,
        `rm -f '${LINUX_UNIT_PATH}'`,
        `systemctl daemon-reload`
      ].join('\n')
      await runElevated(body, 'ODN Tunnel Service')
    }
    return { success: true }
  } catch (err) {
    return { success: false, error: elevationError(err) }
  }
}

// ─── Installed check ───────────────────────────────────────────────────────────

/** Whether the service is registered with the OS. Does not require elevation. */
export async function isServiceInstalled(): Promise<boolean> {
  try {
    if (platform === 'win32') {
      // `sc query` exits non-zero (1060) when the service does not exist.
      await execFileAsync('sc', ['query', WINDOWS_SERVICE_NAME])
      return true
    }
    if (platform === 'darwin') {
      return fs.existsSync(MACOS_PLIST_PATH)
    }
    return fs.existsSync(LINUX_UNIT_PATH)
  } catch {
    return false
  }
}

// ─── Service definition templates ──────────────────────────────────────────────

function buildSystemdUnit(runtime: string, script: string): string {
  return `[Unit]
Description=ODN Tunnel Service
After=network.target

[Service]
Type=simple
Environment=ELECTRON_RUN_AS_NODE=1
ExecStart=${runtime} ${script}
Restart=on-failure
User=root

[Install]
WantedBy=multi-user.target`
}

function buildLaunchdPlist(runtime: string, script: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${MACOS_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${runtime}</string>
    <string>${script}</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>ELECTRON_RUN_AS_NODE</key>
    <string>1</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
</dict>
</plist>`
}

/** A cancelled elevation prompt or non-zero exit lands here — give a usable message. */
function elevationError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err)
  if (/cancel|denied|not authorized|1223|126|127/i.test(msg)) {
    return 'Installation was cancelled or elevation was denied'
  }
  return msg
}
