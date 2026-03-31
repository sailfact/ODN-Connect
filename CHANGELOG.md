# Changelog

All notable changes to ODN Connect will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/), and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.0] - 2026-03-31

### Added

- Initial release of ODN Connect
- Dashboard with real-time tunnel statistics (active tunnels, peers, upload/download)
- Tunnel management: import `.conf` files, connect, disconnect, delete
- System tray integration with connection status indicator
- Desktop notifications on tunnel connect/disconnect
- Settings: launch at startup, minimize to tray, notifications toggle, theme selection
- WireGuard installation detection with user-friendly warnings
- Persistent storage for tunnel configs and app settings
- Sidebar navigation with active tunnel count badge
- Expandable peer details (public key, endpoint, allowed IPs, handshake, transfer stats)

### Fixed

- Malformed CSS hex color in scrollbar hover style
- Missing error handling in IPC connect/disconnect handlers
- Silent error swallowing in WireGuard CLI and config parsing functions
- `@ts-ignore` directives replaced with proper type casting
- Duplicate `path` module imports consolidated
- Case-sensitive asset import (`logo.png` -> `Logo.png`)
