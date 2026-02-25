import { useState } from 'react'
import { Dashboard } from './pages/Dashboard'
import { Settings } from './pages/Settings'

type Page = 'dashboard' | 'settings'

const nav: React.CSSProperties = {
  display: 'flex', gap: 2, padding: '0 24px',
  borderBottom: '1px solid #2d3139', background: '#161820',
}
const navBtn = (active: boolean): React.CSSProperties => ({
  padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer',
  color: active ? '#60a5fa' : '#9ca3af', fontSize: 14, fontWeight: active ? 600 : 400,
  borderBottom: active ? '2px solid #3b82f6' : '2px solid transparent',
  marginBottom: -1,
})

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ padding: '16px 24px 0', background: '#161820' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 20 }}>🌐</span>
          <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-0.3px' }}>
            Home Lab Everywhere
          </span>
        </div>
        <nav style={nav}>
          <button style={navBtn(page === 'dashboard')} onClick={() => setPage('dashboard')}>
            Tunnels
          </button>
          <button style={navBtn(page === 'settings')} onClick={() => setPage('settings')}>
            Settings
          </button>
        </nav>
      </header>

      <main style={{ flex: 1, padding: 24 }}>
        {page === 'dashboard' ? <Dashboard /> : <Settings />}
      </main>
    </div>
  )
}
