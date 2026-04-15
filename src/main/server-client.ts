/**
 * HTTP client for the ODN VPN Server API.
 *
 * Handles authentication, proactive token refresh, and all server API calls.
 * All calls are made in the main process only — tokens are never passed to the renderer.
 */

import { app } from 'electron'
import { saveServerProfile } from './store'
import type { ServerProfile, ServerInfo, TokenResponse, PeerOut } from './types'

export class ServerClient {
  constructor(
    private profile: ServerProfile,
    private onAuthExpired: () => void
  ) {}

  // ── Static (pre-auth) ────────────────────────────────────────────────────────

  /** Fetch server info without authentication. Used during onboarding. */
  static async fetchServerInfo(baseUrl: string): Promise<ServerInfo> {
    const url = baseUrl.replace(/\/$/, '')
    const res = await fetch(`${url}/api/client/server-info`, {
      headers: { 'User-Agent': `ODNConnect/${app.getVersion()}` }
    })
    if (!res.ok) {
      throw new Error(`Server returned ${res.status}: unable to reach ODN VPN Server`)
    }
    return res.json() as Promise<ServerInfo>
  }

  /** Login and obtain tokens. Throws with the server's detail message on failure. */
  static async login(
    baseUrl: string,
    email: string,
    password: string,
    totpCode?: string | null
  ): Promise<TokenResponse> {
    const url = baseUrl.replace(/\/$/, '')
    const body: Record<string, string | null> = { email, password }
    if (totpCode != null) body.totp_code = totpCode

    const res = await fetch(`${url}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `ODNConnect/${app.getVersion()}`
      },
      body: JSON.stringify(body)
    })

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { detail?: string }
      throw new Error(data.detail ?? `Login failed (${res.status})`)
    }

    return res.json() as Promise<TokenResponse>
  }

  // ── Instance (authenticated) ─────────────────────────────────────────────────

  /** Invalidate the refresh token on the server. Fire-and-forget safe. */
  async logout(): Promise<void> {
    await this.request('POST', '/api/auth/logout', {
      body: { refresh_token: this.profile.refreshToken },
      skipAuthRefresh: true
    }).catch(() => {})
  }

  /** List all peers for the authenticated user. */
  async getPeers(): Promise<PeerOut[]> {
    return this.request<PeerOut[]>('GET', '/api/me/peers')
  }

  /**
   * Fetch the .conf file for a peer.
   * Passes If-Modified-Since when provided; returns 304 status when unchanged.
   */
  async getPeerConfig(
    peerId: string,
    ifModifiedSince?: string
  ): Promise<{ status: 200; body: string; lastModified: string } | { status: 304 }> {
    const headers: Record<string, string> = {}
    if (ifModifiedSince) headers['If-Modified-Since'] = ifModifiedSince

    const res = await this.rawRequest('GET', `/api/me/peers/${peerId}/config`, { headers })

    if (res.status === 304) return { status: 304 }
    if (!res.ok) throw new Error(`Failed to fetch peer config (${res.status})`)

    const body = await res.text()
    const lastModified = res.headers.get('Last-Modified') ?? new Date().toUTCString()
    return { status: 200, body, lastModified }
  }

  /** Create a new peer (self-service flow). */
  async createPeer(params: {
    name: string
    publicKey: string
    clientLabel: string
  }): Promise<PeerOut> {
    return this.request<PeerOut>('POST', '/api/me/peers', {
      body: {
        name: params.name,
        public_key: params.publicKey,
        client_label: params.clientLabel
      }
    })
  }

  // ── Private helpers ──────────────────────────────────────────────────────────

  /** Make an authenticated JSON request, with one retry on 401. */
  private async request<T>(
    method: string,
    path: string,
    opts: { body?: unknown; headers?: Record<string, string>; skipAuthRefresh?: boolean } = {}
  ): Promise<T> {
    await this.ensureFreshToken()

    const res = await this.rawRequest(method, path, opts)

    if (res.status === 401 && !opts.skipAuthRefresh) {
      // Attempt token refresh and retry once
      await this.refreshTokens()
      const retryRes = await this.rawRequest(method, path, opts)
      if (retryRes.status === 401) {
        this.onAuthExpired()
        throw new Error('Session expired — please log in again')
      }
      if (!retryRes.ok) {
        const data = (await retryRes.json().catch(() => ({}))) as { detail?: string }
        throw new Error(data.detail ?? `Request failed (${retryRes.status})`)
      }
      return retryRes.json() as Promise<T>
    }

    if (res.status === 403) {
      const data = (await res.json().catch(() => ({}))) as { detail?: string }
      throw new Error(data.detail ?? 'Self-service peer creation is disabled on this server')
    }

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { detail?: string }
      throw new Error(data.detail ?? `Request failed (${res.status})`)
    }

    if (res.status === 204) return undefined as unknown as T
    return res.json() as Promise<T>
  }

  /** Low-level fetch with auth headers, no retry logic. */
  private rawRequest(
    method: string,
    path: string,
    opts: { body?: unknown; headers?: Record<string, string> } = {}
  ): Promise<Response> {
    const url = this.profile.apiBaseUrl.replace(/\/$/, '') + path
    return fetch(url, {
      method,
      headers: {
        'Authorization': `Bearer ${this.profile.accessToken}`,
        'Content-Type': 'application/json',
        'User-Agent': `ODNConnect/${app.getVersion()}`,
        ...opts.headers
      },
      body: opts.body != null ? JSON.stringify(opts.body) : undefined
    })
  }

  /** Proactively refresh if the token expires within 120 seconds. */
  private async ensureFreshToken(): Promise<void> {
    if (this.profile.tokenExpiresAt - Date.now() < 120_000) {
      await this.refreshTokens()
    }
  }

  /** Refresh both tokens and persist the updated profile. */
  private async refreshTokens(): Promise<void> {
    const url = this.profile.apiBaseUrl.replace(/\/$/, '')
    const res = await fetch(`${url}/api/auth/refresh`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': `ODNConnect/${app.getVersion()}`
      },
      body: JSON.stringify({ refresh_token: this.profile.refreshToken })
    })

    if (!res.ok) {
      this.onAuthExpired()
      throw new Error('Token refresh failed — please log in again')
    }

    const tokens = (await res.json()) as TokenResponse
    this.profile.accessToken = tokens.access_token
    this.profile.refreshToken = tokens.refresh_token
    this.profile.tokenExpiresAt = Date.now() + tokens.expires_in * 1000
    saveServerProfile(this.profile)
  }
}
