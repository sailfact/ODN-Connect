# ODN Connect

A modern WireGuard desktop client — your own Tailscale.

ODN Connect provides a clean, intuitive interface for managing WireGuard VPN tunnels without needing to use the command line. It wraps the native WireGuard CLI tools with a modern Electron-based UI.

## Features

- **Dashboard** — Overview of all tunnels with real-time connection status, peer counts, and transfer statistics
- **Tunnel Management** — Import, connect, disconnect, and delete WireGuard `.conf` files
- **System Tray** — Runs in the background with a status indicator (green = connected, grey = disconnected)
- **Desktop Notifications** — Get notified when tunnels connect or disconnect
- **Launch at Startup** — Optionally start ODN Connect when you log in
- **Cross-Platform** — Supports Windows, macOS, and Linux
- **Dark UI** — Purpose-built dark theme inspired by GitHub's design language

## Screenshots

*Coming soon*

## Prerequisites

- **WireGuard** — Must be installed on your system
  - **Windows:** Download from [wireguard.com/install](https://www.wireguard.com/install/)
  - **macOS:** `brew install wireguard-tools` or download from [wireguard.com/install](https://www.wireguard.com/install/)
  - **Linux:** `sudo apt install wireguard` (Debian/Ubuntu) or your distro's package manager
- **Elevated privileges** — Required for managing WireGuard tunnels
  - **Windows:** Run as Administrator
  - **macOS/Linux:** Run with sudo or configure passwordless sudo for `wg` and `wg-quick`
- **Node.js 18+** — For development only

## Installation

### From Installer

Download the latest release for your platform from the [Releases](https://github.com/sailfact/ODN-Connect/releases) page:

- **Windows:** `odn-client-<version>-setup.exe` (NSIS installer, requires Administrator)
- **macOS:** `ODN-Client-<version>.dmg` (supports Intel and Apple Silicon)
- **Linux:** `odn-client-<version>.AppImage` or `.deb`

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

# Package for your platform
npm run package:win    # Windows (.exe)
npm run package:mac    # macOS (.dmg)
npm run package:linux  # Linux (.AppImage, .deb)
```

## Usage

1. **Install WireGuard** for your platform (see Prerequisites above)
2. **Run ODN Connect** with elevated privileges
3. **Import a tunnel** — Go to Tunnels > Import .conf and select your WireGuard configuration file
4. **Connect** — Click the Connect button on any tunnel card
5. **Monitor** — The Dashboard shows real-time stats; the system tray icon reflects connection status

### Where are configs stored?

Tunnel configuration files are stored in a platform-specific location:

| Platform | Path |
|----------|------|
| Windows | `%APPDATA%\odn-client\tunnels\` |
| macOS | `~/Library/Application Support/odn-client/tunnels/` |
| Linux | `~/.config/odn-client/tunnels/` |

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
| Packaging | [electron-builder](https://www.electron.build/) (NSIS, DMG, AppImage, deb) |

### How WireGuard Integration Works

ODN Connect does **not** implement the WireGuard protocol itself. Instead, it shells out to the official WireGuard CLI tools. The commands differ by platform:

| Operation | Windows | Linux / macOS |
|-----------|---------|---------------|
| Connect | `wireguard.exe /installtunnelservice <config>` | `sudo wg-quick up <config>` |
| Disconnect | `wireguard.exe /uninstalltunnelservice <name>` | `sudo wg-quick down <name>` |
| Status | `wg.exe show all dump` | `sudo wg show all dump` |
| List interfaces | `wg.exe show interfaces` | `sudo wg show interfaces` |
| Generate keys | `wg.exe genkey` + PowerShell piping | `wg genkey` + shell piping |

**Binary locations:**
- **Windows:** `C:\Program Files\WireGuard\` (wg.exe, wireguard.exe)
- **Linux/macOS:** System PATH (wg, wg-quick)

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

# Package for a specific platform
npm run package:win
npm run package:mac
npm run package:linux
```

### Project Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start Electron in development mode with HMR |
| `npm run build` | Compile TypeScript and bundle with Vite |
| `npm run preview` | Preview the production build locally |
| `npm run package` | Build and package as a Windows installer (.exe) |
| `npm run package:win` | Build and package for Windows (NSIS) |
| `npm run package:mac` | Build and package for macOS (DMG) |
| `npm run package:linux` | Build and package for Linux (AppImage, deb) |

## License

[MIT](LICENSE)
