import { useState } from 'react'
import type { TunnelStatus, AccessRule, ShareLink } from '../api/client'
import {
  startTunnel, stopTunnel, removeTunnel,
  getAccessRules, addAccessRule, deleteAccessRule,
  getPinStatus, setPin, removePin,
  getShareLinks, createShareLink, deleteShareLink,
  getTunnelLogs,
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
const row: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }
const section: React.CSSProperties = {
  borderTop: '1px solid #2d3139', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8,
}
const sectionTitle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#9ca3af', marginBottom: 2 }
const btn = (variant: 'primary' | 'danger' | 'ghost' | 'active'): React.CSSProperties => ({
  padding: '5px 12px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 12,
  background: variant === 'primary' ? '#3b82f6' : variant === 'danger' ? '#ef4444' : variant === 'active' ? '#1d4ed8' : '#2d3139',
  color: '#fff', whiteSpace: 'nowrap',
})
const inputSm: React.CSSProperties = {
  padding: '5px 10px', borderRadius: 6, border: '1px solid #2d3139',
  background: '#111318', color: '#e0e0e0', fontSize: 13,
}

type Panel = 'access' | 'pin' | 'share' | 'logs' | null

export function TunnelCard({ tunnel, onRefresh }: Props) {
  const [panel, setPanel] = useState<Panel>(null)
  const [error, setError] = useState('')

  // Access rules state
  const [rules, setRules] = useState<AccessRule[] | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [newProvider, setNewProvider] = useState('any')

  // PIN state
  const [hasPin, setHasPin] = useState<boolean | null>(null)
  const [newPin, setNewPin] = useState('')

  // Share links state
  const [shareLinks, setShareLinks] = useState<ShareLink[] | null>(null)
  const [shareDuration, setShareDuration] = useState<'1h' | '24h' | '7d'>('24h')
  const [shareLabel, setShareLabel] = useState('')
  const [newShareUrl, setNewShareUrl] = useState<string | null>(null)

  // Logs state
  const [logs, setLogs] = useState<string[] | null>(null)

  const sub = tunnel.subdomain

  async function togglePanel(p: Panel) {
    setError('')
    setNewShareUrl(null)
    if (panel === p) { setPanel(null); return }
    setPanel(p)
    if (!sub) return
    try {
      if (p === 'access' && rules === null) setRules(await getAccessRules(sub))
      if (p === 'pin' && hasPin === null) {
        const s = await getPinStatus(sub)
        setHasPin(s.has_pin)
      }
      if (p === 'share' && shareLinks === null) setShareLinks(await getShareLinks(sub))
      if (p === 'logs') setLogs((await getTunnelLogs(tunnel.id)).lines)
    } catch (e) { setError(String(e)) }
  }

  async function handleAddRule() {
    if (!sub || !newEmail) return
    try {
      const rule = await addAccessRule(sub, newEmail, newProvider)
      setRules(prev => [...(prev ?? []), rule])
      setNewEmail('')
    } catch (e) { setError(String(e)) }
  }

  async function handleDeleteRule(id: number) {
    if (!sub) return
    await deleteAccessRule(sub, id)
    setRules(prev => (prev ?? []).filter(r => r.id !== id))
  }

  async function handleSetPin() {
    if (!sub || !newPin) return
    try {
      await setPin(sub, newPin)
      setHasPin(true)
      setNewPin('')
    } catch (e) { setError(String(e)) }
  }

  async function handleRemovePin() {
    if (!sub) return
    await removePin(sub)
    setHasPin(false)
  }

  async function handleCreateShare() {
    if (!sub) return
    try {
      const result = await createShareLink(sub, { duration: shareDuration, label: shareLabel })
      setNewShareUrl(result.share_url)
      setShareLinks(await getShareLinks(sub))
    } catch (e) { setError(String(e)) }
  }

  async function handleDeleteShare(id: number) {
    if (!sub) return
    await deleteShareLink(sub, id)
    setShareLinks(prev => (prev ?? []).filter(l => l.id !== id))
  }

  const isSso = tunnel.auth_mode === 'sso'

  return (
    <div style={card}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>
            {tunnel.label}
            <span style={{ color: '#6b7280', fontWeight: 400, marginLeft: 8, fontSize: 13 }}>
              {isSso ? '🔒 SSO' : '🌐 Open'}
            </span>
          </span>
          <span style={{ color: '#9ca3af', fontSize: 12 }}>{tunnel.service_url}</span>
          {tunnel.subdomain && (
            <span style={{ color: '#6b7280', fontSize: 12, fontFamily: 'monospace' }}>
              {tunnel.subdomain}.hle.world
            </span>
          )}
          {tunnel.public_url && (
            <a href={tunnel.public_url} target="_blank" rel="noreferrer"
              style={{ color: '#60a5fa', fontSize: 13 }}>
              {tunnel.public_url}
            </a>
          )}
        </div>
        <StatusBadge state={tunnel.state} />
      </div>

      {/* Action buttons */}
      <div style={row}>
        {tunnel.state === 'RUNNING'
          ? <button style={btn('ghost')} onClick={() => stopTunnel(tunnel.id).then(onRefresh)}>Stop</button>
          : <button style={btn('primary')} onClick={() => startTunnel(tunnel.id).then(onRefresh)}>Start</button>
        }
        {sub && isSso && (
          <button style={btn(panel === 'access' ? 'active' : 'ghost')} onClick={() => togglePanel('access')}>
            Access Rules
          </button>
        )}
        {sub && isSso && (
          <button style={btn(panel === 'pin' ? 'active' : 'ghost')} onClick={() => togglePanel('pin')}>
            PIN
          </button>
        )}
        {sub && (
          <button style={btn(panel === 'share' ? 'active' : 'ghost')} onClick={() => togglePanel('share')}>
            Share
          </button>
        )}
        <button style={btn(panel === 'logs' ? 'active' : 'ghost')} onClick={() => togglePanel('logs')}>
          Logs
        </button>
        <button style={{ ...btn('danger'), marginLeft: 'auto' }}
          onClick={() => removeTunnel(tunnel.id).then(onRefresh)}>
          Remove
        </button>
      </div>

      {error && <p style={{ color: '#f87171', fontSize: 13, margin: 0 }}>{error}</p>}

      {/* Access Rules panel */}
      {panel === 'access' && (
        <div style={section}>
          <span style={sectionTitle}>SSO Allow-list</span>
          {!sub
            ? <span style={{ color: '#6b7280', fontSize: 13 }}>Tunnel not yet connected — subdomain unknown.</span>
            : <>
              {(rules ?? []).length === 0 && (
                <span style={{ color: '#6b7280', fontSize: 13 }}>No rules — all SSO users are allowed.</span>
              )}
              {(rules ?? []).map(r => (
                <div key={r.id} style={{ ...row, justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 13 }}>
                    {r.allowed_email}
                    <span style={{ color: '#6b7280', marginLeft: 6 }}>via {r.provider}</span>
                  </span>
                  <button style={{ ...btn('danger'), padding: '2px 8px' }} onClick={() => handleDeleteRule(r.id)}>✕</button>
                </div>
              ))}
              <div style={row}>
                <input value={newEmail} onChange={e => setNewEmail(e.target.value)}
                  placeholder="email@example.com" style={{ ...inputSm, flex: 1 }} />
                <select value={newProvider} onChange={e => setNewProvider(e.target.value)} style={inputSm}>
                  {['any', 'google', 'github', 'hle'].map(p => <option key={p}>{p}</option>)}
                </select>
                <button style={btn('primary')} onClick={handleAddRule}>Add</button>
              </div>
            </>
          }
        </div>
      )}

      {/* PIN panel */}
      {panel === 'pin' && (
        <div style={section}>
          <span style={sectionTitle}>PIN Protection</span>
          {!sub
            ? <span style={{ color: '#6b7280', fontSize: 13 }}>Tunnel not yet connected — subdomain unknown.</span>
            : <>
              <span style={{ fontSize: 13, color: hasPin ? '#4ade80' : '#6b7280' }}>
                {hasPin ? '🔐 PIN is set' : 'No PIN — visitors only need SSO login'}
              </span>
              <div style={row}>
                <input value={newPin} onChange={e => setNewPin(e.target.value)}
                  placeholder="4-8 digits" type="password" style={{ ...inputSm, width: 120 }} />
                <button style={btn('primary')} onClick={handleSetPin} disabled={!newPin}>
                  {hasPin ? 'Update PIN' : 'Set PIN'}
                </button>
                {hasPin && <button style={btn('danger')} onClick={handleRemovePin}>Remove PIN</button>}
              </div>
            </>
          }
        </div>
      )}

      {/* Share Links panel */}
      {panel === 'share' && (
        <div style={section}>
          <span style={sectionTitle}>Share Links</span>
          {!sub
            ? <span style={{ color: '#6b7280', fontSize: 13 }}>Tunnel not yet connected — subdomain unknown.</span>
            : <>
              {newShareUrl && (
                <div style={{ background: '#052e16', border: '1px solid #166534', borderRadius: 6, padding: '8px 12px' }}>
                  <span style={{ fontSize: 12, color: '#4ade80', display: 'block', marginBottom: 4 }}>Link created:</span>
                  <a href={newShareUrl} target="_blank" rel="noreferrer" style={{ color: '#60a5fa', fontSize: 13, wordBreak: 'break-all' }}>{newShareUrl}</a>
                </div>
              )}
              <div style={row}>
                <input value={shareLabel} onChange={e => setShareLabel(e.target.value)}
                  placeholder="Label (optional)" style={{ ...inputSm, flex: 1 }} />
                <select value={shareDuration} onChange={e => setShareDuration(e.target.value as '1h' | '24h' | '7d')} style={inputSm}>
                  {['1h', '24h', '7d'].map(d => <option key={d}>{d}</option>)}
                </select>
                <button style={btn('primary')} onClick={handleCreateShare}>Create</button>
              </div>
              {(shareLinks ?? []).length === 0
                ? <span style={{ color: '#6b7280', fontSize: 13 }}>No active share links.</span>
                : (shareLinks ?? []).map(l => (
                  <div key={l.id} style={{ ...row, justifyContent: 'space-between', fontSize: 13 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                      <span style={{ color: l.is_active ? '#e0e0e0' : '#6b7280' }}>
                        {l.label || `Link #${l.id}`}
                        <span style={{ color: '#6b7280', marginLeft: 8 }}>expires {new Date(l.expires_at).toLocaleDateString()}</span>
                        {l.max_uses && <span style={{ color: '#6b7280', marginLeft: 8 }}>{l.use_count}/{l.max_uses} uses</span>}
                      </span>
                    </div>
                    <button style={{ ...btn('danger'), padding: '2px 8px' }} onClick={() => handleDeleteShare(l.id)}>✕</button>
                  </div>
                ))
              }
            </>
          }
        </div>
      )}

      {/* Logs panel */}
      {panel === 'logs' && (
        <div style={section}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={sectionTitle}>Tunnel Logs</span>
            <button style={{ ...btn('ghost'), fontSize: 11 }}
              onClick={async () => setLogs((await getTunnelLogs(tunnel.id)).lines)}>
              Refresh
            </button>
          </div>
          <pre style={{
            background: '#0d1117', borderRadius: 6, padding: '10px 12px',
            fontSize: 11, color: '#9ca3af', overflowX: 'auto', maxHeight: 280,
            overflowY: 'auto', margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {(logs ?? []).length === 0
              ? 'No log output yet.'
              : (logs ?? []).join('\n')}
          </pre>
        </div>
      )}
    </div>
  )
}
