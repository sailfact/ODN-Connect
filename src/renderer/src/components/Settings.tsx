import { useState } from 'react'
import type { AppSettings } from '../types'

interface SettingsProps {
  settings: AppSettings
  onSave: (s: AppSettings) => Promise<void>
}

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

function SelectField({
  label,
  description,
  value,
  options,
  onChange
}: {
  label: string
  description?: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <div className="py-3 flex items-center justify-between gap-4">
      <div>
        <p className="text-text-primary text-sm font-medium">{label}</p>
        {description && <p className="text-text-secondary text-xs mt-0.5">{description}</p>}
      </div>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input w-40 shrink-0 bg-bg-elevated cursor-pointer"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
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
            <p className="font-semibold text-text-primary mb-1">Administrator privileges required</p>
            <p>
              ODN Client uses the WireGuard Windows service to manage tunnels.
              Connecting and disconnecting requires the app to be run as Administrator.
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
          <SelectField
            label="Theme"
            value={local.theme}
            options={[
              { value: 'dark', label: 'Dark' },
              { value: 'light', label: 'Light' },
              { value: 'system', label: 'System' }
            ]}
            onChange={(v) => set('theme', v as AppSettings['theme'])}
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
