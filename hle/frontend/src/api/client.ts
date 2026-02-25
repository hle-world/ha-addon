export interface TunnelStatus {
  id: string
  service_url: string
  label: string
  auth_mode: 'sso' | 'none'
  relay_host: string
  state: 'RUNNING' | 'STOPPED' | 'STARTING' | 'FATAL' | 'UNKNOWN'
  public_url: string | null
  pid: number | null
}

export interface AccessRule {
  id: number
  allowed_email: string
  provider: string
  created_at: string
}

export interface AddonConfig {
  api_key_set: boolean
  api_key_masked: string
  relay_host: string
}

const base = './api'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${base}${path}`, {
    headers: { 'Content-Type': 'application/json', ...init?.headers },
    ...init,
  })
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    throw new Error(`${res.status}: ${text}`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// Tunnels
export const getTunnels = () => request<TunnelStatus[]>('/tunnels')

export const addTunnel = (body: { service_url: string; label: string; auth_mode: string }) =>
  request<TunnelStatus>('/tunnels', { method: 'POST', body: JSON.stringify(body) })

export const removeTunnel = (id: string) =>
  request<void>(`/tunnels/${id}`, { method: 'DELETE' })

export const startTunnel = (id: string) =>
  request<void>(`/tunnels/${id}/start`, { method: 'POST' })

export const stopTunnel = (id: string) =>
  request<void>(`/tunnels/${id}/stop`, { method: 'POST' })

// Access rules
export const getAccessRules = (subdomain: string) =>
  request<AccessRule[]>(`/tunnels/${subdomain}/access`)

export const addAccessRule = (subdomain: string, email: string, provider: string) =>
  request<AccessRule>(`/tunnels/${subdomain}/access`, {
    method: 'POST',
    body: JSON.stringify({ email, provider }),
  })

export const deleteAccessRule = (subdomain: string, ruleId: number) =>
  request<void>(`/tunnels/${subdomain}/access/${ruleId}`, { method: 'DELETE' })

// Config
export const getConfig = () => request<AddonConfig>('/config')

export const updateConfig = (api_key: string, relay_host: string) =>
  request<void>('/config', { method: 'POST', body: JSON.stringify({ api_key, relay_host }) })
