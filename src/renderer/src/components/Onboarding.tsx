/**
 * Onboarding wizard for connecting to an ODN VPN Server.
 *
 * Two-step flow:
 * 1. Enter server URL → confirm server name via GET /api/client/server-info
 * 2. Enter credentials (+ TOTP if required) → POST /api/auth/login
 *
 * Renders full-screen (no sidebar). Respects the active CSS theme.
 */

import { useState } from 'react'
import type { ServerProfile } from '../types'

interface OnboardingProps {
  onComplete: (profile: ServerProfile) => void
  onSkip?: () => void
}

export default function Onboarding({ onComplete, onSkip }: OnboardingProps) {
  const [step, setStep] = useState<'url' | 'login'>('url')

  // Step 1 state
  const [url, setUrl] = useState('')
  const [serverName, setServerName] = useState('')
  const [urlLoading, setUrlLoading] = useState(false)
  const [urlError, setUrlError] = useState('')

  // Step 2 state
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [totpCode, setTotpCode] = useState('')
  const [showTotp, setShowTotp] = useState(false)
  const [loginLoading, setLoginLoading] = useState(false)
  const [loginError, setLoginError] = useState('')

  const handleCheckUrl = async () => {
    if (!url.trim()) return
    setUrlLoading(true)
    setUrlError('')
    try {
      const info = await window.api.getServerInfo(url.trim())
      setServerName(info.server_name)
      setStep('login')
    } catch (err) {
      setUrlError(err instanceof Error ? err.message : 'Could not reach server — check the URL')
    } finally {
      setUrlLoading(false)
    }
  }

  const handleLogin = async () => {
    if (!email.trim() || !password) return
    setLoginLoading(true)
    setLoginError('')
    try {
      const result = await window.api.onboardServer(
        url.trim(),
        email.trim(),
        password,
        showTotp ? totpCode : null
      )
      if (!result.success) throw new Error(result.error ?? 'Login failed')
      onComplete({ serverName: result.serverName, apiBaseUrl: url.trim() })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('TOTP code required')) {
        setShowTotp(true)
        setLoginError('This account requires a TOTP code. Enter it below and try again.')
      } else {
        setLoginError(msg)
      }
    } finally {
      setLoginLoading(false)
    }
  }

  return (
    <div className="flex items-center justify-center h-full bg-bg-primary">
      <div className="w-full max-w-sm mx-4">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-12 h-12 rounded-xl bg-accent-blue/10 border border-accent-blue/20 flex items-center justify-center mx-auto mb-4">
            <svg className="w-6 h-6 text-accent-blue" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          </div>
          <h1 className="text-text-primary text-xl font-bold">Connect to VPN Server</h1>
          <p className="text-text-secondary text-sm mt-1">
            {step === 'url'
              ? 'Optionally connect to a VPN server for automatic config sync'
              : `Connecting to ${serverName}`}
          </p>
        </div>

        {/* Step 1 — Server URL */}
        {step === 'url' && (
          <div className="card space-y-4">
            <div>
              <label className="block text-text-secondary text-xs font-medium mb-1.5">
                Server URL
              </label>
              <input
                type="url"
                placeholder="https://vpn.example.com"
                value={url}
                onChange={(e) => { setUrl(e.target.value); setUrlError('') }}
                onKeyDown={(e) => e.key === 'Enter' && handleCheckUrl()}
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
                autoFocus
              />
            </div>

            {urlError && (
              <p className="text-red-400 text-xs">{urlError}</p>
            )}

            <button
              onClick={handleCheckUrl}
              disabled={!url.trim() || urlLoading}
              className="btn-primary w-full disabled:opacity-50"
            >
              {urlLoading ? 'Checking...' : 'Continue'}
            </button>
          </div>
        )}

        {/* Step 2 — Login */}
        {step === 'login' && (
          <div className="card space-y-4">
            <div>
              <label className="block text-text-secondary text-xs font-medium mb-1.5">
                Email
              </label>
              <input
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setLoginError('') }}
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
                autoFocus
              />
            </div>

            <div>
              <label className="block text-text-secondary text-xs font-medium mb-1.5">
                Password
              </label>
              <input
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setLoginError('') }}
                onKeyDown={(e) => !showTotp && e.key === 'Enter' && handleLogin()}
                className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent-blue"
              />
            </div>

            {showTotp && (
              <div>
                <label className="block text-text-secondary text-xs font-medium mb-1.5">
                  TOTP Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="000000"
                  maxLength={6}
                  value={totpCode}
                  onChange={(e) => { setTotpCode(e.target.value); setLoginError('') }}
                  onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
                  className="w-full bg-bg-primary border border-border rounded-lg px-3 py-2 text-text-primary text-sm placeholder:text-text-muted focus:outline-none focus:border-accent-blue font-mono tracking-widest"
                  autoFocus
                />
              </div>
            )}

            {loginError && (
              <p className="text-red-400 text-xs">{loginError}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setStep('url'); setLoginError('') }}
                className="flex-1 px-4 py-2 text-sm text-text-secondary border border-border rounded-lg hover:bg-bg-elevated transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleLogin}
                disabled={!email.trim() || !password || loginLoading}
                className="flex-1 btn-primary disabled:opacity-50"
              >
                {loginLoading ? 'Signing in...' : 'Sign In'}
              </button>
            </div>
          </div>
        )}

        {onSkip && (
          <p className="text-center text-text-muted text-xs mt-6">
            <button
              onClick={onSkip}
              className="hover:text-text-secondary transition-colors"
            >
              ← Back to app
            </button>
          </p>
        )}
      </div>
    </div>
  )
}
