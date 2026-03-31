# Contributing to ODN Connect

Thanks for your interest in contributing to ODN Connect! This guide will help you get set up and understand the project conventions.

## Getting Started

1. Fork and clone the repository
2. Install dependencies: `npm install`
3. Start the dev server: `npm run dev`
4. Make your changes
5. Verify the build passes: `npm run build`
6. Submit a pull request

## Development Environment

- **Node.js 18+** is required
- **Windows** is needed for full testing (WireGuard integration is Windows-only)
- The app requires **Administrator privileges** to connect/disconnect tunnels

## Project Structure

See the [Architecture section](README.md#architecture) in the README for a full breakdown. The key concept is the separation between:

- **Main process** (`src/main/`) — Handles WireGuard CLI calls, file I/O, and system integration
- **Preload** (`src/preload/`) — Bridges main and renderer with a typed API
- **Renderer** (`src/renderer/`) — React UI components

## Code Style

- **TypeScript** — All code is written in TypeScript. Avoid `any` types; use `unknown` with type guards instead.
- **React** — Functional components with hooks only. No class components.
- **Tailwind CSS** — Use Tailwind utility classes for styling. Custom component classes are defined in `src/renderer/src/index.css` under `@layer components`.
- **Imports** — Use `node:` prefix for Node.js built-in modules (e.g., `import * as path from 'node:path'`).

## Commit Messages

Follow conventional commit format:

```
type: short description

Optional longer description explaining why the change was made.
```

Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `style`

Examples:
- `feat: add tunnel search and filtering`
- `fix: handle WireGuard service timeout on slow machines`
- `docs: add development setup instructions to README`

## Pull Requests

- Keep PRs focused on a single change
- Include a clear description of what changed and why
- Make sure `npm run build` passes before submitting
- Add screenshots for UI changes

## Reporting Issues

When reporting bugs, please include:

- Steps to reproduce
- Expected vs actual behavior
- Windows version
- WireGuard version (run `wg --version` in an admin terminal)
- Whether the app was run as Administrator

## Areas for Contribution

Check the project's issue tracker for open issues. Some areas that could use help:

- Linux and macOS platform support
- Test coverage (unit tests, integration tests)
- Accessibility improvements
- Theme switching implementation
- Tunnel config editing UI
