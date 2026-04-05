# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

ODN Connect is a WireGuard desktop client built with Electron + React + TypeScript. It uses a two-process privilege model: the unprivileged Electron app communicates with an elevated system service (ODN Tunnel Service) that actually manages WireGuard tunnel lifecycle.

**Paired server**: This client is designed to work with the ODN VPN Server (see
`vpn-server/CLAUDE.md`). The server is the source of truth for peer configs,
user accounts, and handshake status. Local `.conf` files are treated as a
write-through cache — always fetched from the server, never manually edited.

## Commands

```bash
npm run dev          # Start in development mode (electron-vite dev)
npm run build        # Build Electron app + service bundle
npm run build:app    # Build Electron app only
npm run build:service # Bundle service/server.ts via esbuild → out/service/server.js
npm test             # Run tests (vitest run)
npm run test:watch   # Run tests in watch mode
npm run package:win  # Build Windows installer (NSIS)
npm run package:mac  # Build macOS DMG
npm run package:linux # Build Linux AppImage/deb
```

Run a single test file:
```bash
npx vitest run src/main/__tests__/wireguard.test.ts
```

## Architecture

### Two-process privilege model

The core design challenge is that WireGuard operations require elevation, but Electron apps should not run as admin:

1. **ODN Tunnel Service** (`src/service/server.ts`) — a standalone Node.js daemon that runs as SYSTEM (Windows) / root (Linux/macOS). It listens on a named pipe (`\\.\pipe\odn-tunnel-service`) or Unix socket (`/var/run/odn-tunnel-service.sock`) and executes `wireguard.exe` / `wg-quick` on behalf of the app.

2. **Electron main process** (`src/main/`) — runs unprivileged. Connects to the tunnel service via `TunnelServiceClient` (`src/service/client.ts`) using the JSON-over-newline protocol defined in `src/service/protocol.ts`. Falls back to direct execution if the service is unavailable and the process is already elevated (dev convenience only).

3. **Renderer** (`src/renderer/`) — React UI, no Node.js access. Communicates exclusively through `window.api` (exposed by the preload script via `contextBridge`).

### IPC flow

```
Renderer (window.api) → Preload (contextBridge) → Main (ipcMain.handle) → Service client → Tunnel Service daemon
```

All IPC channel names follow the pattern `domain:action` (e.g. `tunnels:connect`, `service:install`). The full `window.api` surface is defined in `src/preload/index.ts`.

### Key modules

| File | Purpose |
|---|---|
| `src/main/wireguard.ts` | WireGuard integration; delegates to service client or falls back to direct CLI |
| `src/main/store.ts` | Persistent storage via `electron-store` (tunnels + settings + server profile as JSON) |
| `src/main/tray.ts` | System tray icon and menu |
| `src/main/server-client.ts` | HTTP client for ODN VPN Server API (auth, peer sync, server-info) |
| `src/main/sync.ts` | Periodic config sync loop — polls server, writes .conf files, triggers re-connect if config changed |
| `src/service/server.ts` | Elevated daemon — handles `connect`, `disconnect`, `interfaces`, `status`, `ping` |
| `src/service/client.ts` | Client that connects to the daemon socket |
| `src/service/installer.ts` | Installs/uninstalls the service (Windows SC, macOS launchd, Linux systemd) |
| `src/service/protocol.ts` | Shared types (`ServiceRequest`, `ServiceResponse`) and pipe/socket path constants |
| `src/shared/config-dir.ts` | Single source of truth for config directory path — used by both main and service |

### Config file storage

Tunnel `.conf` files are stored in platform-specific locations resolved by `src/shared/config-dir.ts`:
- **Windows**: `%APPDATA%\odn-client\tunnels\`
- **macOS**: `~/Library/Application Support/odn-client/tunnels/`
- **Linux**: `~/.config/odn-client/tunnels/`

The service validates all config paths against this directory before executing any commands.

**Important**: when server sync is active, `.conf` files in this directory are
owned by the sync process. Manual edits will be overwritten on the next sync.
Offline/manual mode (no server configured) retains the original behaviour.

### Renderer state

`src/renderer/src/App.tsx` owns all top-level state. It polls `window.api.getTunnelStatus()` every 5 seconds and `window.api.getServiceStatus()` every 30 seconds. Child components (Dashboard, Tunnels, Settings, Sidebar) receive state and callbacks as props — no state management library is used.

### Build outputs

- `out/main/` — Electron main process (electron-vite)
- `out/preload/` — Preload script (electron-vite)
- `out/renderer/` — React app (electron-vite / Vite)
- `out/service/server.js` — Service daemon (esbuild, bundled separately with `--external:['*']`)

The service is bundled independently from the Electron build because it runs as a plain Node.js process (or Electron with `ELECTRON_RUN_AS_NODE=1` in production).

---

## ODN VPN Server integration

ODN Connect can operate in two modes:

- **Standalone** — no server configured. Tunnels managed locally via imported
  `.conf` files. Original behaviour, fully preserved.
- **Server-connected** — server URL + credentials stored in `electron-store`.
  Peer configs fetched from server and synced automatically.

### Server profile (electron-store schema addition)

```typescript
interface ServerProfile {
  apiBaseUrl: string        // e.g. "https://vpn.example.com"
  serverName: string        // from /api/client/server-info
  accessToken: string       // JWT, 15-min expiry
  refreshToken: string      // 7-day expiry
  tokenExpiresAt: number    // Unix timestamp
}
```

Stored under the `serverProfile` key in `electron-store`. Never logged.

### Authentication (src/main/server-client.ts)

```
POST {apiBaseUrl}/api/auth/login
  body: { email, password, totp_code? }
  response: { access_token, refresh_token, expires_in }

POST {apiBaseUrl}/api/auth/refresh
  body: { refresh_token }
  response: { access_token, expires_in }
```

Token refresh should happen proactively (e.g. when `tokenExpiresAt - now < 120s`)
in the main process before any API call. Do not refresh from the renderer.

### Config sync loop (src/main/sync.ts)

Runs on a 30-second interval when server-connected:

```
1. GET {apiBaseUrl}/api/me/peers
   → list of peers with metadata

2. For each peer:
   a. GET {apiBaseUrl}/api/me/peers/{id}/config
      with If-Modified-Since: <last sync time>
   b. If 200 (new content): write to config-dir/{name}.conf
      If 304 (not modified): skip
   c. If the active tunnel's config changed: call wg syncconf via Tunnel Service

3. Remove any .conf files in config-dir not present in server peer list
   (peer was deleted on server)
```

Expose sync state to the renderer via `window.api.getSyncStatus()`:

```typescript
interface SyncStatus {
  lastSyncAt: number | null
  syncing: boolean
  error: string | null
}
```

### Server-side peer creation (self-service flow)

When `ODN_CLIENT_SELF_SERVICE=true` on the server, ODN Connect can register a
new peer for the current device without the user visiting the web portal:

```
1. Ask Tunnel Service to generate a keypair:
   wg genkey → privateKey; echo privateKey | wg pubkey → publicKey

2. POST {apiBaseUrl}/api/me/peers
   body: { name: "<hostname>", public_key: publicKey }
   response: { id, assigned_ip, preshared_key, dns, ... }

3. Build .conf locally using the private key + server response.
   Private key is written to the .conf file only — never sent to server.

4. Write .conf to config-dir and connect.
```

### Onboarding flow

On first launch with no server configured, show an "Add Server" screen:

```
1. User enters server URL
2. GET {url}/api/client/server-info (unauthenticated)
   → display server_name, confirm endpoint
3. User enters credentials (+ TOTP if required)
4. POST {url}/api/auth/login
5. Store ServerProfile, trigger initial sync
```

### IPC channels (additions to src/preload/index.ts)

| Channel | Direction | Description |
|---------|-----------|-------------|
| `server:onboard` | main | Save server profile, run initial sync |
| `server:logout` | main | Clear tokens, stop sync loop |
| `server:getProfile` | main | Return server name + apiBaseUrl (no tokens) |
| `server:getSyncStatus` | main | Return SyncStatus |
| `server:syncNow` | main | Force immediate sync |
| `server:createPeer` | main | Self-service peer creation flow |

### Error handling

- **401 on any API call**: attempt token refresh once; if refresh fails, emit
  `server:authExpired` event to renderer to show re-login prompt
- **Network error during sync**: surface in SyncStatus.error; do not disconnect
  existing active tunnel
- **Config written to disk but wg syncconf fails**: log error, mark tunnel as
  stale in UI, do not silently revert to old config

### Offline behaviour

If the server is unreachable:
- Keep existing `.conf` files and tunnel state intact
- Show "Last synced X minutes ago" in UI
- Retry sync on next interval; do not block the user from connecting/disconnecting

---

## Security notes

- Access and refresh tokens live only in `electron-store` (on-disk, not memory).
  Electron-store does not encrypt by default — consider `safeStorage` for the
  token values on platforms that support it.
- The private WireGuard key for self-service peers is written to the `.conf` file
  on disk. This matches standard WireGuard behaviour; the risk is the same as any
  local `.conf` file.
- Never expose `accessToken` or `refreshToken` to the renderer via contextBridge.
  All server API calls happen in the main process only.
- `server:getProfile` returns only display fields (server name, URL) — not tokens.