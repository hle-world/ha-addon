import { useState } from 'react'
import type { TunnelStatus, AccessRule } from '../api/client'
import {
  startTunnel, stopTunnel, removeTunnel,
  getAccessRules, addAccessRule, deleteAccessRule,
} from '../api/client'
import { StatusBadge } from './StatusBadge'

interface Props {
  tunnel: TunnelStatus
  onRefresh: () => void
}

const card: React.CSSProperties = {
  background: '#1e2128', border: '1px solid #2d3139', borderRadius: 10,
  padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10,
}
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10 }
const btn = (variant: 'primary' | 'danger' | 'ghost'): React.CSSProperties => ({
  padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 13,
  background: variant === 'primary' ? '#3b82f6' : variant === 'danger' ? '#ef4444' : '#2d3139',
  color: '#fff',
})

export function TunnelCard({ tunnel, onRefresh }: Props) {
  const [rules, setRules] = useState<AccessRule[] | null>(null)
  const [loadingRules, setLoadingRules] = useState(false)
  const [newEmail, setNewEmail] = useState('')
  const [newProvider, setNewProvider] = useState('any')
  const [error, setError] = useState('')

  const isRunning = tunnel.state === 'RUNNING'
  // The live subdomain comes from the relay; we derive it from the public_url if available
  const subdomain = tunnel.public_url
    ? new URL(tunnel.public_url).hostname.split('.')[0]
    : null

  async function toggleRules() {
    if (rules !== null) { setRules(null); return }
    if (!subdomain) return
    setLoadingRules(true)
    try {
      setRules(await getAccessRules(subdomain))
    } catch (e) {
      setError(String(e))
    } finally {
      setLoadingRules(false)
    }
  }

  async function handleAddRule() {
    if (!subdomain || !newEmail) return
    try {
      const rule = await addAccessRule(subdomain, newEmail, newProvider)
      setRules(prev => [...(prev ?? []), rule])
      setNewEmail('')
    } catch (e) {
      setError(String(e))
    }
  }

  async function handleDeleteRule(ruleId: number) {
    if (!subdomain) return
    await deleteAccessRule(subdomain, ruleId)
    setRules(prev => (prev ?? []).filter(r => r.id !== ruleId))
  }

  return (
    <div style={card}>
      <div style={{ ...row, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>
            {tunnel.label}
            <span style={{ color: '#6b7280', fontWeight: 400, marginLeft: 8, fontSize: 13 }}>
              {tunnel.auth_mode === 'sso' ? '🔒 SSO' : '🌐 Open'}
            </span>
          </span>
          <span style={{ color: '#9ca3af', fontSize: 13 }}>{tunnel.service_url}</span>
          {tunnel.public_url && (
            <a href={tunnel.public_url} target="_blank" rel="noreferrer"
              style={{ color: '#60a5fa', fontSize: 13 }}>
              {tunnel.public_url}
            </a>
          )}
        </div>
        <StatusBadge state={tunnel.state} />
      </div>

      <div style={row}>
        {isRunning
          ? <button style={btn('ghost')} onClick={() => stopTunnel(tunnel.id).then(onRefresh)}>Stop</button>
          : <button style={btn('primary')} onClick={() => startTunnel(tunnel.id).then(onRefresh)}>Start</button>
        }
        {subdomain && tunnel.auth_mode === 'sso' && (
          <button style={btn('ghost')} onClick={toggleRules}>
            {loadingRules ? '...' : rules !== null ? 'Hide Access' : 'Access Rules'}
          </button>
        )}
        <button style={{ ...btn('danger'), marginLeft: 'auto' }}
          onClick={() => removeTunnel(tunnel.id).then(onRefresh)}>
          Remove
        </button>
      </div>

      {error && <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}

      {rules !== null && (
        <div style={{ borderTop: '1px solid #2d3139', paddingTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#9ca3af' }}>SSO Allow-list</span>
          {rules.length === 0 && <span style={{ color: '#6b7280', fontSize: 13 }}>No rules yet — everyone with SSO access is allowed.</span>}
          {rules.map(r => (
            <div key={r.id} style={{ ...row, justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13 }}>{r.allowed_email} <span style={{ color: '#6b7280' }}>({r.provider})</span></span>
              <button style={{ ...btn('danger'), padding: '2px 8px', fontSize: 12 }}
                onClick={() => handleDeleteRule(r.id)}>✕</button>
            </div>
          ))}
          <div style={row}>
            <input value={newEmail} onChange={e => setNewEmail(e.target.value)}
              placeholder="email@example.com"
              style={{ flex: 1, padding: '5px 10px', borderRadius: 6, border: '1px solid #2d3139', background: '#111318', color: '#e0e0e0', fontSize: 13 }} />
            <select value={newProvider} onChange={e => setNewProvider(e.target.value)}
              style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid #2d3139', background: '#111318', color: '#e0e0e0', fontSize: 13 }}>
              {['any', 'google', 'github', 'hle'].map(p => <option key={p}>{p}</option>)}
            </select>
            <button style={btn('primary')} onClick={handleAddRule}>Add</button>
          </div>
        </div>
      )}
    </div>
  )
}
