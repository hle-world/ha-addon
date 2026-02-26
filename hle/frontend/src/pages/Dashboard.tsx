import { useEffect, useState } from 'react'
import type { TunnelStatus, AddonConfig } from '../api/client'
import { getTunnels, getConfig } from '../api/client'
import { TunnelCard } from '../components/TunnelCard'
import { AddTunnelModal } from '../components/AddTunnelModal'

const btn: React.CSSProperties = {
  padding: '8px 18px', borderRadius: 7, border: 'none', cursor: 'pointer',
  background: '#3b82f6', color: '#fff', fontSize: 14, fontWeight: 500,
}
const btnDisabled: React.CSSProperties = {
  ...btn, background: '#2d3139', color: '#6b7280', cursor: 'not-allowed',
}

export function Dashboard() {
  const [tunnels, setTunnels] = useState<TunnelStatus[]>([])
  const [config, setConfig] = useState<AddonConfig | null>(null)
  const [showAdd, setShowAdd] = useState(false)
  const [error, setError] = useState('')

  async function load() {
    try {
      setTunnels(await getTunnels())
    } catch (e) {
      setError(String(e))
    }
  }

  useEffect(() => {
    getConfig().then(setConfig).catch(() => null)
    load()
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [])

  const noKey = config !== null && !config.api_key_set

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Tunnels</h1>
        <button
          style={noKey ? btnDisabled : btn}
          onClick={() => !noKey && setShowAdd(true)}
          title={noKey ? 'Set your API key in Settings first' : undefined}
        >
          + Add Tunnel
        </button>
      </div>

      {noKey && (
        <div style={{ background: '#422006', border: '1px solid #92400e', borderRadius: 8, padding: '10px 14px', fontSize: 13, color: '#fbbf24' }}>
          No API key configured. Go to <strong>Settings</strong> to add your key before creating tunnels.
        </div>
      )}

      {error && <p style={{ color: '#f87171', fontSize: 14 }}>{error}</p>}

      {tunnels.length === 0 && !error && !noKey && (
        <div style={{ color: '#6b7280', fontSize: 14, padding: '20px 0' }}>
          No tunnels yet. Click <strong>+ Add Tunnel</strong> to expose a service.
        </div>
      )}

      {tunnels.map(t => (
        <TunnelCard key={t.id} tunnel={t} onRefresh={load} />
      ))}

      {showAdd && (
        <AddTunnelModal onClose={() => setShowAdd(false)} onAdded={() => { setShowAdd(false); load() }} />
      )}
    </div>
  )
}
