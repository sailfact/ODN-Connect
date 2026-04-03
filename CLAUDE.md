# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

ODN Connect is a WireGuard desktop client built with Electron + React + TypeScript. It uses a two-process privilege model: the unprivileged Electron app communicates with an elevated system service (ODN Tunnel Service) that actually manages WireGuard tunnel lifecycle.

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
| `src/main/store.ts` | Persistent storage via `electron-store` (tunnels + settings as JSON) |
| `src/main/tray.ts` | System tray icon and menu |
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

### Renderer state

`src/renderer/src/App.tsx` owns all top-level state. It polls `window.api.getTunnelStatus()` every 5 seconds and `window.api.getServiceStatus()` every 30 seconds. Child components (Dashboard, Tunnels, Settings, Sidebar) receive state and callbacks as props — no state management library is used.

### Build outputs

- `out/main/` — Electron main process (electron-vite)
- `out/preload/` — Preload script (electron-vite)
- `out/renderer/` — React app (electron-vite / Vite)
- `out/service/server.js` — Service daemon (esbuild, bundled separately with `--external:['*']`)

The service is bundled independently from the Electron build because it runs as a plain Node.js process (or Electron with `ELECTRON_RUN_AS_NODE=1` in production).
