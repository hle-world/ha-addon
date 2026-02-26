import { useState } from 'react'
import { addTunnel } from '../api/client'

interface Props {
  onClose: () => void
  onAdded: () => void
}

const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
  display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
}
const modal: React.CSSProperties = {
  background: '#1e2128', border: '1px solid #2d3139', borderRadius: 12,
  padding: 28, width: 420, display: 'flex', flexDirection: 'column', gap: 16,
}
const fieldStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }
const labelStyle: React.CSSProperties = { fontSize: 13, color: '#9ca3af', fontWeight: 500 }
const inputStyle: React.CSSProperties = {
  padding: '7px 12px', borderRadius: 7, border: '1px solid #2d3139',
  background: '#111318', color: '#e0e0e0', fontSize: 14,
}
const btn = (primary: boolean): React.CSSProperties => ({
  padding: '8px 18px', borderRadius: 7, border: 'none', cursor: 'pointer',
  background: primary ? '#3b82f6' : '#2d3139', color: '#fff', fontSize: 14, fontWeight: 500,
})

const HA_PRESET = { service_url: 'http://homeassistant.local.hass.io:8123', label: 'ha', name: 'Home Assistant', auth_mode: 'sso' as const }

export function AddTunnelModal({ onClose, onAdded }: Props) {
  const [serviceUrl, setServiceUrl] = useState('')
  const [label, setLabel] = useState('')
  const [name, setName] = useState('')
  const [authMode, setAuthMode] = useState<'sso' | 'none'>('sso')
  const [verifySsl, setVerifySsl] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit() {
    setLoading(true)
    setError('')
    try {
      await addTunnel({ service_url: serviceUrl, label, name: name || undefined, auth_mode: authMode, verify_ssl: verifySsl })
      onAdded()
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={overlay} onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={modal}>
        <h2 style={{ fontSize: 17, fontWeight: 700 }}>Add Tunnel</h2>

        <button style={{ ...btn(false), textAlign: 'left', padding: '10px 14px', border: '1px dashed #3b82f6' }}
          onClick={() => { setServiceUrl(HA_PRESET.service_url); setLabel(HA_PRESET.label); setName(HA_PRESET.name); setAuthMode(HA_PRESET.auth_mode) }}
          disabled={loading}>
          ⚡ Quick-fill: Expose Home Assistant
        </button>

        <hr style={{ border: 'none', borderTop: '1px solid #2d3139' }} />

        <div style={fieldStyle}>
          <label style={labelStyle}>Service URL</label>
          <input style={inputStyle} value={serviceUrl} onChange={e => setServiceUrl(e.target.value)}
            placeholder="http://192.168.1.50:8096" />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Name <span style={{ color: '#6b7280', fontWeight: 400 }}>(display only, optional)</span></label>
          <input style={inputStyle} value={name} onChange={e => setName(e.target.value)}
            placeholder="e.g. Proxmox, Jellyfin, Home Assistant" />
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Label <span style={{ color: '#6b7280', fontWeight: 400 }}>(used in subdomain)</span></label>
          <input style={inputStyle} value={label} onChange={e => setLabel(e.target.value)}
            placeholder="jellyfin" />
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            Subdomain: <code style={{ color: '#9ca3af' }}>{label || 'label'}-xxx.hle.world</code>
          </span>
        </div>

        <div style={fieldStyle}>
          <label style={labelStyle}>Auth mode</label>
          <div style={{ display: 'flex', gap: 10 }}>
            {(['sso', 'none'] as const).map(m => (
              <label key={m} style={{ display: 'flex', gap: 6, alignItems: 'center', cursor: 'pointer', fontSize: 14 }}>
                <input type="radio" value={m} checked={authMode === m} onChange={() => setAuthMode(m)} />
                {m === 'sso' ? '🔒 SSO (recommended)' : '🌐 Open'}
              </label>
            ))}
          </div>
          {authMode === 'sso' && (
            <span style={{ fontSize: 12, color: '#6b7280' }}>
              After creating, use Access Rules to restrict to specific emails.
            </span>
          )}
        </div>

        <label style={{ display: 'flex', gap: 8, alignItems: 'center', cursor: 'pointer', fontSize: 14 }}>
          <input type="checkbox" checked={verifySsl} onChange={e => setVerifySsl(e.target.checked)} />
          <span>Verify SSL certificate</span>
          <span
            title="By default, SSL verification is disabled so self-signed certificates (common on Proxmox, Unraid, TrueNAS, etc.) work without extra setup. Enable this only if your service has a valid certificate from a trusted CA."
            style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 16, height: 16, borderRadius: '50%', background: '#2d3139', color: '#9ca3af', fontSize: 11, fontWeight: 700, cursor: 'help', userSelect: 'none' }}
          >?</span>
        </label>

        {error && <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button style={btn(false)} onClick={onClose}>Cancel</button>
          <button style={btn(true)} onClick={submit} disabled={loading || !serviceUrl || !label}>
            {loading ? 'Adding...' : 'Add Tunnel'}
          </button>
        </div>
      </div>
    </div>
  )
}
