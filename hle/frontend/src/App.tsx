import { useEffect, useState, useCallback } from 'react'
import type { TunnelStatus, HaSetupStatus, HaSetupApplyResult } from './api/client'
import {
  getConfig, updateConfig,
  getTunnels,
  getHaSetupStatus, applyHaSetup, restartHaCore, pingHa,
} from './api/client'
import { TunnelCard } from './components/TunnelCard'
import { AddTunnelModal } from './components/AddTunnelModal'

// ---------------------------------------------------------------------------
// Shared styles
// ---------------------------------------------------------------------------
const colors = {
  bg: '#111318', surface: '#1e2128', border: '#2d3139',
  text: '#e0e0e0', muted: '#9ca3af', faint: '#6b7280',
  blue: '#3b82f6', blueDark: '#1d4ed8',
  green: '#4ade80', yellow: '#facc15', red: '#f87171',
  amber: '#fbbf24',
}

const inputStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 7, border: `1px solid ${colors.border}`,
  background: colors.surface, color: colors.text, fontSize: 14, width: '100%',
  boxSizing: 'border-box',
}
const btnPrimary: React.CSSProperties = {
  padding: '8px 18px', borderRadius: 7, border: 'none', cursor: 'pointer',
  background: colors.blue, color: '#fff', fontSize: 13, fontWeight: 600,
}
const btnGhost: React.CSSProperties = {
  ...btnPrimary, background: colors.surface, border: `1px solid ${colors.border}`,
  color: colors.muted,
}
const btnDanger: React.CSSProperties = { ...btnPrimary, background: '#ef4444' }
const btnDisabled: React.CSSProperties = {
  ...btnPrimary, background: colors.surface, color: colors.faint, cursor: 'not-allowed',
}
const codeStyle: React.CSSProperties = {
  background: '#0d1117', borderRadius: 6, padding: '10px 14px',
  fontSize: 12, color: colors.muted, fontFamily: 'monospace',
  whiteSpace: 'pre', overflowX: 'auto', margin: 0, lineHeight: 1.7,
}

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------
function Section({
  title, open, onToggle, badge, children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  badge?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div style={{ border: `1px solid ${colors.border}`, borderRadius: 10, overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', background: colors.surface, border: 'none', cursor: 'pointer',
          color: colors.text, fontSize: 15, fontWeight: 700, textAlign: 'left',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 11, color: colors.muted, transform: open ? 'rotate(90deg)' : 'none',
            display: 'inline-block', transition: 'transform 0.15s',
          }}>▶</span>
          {title}
          {badge}
        </span>
      </button>
      {open && (
        <div style={{ padding: '0 20px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {children}
        </div>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Restart banner
// ---------------------------------------------------------------------------
function RestartBanner({ onRestart, onDismiss }: { onRestart: () => void; onDismiss: () => void }) {
  const [confirming, setConfirming] = useState(false)
  const [phase, setPhase] = useState<'idle' | 'waiting_down' | 'waiting_up'>('idle')

  useEffect(() => {
    if (phase === 'idle') return
    // Poll HA ping to detect down → up transition
    let wentDown = phase === 'waiting_down' ? false : true
    const id = setInterval(async () => {
      try {
        const { alive } = await pingHa()
        if (!wentDown && !alive) wentDown = true
        if (wentDown && alive) {
          clearInterval(id)
          onDismiss()
        }
      } catch { /* addon itself unreachable — ignore */ }
    }, 2000)
    return () => clearInterval(id)
  }, [phase, onDismiss])

  async function handleRestart() {
    setPhase('waiting_down')
    try { await Promise.resolve(onRestart()) } catch { setPhase('idle') }
  }

  if (phase !== 'idle') {
    return (
      <div style={{
        background: '#1c1a07', border: `1px solid #713f12`,
        borderRadius: 10, padding: '14px 18px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 18 }}>⏳</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: colors.amber }}>
            {phase === 'waiting_down' ? 'Waiting for HA to go down…' : 'HA is restarting, waiting for it to come back up…'}
          </div>
          <div style={{ fontSize: 13, color: '#d97706', marginTop: 2 }}>
            This will clear automatically once HA is back online.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: '#451a03', border: `1px solid #92400e`,
      borderRadius: 10, padding: '14px 18px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>⚠️</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: colors.amber }}>
            Home Assistant restart required
          </div>
          <div style={{ fontSize: 13, color: '#d97706', marginTop: 2 }}>
            The proxy settings were written to <code style={{ color: colors.amber }}>configuration.yaml</code>.
            Restart HA Core to apply them.
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {!confirming ? (
          <button style={btnPrimary} onClick={() => setConfirming(true)}>
            Restart HA Now
          </button>
        ) : (
          <>
            <span style={{ fontSize: 13, color: colors.amber, alignSelf: 'center' }}>Are you sure?</span>
            <button style={btnDanger} onClick={handleRestart}>Yes, restart</button>
            <button style={btnGhost} onClick={() => setConfirming(false)}>Cancel</button>
          </>
        )}
        <button style={btnGhost} onClick={onDismiss} title="Dismiss — I'll restart manually">✕</button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Settings section content
// ---------------------------------------------------------------------------
function SettingsContent({
  apiKeySet, onSaved,
  haStatus, onHaApplied,
}: {
  apiKeySet: boolean
  onSaved: () => void
  haStatus: HaSetupStatus | null
  onHaApplied: (subnet: string) => void
}) {
  const [apiKey, setApiKey] = useState('')
  const [masked, setMasked] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const [applying, setApplying] = useState(false)
  const [applyError, setApplyError] = useState('')
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getConfig().then(cfg => setMasked(cfg.api_key_masked)).catch(() => null)
  }, [apiKeySet])

  async function saveKey() {
    if (!apiKey) return
    setSaving(true); setError(''); setSaved(false)
    try {
      await updateConfig(apiKey)
      setSaved(true); setApiKey('')
      const cfg = await getConfig()
      setMasked(cfg.api_key_masked)
      onSaved()
    } catch (e) { setError(String(e)) }
    finally { setSaving(false) }
  }

  async function applyHa() {
    setApplying(true); setApplyError('')
    try {
      const result: HaSetupApplyResult = await applyHaSetup()
      if (result.status === 'applied') onHaApplied(result.subnet)
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      setApplyError(msg)
    }
    finally { setApplying(false) }
  }

  function copySnippet(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true); setTimeout(() => setCopied(false), 2000)
    })
  }

  // HA setup snippet shown for manual fallback
  const subnet = (haStatus && 'subnet' in haStatus) ? haStatus.subnet : '172.30.32.0/23'
  const yamlSnippet = `http:\n  use_x_forwarded_for: true\n  trusted_proxies:\n    - ${subnet}`

  return (
    <>
      {/* API key */}
      <div style={{ marginTop: 4 }}>
        <div style={{ fontSize: 13, color: colors.muted, fontWeight: 500, marginBottom: 6 }}>API Key</div>
        {masked && (
          <p style={{ fontSize: 13, color: colors.faint, margin: '0 0 8px' }}>
            Current: <code style={{ color: colors.muted }}>{masked}</code>
          </p>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            style={{ ...inputStyle, flex: 1 }}
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && saveKey()}
            placeholder="hle_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
          />
          <button
            style={apiKey && !saving ? btnPrimary : btnDisabled}
            onClick={saveKey}
            disabled={!apiKey || saving}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        {error && <p style={{ color: colors.red, fontSize: 13, margin: '8px 0 0' }}>{error}</p>}
        {saved && <p style={{ color: colors.green, fontSize: 13, margin: '8px 0 0' }}>✓ Saved — tunnels will start automatically.</p>}
        <p style={{ fontSize: 12, color: colors.faint, margin: '8px 0 0' }}>
          New user?{' '}
          <a href="https://hle.world/register" target="_blank" rel="noreferrer" style={{ color: colors.blue }}>
            Create a free account
          </a>
          {' '}· API key at{' '}
          <a href="https://hle.world/dashboard" target="_blank" rel="noreferrer" style={{ color: colors.blue }}>
            hle.world/dashboard
          </a>
        </p>
      </div>

      {/* Divider */}
      <div style={{ borderTop: `1px solid ${colors.border}` }} />

      {/* HA proxy setup */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 13, color: colors.muted, fontWeight: 500 }}>
          Home Assistant Proxy Settings
        </div>

        {haStatus?.status === 'configured' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: '#052e16', border: `1px solid #166534`, borderRadius: 8,
            padding: '10px 14px', fontSize: 13, color: colors.green,
          }}>
            <span>✓</span>
            <span><code style={{ color: '#86efac' }}>configuration.yaml</code> is correctly configured.</span>
          </div>
        )}

        {haStatus?.status === 'subnet_missing' && (
          <>
            <div style={{
              background: '#1c1a07', border: `1px solid #713f12`,
              borderRadius: 8, padding: '10px 14px', fontSize: 13, color: colors.yellow,
            }}>
              <code>configuration.yaml</code> has proxy settings but is missing this addon's subnet
              (<code>{subnet}</code>) from <code>trusted_proxies</code>. HA will return 400 errors
              until it is added.
            </div>
            {applyError && (
              <div style={{
                background: '#2d0a0a', border: `1px solid #7f1d1d`,
                borderRadius: 8, padding: '10px 14px', fontSize: 13, color: colors.red,
              }}>
                {applyError}
              </div>
            )}
            <button
              style={applying ? btnDisabled : btnPrimary}
              onClick={applyHa}
              disabled={applying}
            >
              {applying ? 'Writing…' : `⚡ Add ${subnet} to trusted_proxies`}
            </button>
          </>
        )}

        {(haStatus?.status === 'not_configured' || haStatus?.status === 'no_file') && (
          <>
            <p style={{ fontSize: 13, color: colors.muted, margin: 0 }}>
              To expose Home Assistant through a tunnel, HA needs to trust this addon as a reverse proxy.
              Click below to add the required settings automatically.
            </p>
            {applyError && (
              <div style={{
                background: '#2d0a0a', border: `1px solid #7f1d1d`,
                borderRadius: 8, padding: '10px 14px', fontSize: 13, color: colors.red,
              }}>
                {applyError}
              </div>
            )}
            <button
              style={applying ? btnDisabled : btnPrimary}
              onClick={applyHa}
              disabled={applying}
            >
              {applying ? 'Writing…' : '⚡ Apply to configuration.yaml'}
            </button>
          </>
        )}

        {haStatus?.status === 'has_http_section' && (
          <>
            <div style={{
              background: '#1c1a07', border: `1px solid #713f12`,
              borderRadius: 8, padding: '10px 14px', fontSize: 13, color: colors.yellow,
            }}>
              Your <code>configuration.yaml</code> already has an <code>http:</code> section but is missing
              the proxy settings. Add these lines to your existing <code>http:</code> block manually:
            </div>
            <code style={codeStyle}>{'  use_x_forwarded_for: true\n  trusted_proxies:\n    - ' + subnet}</code>
            <button style={copyBtn(copied)} onClick={() => copySnippet(yamlSnippet)}>
              {copied ? '✓ Copied!' : 'Copy'}
            </button>
          </>
        )}
      </div>
    </>
  )
}

function copyBtn(copied: boolean): React.CSSProperties {
  return {
    padding: '4px 14px', borderRadius: 5,
    border: `1px solid ${colors.border}`, cursor: 'pointer',
    background: colors.surface, color: colors.muted, fontSize: 12,
    alignSelf: 'flex-start',
    ...(copied ? { color: colors.green, borderColor: '#166534' } : {}),
  }
}

// ---------------------------------------------------------------------------
// Documentation section content
// ---------------------------------------------------------------------------
function DocsContent() {
  const [copied, setCopied] = useState<string | null>(null)

  function copy(key: string, text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key); setTimeout(() => setCopied(null), 2000)
    })
  }

  const haYaml = 'http:\n  use_x_forwarded_for: true\n  trusted_proxies:\n    - 172.30.32.0/23'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 4 }}>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: colors.text }}>Exposing Home Assistant</div>
        <p style={{ fontSize: 13, color: colors.muted, margin: 0, lineHeight: 1.6 }}>
          When you create a tunnel pointing to Home Assistant (e.g.{' '}
          <code style={{ color: colors.text }}>http://homeassistant.local.hass.io:8123</code>),
          HA needs to trust this addon as a reverse proxy. Without this, HA returns{' '}
          <code style={{ color: colors.red }}>400 Bad Request</code>.
        </p>
        <p style={{ fontSize: 13, color: colors.muted, margin: 0, lineHeight: 1.6 }}>
          Go to <strong style={{ color: colors.text }}>Settings → Home Assistant Proxy Settings</strong> above
          and click <strong style={{ color: colors.text }}>Apply to configuration.yaml</strong> — or add this
          to your <code style={{ color: colors.text }}>configuration.yaml</code> manually:
        </p>
        <code style={codeStyle}>{haYaml}</code>
        <button style={copyBtn(copied === 'ha')} onClick={() => copy('ha', haYaml)}>
          {copied === 'ha' ? '✓ Copied!' : 'Copy'}
        </button>
        <p style={{ fontSize: 13, color: colors.muted, margin: 0, lineHeight: 1.6 }}>
          After saving, restart Home Assistant core for the changes to take effect.
        </p>
      </div>

      <div style={{ borderTop: `1px solid ${colors.border}` }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: colors.text }}>SSO vs Open tunnels</div>
        <p style={{ fontSize: 13, color: colors.muted, margin: 0, lineHeight: 1.6 }}>
          <strong style={{ color: colors.text }}>SSO</strong> — visitors must log in via Google or GitHub
          before accessing your service. You can restrict access to specific email addresses using
          Access Rules.
        </p>
        <p style={{ fontSize: 13, color: colors.muted, margin: 0, lineHeight: 1.6 }}>
          <strong style={{ color: colors.text }}>Open</strong> — no authentication. The service is
          publicly accessible via the tunnel URL. Use this for services with their own auth (e.g. HA itself).
        </p>
      </div>

      <div style={{ borderTop: `1px solid ${colors.border}` }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: colors.text }}>Self-signed certificates</div>
        <p style={{ fontSize: 13, color: colors.muted, margin: 0, lineHeight: 1.6 }}>
          If your local service uses HTTPS with a self-signed certificate (e.g. a NAS or router),
          enable <strong style={{ color: colors.text }}>Skip SSL verification</strong> when adding the tunnel.
          The tunnel URL itself is always secured with a valid certificate.
        </p>
      </div>

    </div>
  )
}

// ---------------------------------------------------------------------------
// Main App
// ---------------------------------------------------------------------------
export default function App() {
  const [apiKeySet, setApiKeySet] = useState<boolean | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tunnelsOpen, setTunnelsOpen] = useState(true)
  const [docsOpen, setDocsOpen] = useState(false)

  const [tunnels, setTunnels] = useState<TunnelStatus[]>([])
  const [showAdd, setShowAdd] = useState(false)
  const [loadError, setLoadError] = useState('')

  const [haStatus, setHaStatus] = useState<HaSetupStatus | null>(null)
  const [restartNeeded, setRestartNeeded] = useState(
    () => localStorage.getItem('hle_restart_needed') === '1'
  )

  // Load config to determine if key is set
  useEffect(() => {
    getConfig().then(cfg => {
      setApiKeySet(cfg.api_key_set)
      // Auto-open settings if no API key
      if (!cfg.api_key_set) setSettingsOpen(true)
    }).catch(() => { setApiKeySet(false); setSettingsOpen(true) })

    getHaSetupStatus().then(setHaStatus).catch(() => null)
  }, [])

  const loadTunnels = useCallback(async () => {
    try { setTunnels(await getTunnels()) }
    catch (e) { setLoadError(String(e)) }
  }, [])

  useEffect(() => {
    loadTunnels()
    const id = setInterval(loadTunnels, 5000)
    return () => clearInterval(id)
  }, [loadTunnels])

  function handleKeySaved() {
    setApiKeySet(true)
    setSettingsOpen(false)
    loadTunnels()
  }

  function handleHaApplied() {
    setHaStatus({ status: 'configured' })
    setRestartNeeded(true)
    localStorage.setItem('hle_restart_needed', '1')
  }

  function dismissRestartBanner() {
    setRestartNeeded(false)
    localStorage.removeItem('hle_restart_needed')
  }

  async function handleRestart() {
    // Clear localStorage BEFORE calling restart — if the page reloads
    // mid-request (HA goes down fast), we don't want the banner reappearing.
    dismissRestartBanner()
    await restartHaCore()
  }

  const noKey = apiKeySet === false

  return (
    <div style={{ minHeight: '100vh', background: colors.bg, color: colors.text, fontFamily: 'system-ui, sans-serif' }}>
      {/* Header */}
      <header style={{
        padding: '16px 24px', background: '#161820',
        borderBottom: `1px solid ${colors.border}`,
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 20 }}>🌐</span>
        <span style={{ fontWeight: 700, fontSize: 17, letterSpacing: '-0.3px' }}>
          Home Lab Everywhere
        </span>
      </header>

      <main style={{ padding: '20px 24px', maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* Restart banner */}
        {restartNeeded && <RestartBanner onRestart={handleRestart} onDismiss={dismissRestartBanner} />}

        {/* Settings section */}
        <Section
          title="Settings"
          open={settingsOpen}
          onToggle={() => setSettingsOpen(o => !o)}
          badge={noKey ? (
            <span style={{
              fontSize: 11, background: '#92400e', color: colors.amber,
              borderRadius: 4, padding: '1px 7px', fontWeight: 600,
            }}>API key required</span>
          ) : undefined}
        >
          {apiKeySet !== null && (
            <SettingsContent
              apiKeySet={apiKeySet}
              onSaved={handleKeySaved}
              haStatus={haStatus}
              onHaApplied={handleHaApplied}
            />
          )}
        </Section>

        {/* Tunnels section */}
        <Section
          title="Tunnels"
          open={tunnelsOpen}
          onToggle={() => setTunnelsOpen(o => !o)}
          badge={tunnels.length > 0 ? (
            <span style={{
              fontSize: 11, background: colors.surface, color: colors.faint,
              border: `1px solid ${colors.border}`, borderRadius: 10, padding: '1px 8px',
            }}>{tunnels.length}</span>
          ) : undefined}
        >
          {/* Add tunnel button + no-key warning */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 13, color: colors.faint }}>
              {tunnels.length === 0 ? 'No tunnels yet.' : ''}
            </span>
            <button
              style={noKey ? btnDisabled : btnPrimary}
              onClick={() => !noKey && setShowAdd(true)}
              title={noKey ? 'Set your API key in Settings first' : undefined}
            >
              + Add Tunnel
            </button>
          </div>

          {noKey && (
            <div style={{
              background: '#422006', border: `1px solid #92400e`,
              borderRadius: 8, padding: '10px 14px', fontSize: 13, color: colors.amber, lineHeight: 1.6,
            }}>
              No API key configured.{' '}
              <button
                onClick={() => setSettingsOpen(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: colors.amber, fontWeight: 700, textDecoration: 'underline', fontSize: 13, padding: 0 }}
              >
                Open Settings
              </button>
              {' '}to add your key.
            </div>
          )}

          {loadError && <p style={{ color: colors.red, fontSize: 13 }}>{loadError}</p>}

          {tunnels.map(t => (
            <TunnelCard key={t.id} tunnel={t} onRefresh={loadTunnels} />
          ))}

          {/* Documentation sub-section */}
          <div style={{ borderTop: `1px solid ${colors.border}`, paddingTop: 12 }}>
            <Section
              title="Documentation"
              open={docsOpen}
              onToggle={() => setDocsOpen(o => !o)}
            >
              <DocsContent />
            </Section>
          </div>
        </Section>

      </main>

      {showAdd && (
        <AddTunnelModal
          onClose={() => setShowAdd(false)}
          onAdded={() => { setShowAdd(false); loadTunnels() }}
        />
      )}
    </div>
  )
}
