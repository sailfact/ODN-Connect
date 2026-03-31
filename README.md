# ODN Connect

A modern WireGuard desktop client for Windows — your own Tailscale.

ODN Connect provides a clean, intuitive interface for managing WireGuard VPN tunnels without needing to use the command line. It wraps the native WireGuard Windows service with a modern Electron-based UI.

## Features

- **Dashboard** — Overview of all tunnels with real-time connection status, peer counts, and transfer statistics
- **Tunnel Management** — Import, connect, disconnect, and delete WireGuard `.conf` files
- **System Tray** — Runs in the background with a status indicator (green = connected, grey = disconnected)
- **Desktop Notifications** — Get notified when tunnels connect or disconnect
- **Launch at Startup** — Optionally start ODN Connect when you log in
- **Dark UI** — Purpose-built dark theme inspired by GitHub's design language

## Screenshots

*Coming soon*

## Prerequisites

- **Windows 10/11** (x64)
- **WireGuard for Windows** — Download and install from [wireguard.com/install](https://www.wireguard.com/install/)
- **Administrator privileges** — Required for managing WireGuard tunnel services
- **Node.js 18+** — For development only

## Installation

### From Installer

Download the latest `odn-client-<version>-setup.exe` from the [Releases](https://github.com/sailfact/ODN-Connect/releases) page and run it. The installer requires administrator privileges.

### From Source

```bash
# Clone the repository
git clone https://github.com/sailfact/ODN-Connect.git
cd ODN-Connect

# Install dependencies
npm install

# Start in development mode
npm run dev

# Build for production
npm run build

# Package as Windows installer
npm run package
```

## Usage

1. **Install WireGuard** from [wireguard.com/install](https://www.wireguard.com/install/) if not already installed
2. **Run ODN Connect as Administrator** (right-click > Run as administrator)
3. **Import a tunnel** — Go to Tunnels > Import .conf and select your WireGuard configuration file
4. **Connect** — Click the Connect button on any tunnel card
5. **Monitor** — The Dashboard shows real-time stats; the system tray icon reflects connection status

### Where are configs stored?

Tunnel configuration files are stored in:

```
%APPDATA%\odn-client\tunnels\
```

Application settings (launch at startup, tray behavior, etc.) are persisted via Electron Store.

## Architecture

```
src/
├── main/                  # Electron main process
│   ├── index.ts           # Window creation, IPC handlers, app lifecycle
│   ├── wireguard.ts       # WireGuard CLI integration (connect, disconnect, status)
│   ├── store.ts           # Persistent storage via electron-store
│   ├── tray.ts            # System tray icon and context menu
│   └── types.ts           # Shared TypeScript interfaces
├── preload/
│   └── index.ts           # IPC bridge — exposes safe API to renderer
└── renderer/
    └── src/
        ├── App.tsx         # Root component — routing, state, polling
        ├── main.tsx        # React entry point
        ├── index.css       # Tailwind CSS + custom styles
        ├── types.ts        # Renderer-side TypeScript types
        ├── components/
        │   ├── Dashboard.tsx   # Overview stats, tunnel cards, active peers
        │   ├── Tunnels.tsx     # Tunnel list with import/delete/expand
        │   ├── Settings.tsx    # App preferences (startup, tray, theme)
        │   └── Sidebar.tsx     # Navigation sidebar with connection status
        └── assets/
            └── Logo.png
```

### Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | [Electron](https://www.electronjs.org/) 31 |
| Build | [electron-vite](https://electron-vite.org/) (Vite + Electron) |
| Frontend | [React](https://react.dev/) 18 + TypeScript 5 |
| Styling | [Tailwind CSS](https://tailwindcss.com/) 3 |
| Storage | [electron-store](https://github.com/sindresorhus/electron-store) |
| Config Parsing | [ini](https://github.com/npm/ini) |
| Packaging | [electron-builder](https://www.electron.build/) (NSIS) |

### How WireGuard Integration Works

ODN Connect does **not** implement the WireGuard protocol itself. Instead, it shells out to the official WireGuard Windows binaries:

1. **Connecting** — Runs `wireguard.exe /installtunnelservice <config-path>` to install and start a tunnel as a Windows service
2. **Disconnecting** — Runs `wireguard.exe /uninstalltunnelservice <interface-name>` to stop and remove the service
3. **Status Polling** — Runs `wg.exe show all dump` every 5 seconds to get real-time peer stats (handshakes, transfer bytes, endpoints)
4. **Interface Detection** — Runs `wg.exe show interfaces` to determine which tunnels are currently active

All WireGuard binaries are expected at `C:\Program Files\WireGuard\`.

### IPC Communication

The main and renderer processes communicate via Electron's IPC mechanism. The preload script (`src/preload/index.ts`) exposes a typed `window.api` object with methods like:

| Channel | Direction | Purpose |
|---------|-----------|---------|
| `wg:installed` | Renderer -> Main | Check if WireGuard binaries exist |
| `tunnels:list` | Renderer -> Main | List all tunnels with connection status |
| `tunnels:status` | Renderer -> Main | Get tunnel + peer stats (polled every 5s) |
| `tunnels:connect` | Renderer -> Main | Connect a tunnel by ID |
| `tunnels:disconnect` | Renderer -> Main | Disconnect a tunnel by ID |
| `tunnels:import` | Renderer -> Main | Open file dialog and import a .conf |
| `tunnels:delete` | Renderer -> Main | Disconnect (if active) and delete a tunnel |
| `settings:get/save` | Renderer -> Main | Read/write app preferences |
| `navigate` | Main -> Renderer | Tray menu triggers in-app navigation |

## Development

```bash
# Start dev server with hot reload
npm run dev

# Build production bundles (no packaging)
npm run build

# Preview production build
npm run preview

# Build + package as Windows NSIS installer
npm run package
```

### Project Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Electron in development mode with HMR |
| `npm run build` | Compile TypeScript and bundle with Vite |
| `npm run preview` | Preview the production build locally |
| `npm run package` | Build and package as a Windows installer (.exe) |

## License

[MIT](LICENSE)
