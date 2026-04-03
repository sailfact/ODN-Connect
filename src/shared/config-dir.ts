/**
 * Shared utility for resolving the tunnel config directory path.
 *
 * Used by both the Electron main process (wireguard.ts) and the
 * elevated service daemon (service/server.ts) to ensure they always
 * agree on where config files are stored.
 */

import * as path from 'path'
import * as os from 'os'

/**
 * Returns the OS-specific path to the tunnel config directory.
 * Does NOT create the directory — callers are responsible for that if needed.
 */
export function getConfigDirPath(): string {
  const platform = process.platform
  let baseDir: string
  if (platform === 'win32') {
    baseDir = path.join(os.homedir(), 'AppData', 'Roaming')
  } else if (platform === 'darwin') {
    baseDir = path.join(os.homedir(), 'Library', 'Application Support')
  } else {
    baseDir = path.join(os.homedir(), '.config')
  }
  return path.join(baseDir, 'odn-client', 'tunnels')
}
