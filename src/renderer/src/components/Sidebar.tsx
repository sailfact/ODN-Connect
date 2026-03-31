import type { Route, Tunnel } from '../types'
import logo from '../assets/Logo.png'

interface SidebarProps {
  route: Route
  onNavigate: (r: Route) => void
  tunnels: Tunnel[]
}

const NavItem = ({
  label,
  icon,
  active,
  onClick,
  badge
}: {
  label: string
  icon: React.ReactNode
  active: boolean
  onClick: () => void
  badge?: string
}) => (
  <button
    onClick={onClick}
    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 text-left ${
      active
        ? 'bg-accent-blue/10 text-accent-blue'
        : 'text-text-secondary hover:text-text-primary hover:bg-bg-elevated'
    }`}
  >
    <span className="w-4 h-4 shrink-0">{icon}</span>
    <span className="flex-1">{label}</span>
    {badge && (
      <span className="text-xs bg-accent-blue text-white rounded-full w-5 h-5 flex items-center justify-center font-semibold">
        {badge}
      </span>
    )}
  </button>
)

// Simple inline SVG icons
const DashboardIcon = () => (
  <svg viewBox="0 0 16 16" fill="currentColor">
    <rect x="1" y="1" width="6" height="6" rx="1.5" />
    <rect x="9" y="1" width="6" height="6" rx="1.5" />
    <rect x="1" y="9" width="6" height="6" rx="1.5" />
    <rect x="9" y="9" width="6" height="6" rx="1.5" />
  </svg>
)

const TunnelsIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
    <path d="M2 8h12M8 2v12M4 4l8 8M12 4l-8 8" />
  </svg>
)

const SettingsIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="8" cy="8" r="2" />
    <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.41 1.41M11.54 11.54l1.41 1.41M3.05 12.95l1.41-1.41M11.54 4.46l1.41-1.41" />
  </svg>
)

const WireGuardIcon = () => (
  <svg viewBox="0 0 32 32" fill="currentColor">
    <path d="M16 2C8.268 2 2 8.268 2 16s6.268 14 14 14 14-6.268 14-14S23.732 2 16 2zm0 2c6.627 0 12 5.373 12 12S22.627 28 16 28 4 22.627 4 16 9.373 4 16 4zm-1 5v2h2V9h-2zm-3 3v2h2v-2h-2zm6 0v2h2v-2h-2zm-6 3v4h2v-4h-2zm6 0v4h2v-4h-2zm-3 1v6h2v-6h-2z" />
  </svg>
)

export default function Sidebar({ route, onNavigate, tunnels }: SidebarProps) {
  const connectedCount = tunnels.filter((t) => t.connected).length

  return (
    <aside className="w-56 shrink-0 flex flex-col bg-bg-secondary border-r border-border h-full">
      {/* App header */}
      <div className="drag-region px-4 py-4 flex items-center gap-3 border-b border-border">
        <img src={logo} alt="ODN Client" className="w-8 h-8 shrink-0" />
        <div className="no-drag">
          <div className="text-text-primary font-semibold text-sm leading-tight">ODN Client</div>
          <div className="text-text-muted text-xs">WireGuard Client</div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1">
        <p className="text-text-muted text-xs font-semibold uppercase tracking-wider px-3 mb-2">
          Navigation
        </p>
        <NavItem
          label="Dashboard"
          icon={<DashboardIcon />}
          active={route === 'dashboard'}
          onClick={() => onNavigate('dashboard')}
        />
        <NavItem
          label="Tunnels"
          icon={<TunnelsIcon />}
          active={route === 'tunnels'}
          onClick={() => onNavigate('tunnels')}
          badge={connectedCount > 0 ? String(connectedCount) : undefined}
        />
        <NavItem
          label="Settings"
          icon={<SettingsIcon />}
          active={route === 'settings'}
          onClick={() => onNavigate('settings')}
        />
      </nav>

      {/* Connection summary */}
      <div className="px-3 py-4 border-t border-border">
        <div
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs ${
            connectedCount > 0
              ? 'bg-green-500/10 text-accent-green'
              : 'bg-bg-elevated text-text-muted'
          }`}
        >
          <div
            className={`w-2 h-2 rounded-full ${
              connectedCount > 0 ? 'bg-accent-green animate-pulse' : 'bg-text-muted'
            }`}
          />
          {connectedCount > 0
            ? `${connectedCount} tunnel${connectedCount > 1 ? 's' : ''} active`
            : 'Not connected'}
        </div>
      </div>
    </aside>
  )
}
