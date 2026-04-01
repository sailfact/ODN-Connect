# ODN Connect: Color Schemes & GUI Improvements Design

## Context
The user wants to research and select color schemes (following the 60-30-10 rule) and GUI improvements (following Shneiderman's Eight Golden Rules) for the ODN Connect WireGuard desktop app. This is a design research deliverable — implementation will happen later.

**Current stack:** Electron + React 18 + TypeScript + Tailwind CSS 3.4
**Current theme:** Single hardcoded dark palette with cyan accent

---

## Four Color Scheme Options (60-30-10 Rule)

### Theme 1: "Midnight" (Refined Current Dark)

| Token | Hex | 60/30/10 |
|-------|-----|----------|
| bg-primary | `#07090f` | 60% |
| bg-secondary | `#0b1018` | 60% |
| bg-tertiary | `#0f1420` | 30% |
| bg-elevated | `#162035` | 30% |
| accent-primary | `#00c8f0` | 10% |
| accent-success | `#22c55e` | 10% |
| accent-danger | `#ef4444` | 10% |
| accent-warning | `#eab308` | 10% |
| accent-info | `#a855f7` | 10% |
| text-primary | `#e8eef6` | 30% |
| text-secondary | `#8ba8c4` | 30% |
| text-muted | `#4d6480` | 30% |
| border-default | `#1a2840` | 30% |
| border-light | `#243551` | 30% |

**60%:** Near-black backgrounds fill the entire viewport (sidebar, main area, app shell).
**30%:** Cards, text, borders create readable mid-layer content.
**10%:** Cyan blue on CTAs/active nav; green/red on status indicators only.

---

### Theme 2: "Arctic Light"

| Token | Hex | 60/30/10 |
|-------|-----|----------|
| bg-primary | `#f4f6f9` | 60% |
| bg-secondary | `#ffffff` | 60% |
| bg-tertiary | `#ebeef3` | 30% |
| bg-elevated | `#dfe3eb` | 30% |
| accent-primary | `#0078d4` | 10% |
| accent-success | `#16a34a` | 10% |
| accent-danger | `#dc2626` | 10% |
| accent-warning | `#ca8a04` | 10% |
| accent-info | `#7c3aed` | 10% |
| text-primary | `#1a1d23` | 30% |
| text-secondary | `#4b5563` | 30% |
| text-muted | `#9ca3af` | 30% |
| border-default | `#d1d5db` | 30% |
| border-light | `#e5e7eb` | 30% |

**60%:** Cool gray + white surfaces create a spacious, professional workspace.
**30%:** Dark text, input backgrounds, and borders provide structure.
**10%:** Microsoft-style blue drives all primary interactions; green/red for status only.

---

### Theme 3: "Slate Dusk" (Catppuccin-inspired)

| Token | Hex | 60/30/10 |
|-------|-----|----------|
| bg-primary | `#1e1e2e` | 60% |
| bg-secondary | `#262637` | 60% |
| bg-tertiary | `#2e2e42` | 30% |
| bg-elevated | `#3a3a52` | 30% |
| accent-primary | `#89b4fa` | 10% |
| accent-success | `#a6e3a1` | 10% |
| accent-danger | `#f38ba8` | 10% |
| accent-warning | `#f9e2af` | 10% |
| accent-info | `#cba6f7` | 10% |
| text-primary | `#cdd6f4` | 30% |
| text-secondary | `#a6adc8` | 30% |
| text-muted | `#6c7086` | 30% |
| border-default | `#363650` | 30% |
| border-light | `#45455e` | 30% |

**60%:** Deep purple-gray base — softer than pure black, reduces eye strain in mixed lighting.
**30%:** Lavender-white text and lighter purple-gray surfaces for readability.
**10%:** Pastel blue/green/pink accents complement the warm base without overstimulating.

---

### Theme 4: "Nord Frost"

| Token | Hex | 60/30/10 |
|-------|-----|----------|
| bg-primary | `#2e3440` | 60% |
| bg-secondary | `#3b4252` | 60% |
| bg-tertiary | `#434c5e` | 30% |
| bg-elevated | `#4c566a` | 30% |
| accent-primary | `#88c0d0` | 10% |
| accent-success | `#a3be8c` | 10% |
| accent-danger | `#bf616a` | 10% |
| accent-warning | `#ebcb8b` | 10% |
| accent-info | `#b48ead` | 10% |
| text-primary | `#eceff4` | 30% |
| text-secondary | `#d8dee9` | 30% |
| text-muted | `#7b88a1` | 30% |
| border-default | `#4c566a` | 30% |
| border-light | `#5a657a` | 30% |

**60%:** Blue-tinted charcoal (Nord Polar Night) — warmer than pure black.
**30%:** Snow Storm text and lighter polar shades for strong readability.
**10%:** Muted teal for primary actions; Aurora palette for status colors.

---

## GUI Improvements (Eight Golden Rules)

### Rule 1: Strive for Consistency
- Replace mixed icon system (inline SVGs + emojis) with `lucide-react` throughout
- Standardize status text: always "Connected"/"Disconnected" (remove "Active" variant)
- Unify max-width across all views (currently Settings uses `max-w-2xl`, others use `max-w-3xl`)
- Create consistent link/navigation component with proper arrow icons

### Rule 2: Seek Universal Usability
- Add `focus-visible:ring-2` to all interactive elements for keyboard navigation
- Add `aria-label` to icon-only buttons (delete, expand/collapse)
- Add `role="status"` + `aria-live="polite"` to sidebar connection summary
- Increase minimum body text to `text-sm` (14px); reserve `text-xs` for metadata only

### Rule 3: Offer Informative Feedback
- Build a Toast notification system (connect/disconnect/import/save/delete confirmations)
- Replace "..." busy states with "Connecting..."/"Disconnecting..." + spinner
- Add loading skeleton/pulse during status refresh
- Show connection duration on active tunnels ("Connected for 2h 34m")

### Rule 4: Design Dialogs to Yield Closure
- Replace browser `confirm()` with custom themed `ConfirmDialog` modal
- Highlight newly imported tunnels with fade-in animation
- Consider first-run welcome flow: install WireGuard -> import tunnel -> connect

### Rule 5: Prevent Errors
- Disable "Connect" button when WireGuard not installed (tooltip explains why)
- Two-step inline delete: click trash -> inline "Confirm" button appears for 3 seconds
- Client-side .conf validation with specific error messages before import
- Warn on overlapping address ranges between connected tunnels

### Rule 6: Permit Easy Reversal of Actions
- Soft-delete tunnels: show "Undo" toast for 8 seconds before permanent deletion
- Add "Reset to Defaults" button in Settings
- Add "Disconnect All" action in Dashboard/Tunnels header
- Consider auto-save settings with inline "Undo" option per change

### Rule 7: Keep Users in Control
- Add manual refresh button + "last updated" timestamp on Dashboard
- Show subtle indicator during automatic 5s polling refreshes
- Add connection timeout prompt after 15s: "Keep waiting or Cancel?"
- Add keyboard shortcuts: Ctrl+R (refresh), Ctrl+I (import), Ctrl+1/2/3 (views)

### Rule 8: Reduce Short-term Memory Load
- Add persistent status bar at bottom: active tunnel count, bandwidth, last refresh
- Auto-scroll to relevant tunnel when navigating from Dashboard to Tunnels
- Show mini-summary of active tunnel in sidebar (always visible)
- Display human-readable peer names prominently (already optional in type)

---

## Implementation Strategy (for later)

**Theme infrastructure:** Use CSS custom properties (`var(--bg-primary)`) in `tailwind.config.js` so themes switch at runtime via `data-theme` attribute — no rebuild needed. Rename accent colors from hue-specific (`accent-blue`) to semantic (`accent-primary`).

**Key files to modify:**
- `tailwind.config.js` — CSS variable references
- `src/renderer/src/index.css` — theme variable definitions, component class updates
- `src/renderer/src/App.tsx` — theme application logic
- `src/renderer/src/components/Settings.tsx` — theme selector options
- `src/renderer/src/types.ts` — theme type update
- All component files — accent color class renames

**Phased rollout:**
1. Theme infrastructure + all 4 color schemes
2. Consistency + accessibility improvements
3. Feedback + error prevention components
4. Advanced UX (status bar, collapsible sidebar, keyboard shortcuts)

## Verification
- Visual: screenshot each theme across all 3 views
- Accessibility: check WCAG AA contrast ratios for all text/background combinations
- Build: `npm run build` succeeds with no Tailwind errors
- Runtime: theme switching works without page reload
