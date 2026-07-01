/**
 * Parser for `wg show all dump` output. Shared by the main process and the
 * elevated service daemon so the tab-delimited format lives in one place.
 */

import type { WireGuardInterface, WireGuardPeer } from '../main/types'

/** Parse `wg show all dump` (tab-delimited) into structured interfaces. */
export function parseWgDump(output: string): WireGuardInterface[] {
  const trimmed = output.trim()
  if (!trimmed) return []

  const interfaces = new Map<string, WireGuardInterface>()

  for (const line of trimmed.split('\n')) {
    const parts = line.split('\t')
    if (parts.length === 5) {
      const [name, , publicKey, listenPort] = parts
      interfaces.set(name, {
        name,
        publicKey,
        listenPort: listenPort !== 'off' ? parseInt(listenPort) : undefined,
        peers: []
      })
    } else if (parts.length === 9) {
      const [iface, pubkey, preshared, endpoint, allowedIPs, latestHandshake, rx, tx, keepalive] = parts
      const ifc = interfaces.get(iface)
      if (ifc) {
        const peer: WireGuardPeer = {
          publicKey: pubkey,
          presharedKey: preshared !== '(none)' ? preshared : undefined,
          endpoint: endpoint !== '(none)' ? endpoint : undefined,
          allowedIPs: allowedIPs.split(',').map((s) => s.trim()),
          latestHandshake: latestHandshake !== '0' ? parseInt(latestHandshake) : undefined,
          rxBytes: parseInt(rx) || 0,
          txBytes: parseInt(tx) || 0,
          persistentKeepalive: keepalive !== 'off' ? parseInt(keepalive) : undefined
        }
        ifc.peers.push(peer)
      }
    }
  }

  return Array.from(interfaces.values())
}
