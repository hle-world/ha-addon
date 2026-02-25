import { useEffect, useState } from 'react'
import { getConfig, updateConfig } from '../api/client'

const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }
const label: React.CSSProperties = { fontSize: 13, color: '#9ca3af', fontWeight: 500 }
const input: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 7, border: '1px solid #2d3139',
  background: '#1e2128', color: '#e0e0e0', fontSize: 14, width: '100%',
}
const btn: React.CSSProperties = {
  padding: '8px 18px', borderRadius: 7, border: 'none', cursor: 'pointer',
  background: '#3b82f6', color: '#fff', fontSize: 14, fontWeight: 500, alignSelf: 'flex-start',
}

export function Settings() {
  const [apiKey, setApiKey] = useState('')
  const [relayHost, setRelayHost] = useState('hle.world')
  const [masked, setMasked] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    getConfig().then(cfg => {
      setRelayHost(cfg.relay_host)
      setMasked(cfg.api_key_masked)
    }).catch(e => setError(String(e)))
  }, [])

  async function save() {
    setError('')
    setSaved(false)
    try {
      await updateConfig(apiKey, relayHost)
      setSaved(true)
      setApiKey('')
      const cfg = await getConfig()
      setMasked(cfg.api_key_masked)
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 480 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Settings</h1>

      <div style={field}>
        <label style={label}>API Key</label>
        {masked && (
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 4 }}>
            Current: <code style={{ color: '#9ca3af' }}>{masked}</code>
          </p>
        )}
        <input
          style={input}
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          placeholder="hle_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
        />
        <span style={{ fontSize: 12, color: '#6b7280' }}>
          Get your API key at{' '}
          <a href="https://hle.world/dashboard" target="_blank" rel="noreferrer"
            style={{ color: '#60a5fa' }}>hle.world/dashboard</a>
        </span>
      </div>

      <div style={field}>
        <label style={label}>Relay Host</label>
        <input
          style={input}
          value={relayHost}
          onChange={e => setRelayHost(e.target.value)}
          placeholder="hle.world"
        />
      </div>

      {error && <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}
      {saved && <p style={{ color: '#4ade80', fontSize: 13 }}>Saved. Tunnels will use the new key on next start.</p>}

      <button style={btn} onClick={save} disabled={!apiKey && !relayHost}>
        Save
      </button>
    </div>
  )
}
