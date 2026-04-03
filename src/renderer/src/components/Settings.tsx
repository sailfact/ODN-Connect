/**
 * Settings view — configure ODN Connect behavior and preferences.
 *
 * Sections:
 * - General: launch at startup, minimize to tray, notifications
 * - WireGuard: info about admin privileges and installation
 * - Appearance: theme selection (dark/light/system)
 * - About: app info and config directory link
 *
 * Settings are saved to electron-store on the main process side.
 */

import { useState } from 'react'
import type { AppSettings } from '../types'

interface SettingsProps {
  settings: AppSettings
  onSave: (s: AppSettings) => Promise<void>
}

/** Reusable toggle switch component with a label and optional description. */
function Toggle({
  label,
  description,
  checked,
  onChange
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer py-3">
      <div>
        <p className="text-text-primary text-sm font-medium">{label}</p>
        {description && <p className="text-text-secondary text-xs mt-0.5">{description}</p>}
      </div>
      <button
        onClick={() => onChange(!checked)}
        className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${
          checked ? 'bg-accent-blue' : 'bg-bg-elevated border border-border'
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </label>
  )
}

const THEMES: {
  value: AppSettings['theme']
  label: string
  description: string
  swatch: { bg: string; secondary: string; accent: string; text: string }
}[] = [
  {
    value: 'midnight',
    label: 'Midnight',
    description: 'Deep dark with cyan accent',
    swatch: { bg: '#07090f', secondary: '#0b1018', accent: '#00c8f0', text: '#e8eef6' }
  },
  {
    value: 'arctic-light',
    label: 'Arctic Light',
    description: 'Clean professional light',
    swatch: { bg: '#f4f6f9', secondary: '#ffffff', accent: '#0078d4', text: '#1a1d23' }
  },
  {
    value: 'slate-dusk',
    label: 'Slate Dusk',
    description: 'Catppuccin-inspired purple',
    swatch: { bg: '#1e1e2e', secondary: '#262637', accent: '#89b4fa', text: '#cdd6f4' }
  },
  {
    value: 'nord-frost',
    label: 'Nord Frost',
    description: 'Polar night with Aurora',
    swatch: { bg: '#2e3440', secondary: '#3b4252', accent: '#88c0d0', text: '#eceff4' }
  },
  {
    value: 'system',
    label: 'System',
    description: 'Follows OS preference',
    swatch: { bg: '#1e293b', secondary: '#f8fafc', accent: '#64748b', text: '#94a3b8' }
  }
]

/** Visual theme card selector. */
function ThemeSelector({
  value,
  onChange
}: {
  value: AppSettings['theme']
  onChange: (v: AppSettings['theme']) => void
}) {
  return (
    <div className="py-3">
      <p className="text-text-primary text-sm font-medium mb-3">Theme</p>
      <div className="grid grid-cols-5 gap-2">
        {THEMES.map((theme) => {
          const isSelected = value === theme.value
          const isSystem = theme.value === 'system'
          return (
            <button
              key={theme.value}
              onClick={() => onChange(theme.value)}
              className={`flex flex-col rounded-lg overflow-hidden border-2 transition-all ${
                isSelected
                  ? 'border-accent-blue scale-[1.02]'
                  : 'border-border hover:border-border-light'
              }`}
            >
              {/* Swatch preview */}
              {isSystem ? (
                <div className="h-14 flex">
                  <div className="w-1/2 flex flex-col gap-1 p-1.5" style={{ background: '#07090f' }}>
                    <div className="h-1.5 rounded-full w-full" style={{ background: '#0b1018' }} />
                    <div className="h-1.5 rounded-full w-3/4" style={{ background: '#0b1018' }} />
                    <div className="h-2 rounded-sm w-full mt-auto" style={{ background: '#00c8f0' }} />
                  </div>
                  <div className="w-1/2 flex flex-col gap-1 p-1.5" style={{ background: '#f4f6f9' }}>
                    <div className="h-1.5 rounded-full w-full" style={{ background: '#dfe3eb' }} />
                    <div className="h-1.5 rounded-full w-3/4" style={{ background: '#dfe3eb' }} />
                    <div className="h-2 rounded-sm w-full mt-auto" style={{ background: '#0078d4' }} />
                  </div>
                </div>
              ) : (
                <div
                  className="h-14 flex flex-col gap-1 p-1.5"
                  style={{ background: theme.swatch.bg }}
                >
                  <div
                    className="h-1.5 rounded-full w-full"
                    style={{ background: theme.swatch.secondary }}
                  />
                  <div
                    className="h-1.5 rounded-full w-3/4"
                    style={{ background: theme.swatch.secondary }}
                  />
                  <div className="flex gap-1 mt-auto">
                    <div
                      className="h-2 rounded-sm flex-1"
                      style={{ background: theme.swatch.accent }}
                    />
                    <div
                      className="h-2 rounded-sm w-3"
                      style={{ background: theme.swatch.text, opacity: 0.3 }}
                    />
                  </div>
                </div>
              )}
              {/* Label */}
              <div className="bg-bg-elevated px-1.5 py-1.5 text-left">
                <p className="text-text-primary text-xs font-medium leading-tight">{theme.label}</p>
                <p className="text-text-muted text-[10px] leading-tight mt-0.5 line-clamp-1">
                  {theme.description}
                </p>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export default function Settings({ settings, onSave }: SettingsProps) {
  const [local, setLocal] = useState<AppSettings>({ ...settings })
  const [saved, setSaved] = useState(false)
  const [saving, setSaving] = useState(false)

  const set = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setLocal((prev) => ({ ...prev, [key]: value }))
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave(local)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-text-primary text-xl font-bold">Settings</h1>
          <p className="text-text-secondary text-sm mt-1">Configure ODN Client behavior</p>
        </div>

        {/* General */}
        <div className="card mb-4">
          <h2 className="text-text-primary font-semibold text-sm mb-3 pb-3 border-b border-border">
            General
          </h2>
          <div className="divide-y divide-border/50">
            <Toggle
              label="Launch at startup"
              description="Automatically start ODN Client when you log in"
              checked={local.launchAtStartup}
              onChange={(v) => set('launchAtStartup', v)}
            />
            <Toggle
              label="Minimize to tray"
              description="Keep running in the system tray when the window is closed"
              checked={local.minimizeToTray}
              onChange={(v) => set('minimizeToTray', v)}
            />
            <Toggle
              label="Show notifications"
              description="Get notified when tunnels connect or disconnect"
              checked={local.showNotifications}
              onChange={(v) => set('showNotifications', v)}
            />
          </div>
        </div>

        {/* WireGuard */}
        <div className="card mb-4">
          <h2 className="text-text-primary font-semibold text-sm mb-3 pb-3 border-b border-border">
            WireGuard
          </h2>
          <div className="bg-bg-primary rounded-lg p-3 text-xs text-text-secondary">
            <p className="font-semibold text-text-primary mb-1">Elevated privileges required</p>
            <p>
              ODN Client uses WireGuard to manage tunnels.
              Connecting and disconnecting requires elevated privileges
              (Administrator on Windows, root/sudo on Linux and macOS).
            </p>
            <p className="mt-2">
              WireGuard must be installed from{' '}
              <span className="text-accent-blue font-mono">wireguard.com/install</span>
            </p>
          </div>
        </div>

        {/* Appearance */}
        <div className="card mb-6">
          <h2 className="text-text-primary font-semibold text-sm mb-3 pb-3 border-b border-border">
            Appearance
          </h2>
          <ThemeSelector
            value={local.theme}
            onChange={(v) => set('theme', v)}
          />
        </div>

        {/* About */}
        <div className="card mb-6">
          <h2 className="text-text-primary font-semibold text-sm mb-3 pb-3 border-b border-border">
            About
          </h2>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-text-secondary">Application</span>
              <span className="text-text-primary font-medium">ODN Client</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Description</span>
              <span className="text-text-primary">WireGuard Desktop Client</span>
            </div>
            <div className="flex justify-between">
              <span className="text-text-secondary">Config directory</span>
              <button
                onClick={() => window.api.openConfigDir()}
                className="text-accent-blue hover:underline text-xs"
              >
                Open folder →
              </button>
            </div>
          </div>
        </div>

        {/* Save */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
          {saved && (
            <span className="text-accent-green text-sm">✓ Settings saved</span>
          )}
        </div>
      </div>
    </div>
  )
}
