import { useEffect, useState } from 'react'
import { getConfig, updateConfig, getNetworkInfo, type NetworkInfo } from '../api/client'

const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 }
const labelStyle: React.CSSProperties = { fontSize: 13, color: '#9ca3af', fontWeight: 500 }
const input: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 7, border: '1px solid #2d3139',
  background: '#1e2128', color: '#e0e0e0', fontSize: 14, width: '100%',
}
const btn: React.CSSProperties = {
  padding: '8px 18px', borderRadius: 7, border: 'none', cursor: 'pointer',
  background: '#3b82f6', color: '#fff', fontSize: 14, fontWeight: 500, alignSelf: 'flex-start',
}
const section: React.CSSProperties = {
  borderTop: '1px solid #2d3139', paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 12,
}
const sectionTitle: React.CSSProperties = { fontSize: 15, fontWeight: 700, color: '#e0e0e0' }
const pre: React.CSSProperties = {
  background: '#0d1117', borderRadius: 6, padding: '10px 14px',
  fontSize: 12, color: '#9ca3af', fontFamily: 'monospace', whiteSpace: 'pre', overflowX: 'auto',
  margin: 0, lineHeight: 1.6,
}
const copyBtn: React.CSSProperties = {
  padding: '4px 12px', borderRadius: 5, border: '1px solid #374151', cursor: 'pointer',
  background: '#1e2128', color: '#9ca3af', fontSize: 12, alignSelf: 'flex-start',
}

export function Settings() {
  const [apiKey, setApiKey] = useState('')
  const [masked, setMasked] = useState('')
  const [apiKeySet, setApiKeySet] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [netInfo, setNetInfo] = useState<NetworkInfo | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getConfig().then(cfg => {
      setMasked(cfg.api_key_masked)
      setApiKeySet(cfg.api_key_set)
    }).catch(e => setError(String(e)))

    getNetworkInfo().then(setNetInfo).catch(() => {/* non-critical */})
  }, [])

  async function save() {
    setError('')
    setSaved(false)
    try {
      await updateConfig(apiKey)
      setSaved(true)
      setApiKey('')
      const cfg = await getConfig()
      setMasked(cfg.api_key_masked)
      setApiKeySet(cfg.api_key_set)
    } catch (e) {
      setError(String(e))
    }
  }

  const subnet = netInfo?.trusted_subnet ?? '172.30.32.0/23'
  const haYaml = `homeassistant:
  external_url: "https://<your-tunnel>.hle.world"

http:
  use_x_forwarded_for: true
  trusted_proxies:
    - ${subnet}`

  function copyYaml() {
    navigator.clipboard.writeText(haYaml).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 520 }}>
      <h1 style={{ fontSize: 20, fontWeight: 700 }}>Settings</h1>

      {!apiKeySet && (
        <div style={{ background: '#422006', border: '1px solid #92400e', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#fbbf24' }}>
          No API key configured. Add your key below to start using tunnels.
        </div>
      )}

      <div style={field}>
        <label style={labelStyle}>API Key</label>
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
          New user?{' '}
          <a href="https://hle.world/register" target="_blank" rel="noreferrer"
            style={{ color: '#60a5fa' }}>Create a free account</a>
          {' '}· then find your key at{' '}
          <a href="https://hle.world/dashboard" target="_blank" rel="noreferrer"
            style={{ color: '#60a5fa' }}>hle.world/dashboard</a>
        </span>
      </div>

      {error && <p style={{ color: '#f87171', fontSize: 13 }}>{error}</p>}
      {saved && <p style={{ color: '#4ade80', fontSize: 13 }}>Saved. Tunnels will use the new key on next start.</p>}

      <button style={btn} onClick={save} disabled={!apiKey}>Save</button>

      {/* HA reverse-proxy configuration */}
      <div style={section}>
        <span style={sectionTitle}>Home Assistant Setup</span>
        <p style={{ fontSize: 13, color: '#9ca3af', margin: 0 }}>
          To expose Home Assistant through an HLE tunnel, add the following to your{' '}
          <code style={{ color: '#e0e0e0' }}>configuration.yaml</code>{' '}
          and restart Home Assistant core.
        </p>

        {netInfo?.addon_ip && (
          <div style={{ fontSize: 12, color: '#6b7280' }}>
            Detected addon IP: <code style={{ color: '#9ca3af' }}>{netInfo.addon_ip}</code>
            {' '}→ subnet: <code style={{ color: '#9ca3af' }}>{netInfo.trusted_subnet}</code>
          </div>
        )}

        <pre style={pre}>{haYaml}</pre>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button style={copyBtn} onClick={copyYaml}>
            {copied ? '✓ Copied!' : 'Copy YAML'}
          </button>
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            Replace <code style={{ color: '#9ca3af' }}>&lt;your-tunnel&gt;</code> with your tunnel's subdomain
          </span>
        </div>

        <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
          After saving, go to <strong style={{ color: '#9ca3af' }}>Settings → System → Restart</strong> in Home Assistant.
        </p>
      </div>
    </div>
  )
}
