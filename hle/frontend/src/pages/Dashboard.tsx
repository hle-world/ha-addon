import { useEffect, useState } from 'react'
import type { TunnelStatus } from '../api/client'
import { getTunnels } from '../api/client'
import { TunnelCard } from '../components/TunnelCard'
import { AddTunnelModal } from '../components/AddTunnelModal'

const btn: React.CSSProperties = {
  padding: '8px 18px', borderRadius: 7, border: 'none', cursor: 'pointer',
  background: '#3b82f6', color: '#fff', fontSize: 14, fontWeight: 500,
}

export function Dashboard() {
  const [tunnels, setTunnels] = useState<TunnelStatus[]>([])
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
    load()
    // Poll every 5s for live status updates
    const id = setInterval(load, 5000)
    return () => clearInterval(id)
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700 }}>Tunnels</h1>
        <button style={btn} onClick={() => setShowAdd(true)}>+ Add Tunnel</button>
      </div>

      {error && <p style={{ color: '#f87171', fontSize: 14 }}>{error}</p>}

      {tunnels.length === 0 && !error && (
        <div style={{ color: '#6b7280', fontSize: 14, padding: '20px 0' }}>
          No tunnels yet. Click <strong>+ Add Tunnel</strong> to expose a service, or use the
          quick-add to expose Home Assistant.
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
