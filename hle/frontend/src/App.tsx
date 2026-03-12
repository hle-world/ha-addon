import { useEffect, useState, useCallback } from 'react'
import { Logo } from './components/Logo'
import type { TunnelStatus, HaSetupStatus, HaSetupApplyResult } from './api/client'
import {
  getConfig, updateConfig,
  getTunnels,
  getHaSetupStatus, applyHaSetup, restartHaCore, dismissHaRestart, pingHa,
} from './api/client'
import { TunnelCard } from './components/TunnelCard'
import { AddTunnelModal } from './components/AddTunnelModal'

// ---------------------------------------------------------------------------
// Shared inline style helpers (reference CSS variables from index.css)
// ---------------------------------------------------------------------------
const inputStyle: React.CSSProperties = {
  padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--surface)', color: 'var(--text)', fontSize: 14, width: '100%',
  boxSizing: 'border-box', fontFamily: 'inherit',
}
const btnPrimary: React.CSSProperties = {
  padding: '8px 18px', borderRadius: 6, border: 'none', cursor: 'pointer',
  background: 'var(--mint)', color: 'var(--bg)', fontSize: 13, fontWeight: 600,
  fontFamily: 'inherit',
}
const btnGhost: React.CSSProperties = {
  ...btnPrimary, background: 'var(--surface)', border: '1px solid var(--border)',
  color: 'var(--text-dim)',
}
const btnDanger: React.CSSProperties = { ...btnPrimary, background: 'var(--red)', color: '#fff' }
const btnDisabled: React.CSSProperties = {
  ...btnPrimary, background: 'var(--surface)', color: 'var(--text-xdim)', cursor: 'not-allowed',
}
const codeStyle: React.CSSProperties = {
  background: 'var(--surface)', borderRadius: 6, padding: '10px 14px',
  fontSize: 12, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)',
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
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', background: 'var(--surface)', border: 'none', cursor: 'pointer',
          color: 'var(--text)', fontSize: 15, fontWeight: 700, textAlign: 'left',
          fontFamily: 'var(--font-display)',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            fontSize: 11, color: 'var(--text-dim)', transform: open ? 'rotate(90deg)' : 'none',
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
        background: 'var(--yellow-tint-bg)', border: '1px solid var(--yellow-tint-border)',
        borderRadius: 'var(--radius)', padding: '14px 18px',
        display: 'flex', alignItems: 'center', gap: 10,
      }}>
        <span style={{ fontSize: 18 }}>⏳</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--yellow)' }}>
            {phase === 'waiting_down' ? 'Waiting for HA to go down…' : 'HA is restarting, waiting for it to come back up…'}
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 2 }}>
            This will clear automatically once HA is back online.
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={{
      background: 'var(--yellow-tint-bg)', border: '1px solid var(--yellow-tint-border)',
      borderRadius: 'var(--radius)', padding: '14px 18px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ fontSize: 18 }}>⚠️</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--yellow)' }}>
            Home Assistant restart required
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-dim)', marginTop: 2 }}>
            The proxy settings were written to <code style={{ color: 'var(--yellow)', fontFamily: 'var(--font-mono)' }}>configuration.yaml</code>.
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
            <span style={{ fontSize: 13, color: 'var(--yellow)', alignSelf: 'center' }}>Are you sure?</span>
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

  const subnet = (haStatus && 'subnet' in haStatus) ? haStatus.subnet : '172.30.32.0/23'
  const yamlSnippet = `http:\n  use_x_forwarded_for: true\n  trusted_proxies:\n    - ${subnet}`

  return (
    <>
      {/* API key */}
      <div style={{ marginTop: 4 }}>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', fontWeight: 500, marginBottom: 6 }}>API Key</div>
        {masked && (
          <p style={{ fontSize: 13, color: 'var(--text-xdim)', margin: '0 0 8px' }}>
            Current: <code style={{ color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>{masked}</code>
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
        {error && <p style={{ color: 'var(--red)', fontSize: 13, margin: '8px 0 0' }}>{error}</p>}
        {saved && <p style={{ color: 'var(--green)', fontSize: 13, margin: '8px 0 0' }}>✓ Saved — tunnels will start automatically.</p>}
        <p style={{ fontSize: 12, color: 'var(--text-xdim)', margin: '8px 0 0' }}>
          New user?{' '}
          <a href="https://hle.world/register" target="_blank" rel="noreferrer" style={{ color: 'var(--mint)' }}>
            Create a free account
          </a>
          {' '}· API key at{' '}
          <a href="https://hle.world/dashboard" target="_blank" rel="noreferrer" style={{ color: 'var(--mint)' }}>
            hle.world/dashboard
          </a>
        </p>
      </div>

      {/* Divider */}
      <div style={{ borderTop: '1px solid var(--border)' }} />

      {/* HA proxy setup */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ fontSize: 13, color: 'var(--text-dim)', fontWeight: 500 }}>
          Home Assistant Proxy Settings
        </div>

        {haStatus?.status === 'configured' && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: 'var(--green-tint-bg)', border: '1px solid var(--green-tint-border)', borderRadius: 8,
            padding: '10px 14px', fontSize: 13, color: 'var(--green)',
          }}>
            <span>✓</span>
            <span><code style={{ color: 'var(--green)', fontFamily: 'var(--font-mono)' }}>configuration.yaml</code> is correctly configured.</span>
          </div>
        )}

        {haStatus?.status === 'subnet_missing' && (
          <>
            <div style={{
              background: 'var(--yellow-tint-bg)', border: '1px solid var(--yellow-tint-border)',
              borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--yellow)',
            }}>
              <code style={{ fontFamily: 'var(--font-mono)' }}>configuration.yaml</code> has proxy settings but is missing this addon's subnet
              (<code style={{ fontFamily: 'var(--font-mono)' }}>{subnet}</code>) from <code style={{ fontFamily: 'var(--font-mono)' }}>trusted_proxies</code>. HA will return 400 errors
              until it is added.
            </div>
            {applyError && (
              <div style={{
                background: 'var(--red-tint-bg)', border: '1px solid var(--red-tint-border)',
                borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--red)',
              }}>
                {applyError}
              </div>
            )}
            <button
              style={applying ? btnDisabled : btnPrimary}
              onClick={applyHa}
              disabled={applying}
            >
              {applying ? 'Writing…' : `Add ${subnet} to trusted_proxies`}
            </button>
          </>
        )}

        {(haStatus?.status === 'not_configured' || haStatus?.status === 'no_file') && (
          <>
            <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0 }}>
              To expose Home Assistant through a tunnel, HA needs to trust this addon as a reverse proxy.
              Click below to add the required settings automatically.
            </p>
            {applyError && (
              <div style={{
                background: 'var(--red-tint-bg)', border: '1px solid var(--red-tint-border)',
                borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--red)',
              }}>
                {applyError}
              </div>
            )}
            <button
              style={applying ? btnDisabled : btnPrimary}
              onClick={applyHa}
              disabled={applying}
            >
              {applying ? 'Writing…' : 'Apply to configuration.yaml'}
            </button>
          </>
        )}

        {haStatus?.status === 'has_http_section' && (
          <>
            <div style={{
              background: 'var(--yellow-tint-bg)', border: '1px solid var(--yellow-tint-border)',
              borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--yellow)',
            }}>
              Your <code style={{ fontFamily: 'var(--font-mono)' }}>configuration.yaml</code> already has an <code style={{ fontFamily: 'var(--font-mono)' }}>http:</code> section but is missing
              the proxy settings. Add these lines to your existing <code style={{ fontFamily: 'var(--font-mono)' }}>http:</code> block manually:
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
    border: '1px solid var(--border)', cursor: 'pointer',
    background: 'var(--surface)', color: 'var(--text-dim)', fontSize: 12,
    alignSelf: 'flex-start', fontFamily: 'inherit',
    ...(copied ? { color: 'var(--green)', borderColor: 'var(--green-tint-border)' } : {}),
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
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>Exposing Home Assistant</div>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0, lineHeight: 1.6 }}>
          When you create a tunnel pointing to Home Assistant (e.g.{' '}
          <code style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>http://homeassistant.local.hass.io:8123</code>),
          HA needs to trust this addon as a reverse proxy. Without this, HA returns{' '}
          <code style={{ color: 'var(--red)', fontFamily: 'var(--font-mono)' }}>400 Bad Request</code>.
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0, lineHeight: 1.6 }}>
          Go to <strong style={{ color: 'var(--text)' }}>Settings → Home Assistant Proxy Settings</strong> above
          and click <strong style={{ color: 'var(--text)' }}>Apply to configuration.yaml</strong> — or add this
          to your <code style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>configuration.yaml</code> manually:
        </p>
        <code style={codeStyle}>{haYaml}</code>
        <button style={copyBtn(copied === 'ha')} onClick={() => copy('ha', haYaml)}>
          {copied === 'ha' ? '✓ Copied!' : 'Copy'}
        </button>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0, lineHeight: 1.6 }}>
          After saving, restart Home Assistant core for the changes to take effect.
        </p>
      </div>

      <div style={{ borderTop: '1px solid var(--border)' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>SSO vs Open tunnels</div>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0, lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text)' }}>SSO</strong> — visitors must log in via Google or GitHub
          before accessing your service. You can restrict access to specific email addresses using
          Access Rules.
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0, lineHeight: 1.6 }}>
          <strong style={{ color: 'var(--text)' }}>Open</strong> — no authentication. The service is
          publicly accessible via the tunnel URL. Use this for services with their own auth (e.g. HA itself).
        </p>
      </div>

      <div style={{ borderTop: '1px solid var(--border)' }} />

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>Self-signed certificates</div>
        <p style={{ fontSize: 13, color: 'var(--text-dim)', margin: 0, lineHeight: 1.6 }}>
          If your local service uses HTTPS with a self-signed certificate (e.g. a NAS or router),
          enable <strong style={{ color: 'var(--text)' }}>Skip SSL verification</strong> when adding the tunnel.
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
  const [restartNeeded, setRestartNeeded] = useState(false)

  useEffect(() => {
    getConfig().then(cfg => {
      setApiKeySet(cfg.api_key_set)
      if (!cfg.api_key_set) setSettingsOpen(true)
    }).catch(() => { setApiKeySet(false); setSettingsOpen(true) })

    getHaSetupStatus().then(status => {
      setHaStatus(status)
      setRestartNeeded(status.restart_pending)
    }).catch(() => null)
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
    setHaStatus({ status: 'configured', restart_pending: true })
    setRestartNeeded(true)
  }

  function dismissRestartBanner() {
    setRestartNeeded(false)
    dismissHaRestart().catch(() => null)
  }

  async function handleRestart() {
    dismissRestartBanner()
    await restartHaCore()
  }

  const noKey = apiKeySet === false

  return (
    <div style={{ minHeight: '100vh' }}>
      {/* Header */}
      <header style={{
        padding: '16px 24px', background: 'var(--bg-raised)',
        borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <span style={{ color: 'var(--mint)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Logo size={26} />
          <span style={{ fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 18, letterSpacing: '-0.3px' }}>
            HL<span style={{ color: '#ffd866' }}>E</span>
          </span>
        </span>
        <span style={{ color: 'var(--text-dim)', fontSize: 14 }}>
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
              fontSize: 11, background: 'var(--yellow-tint-bg)', color: 'var(--yellow)',
              border: '1px solid var(--yellow-tint-border)',
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
              fontSize: 11, background: 'var(--surface)', color: 'var(--text-xdim)',
              border: '1px solid var(--border)', borderRadius: 10, padding: '1px 8px',
            }}>{tunnels.length}</span>
          ) : undefined}
        >
          {/* Add tunnel button + no-key warning */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 13, color: 'var(--text-xdim)' }}>
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
              background: 'var(--yellow-tint-bg)', border: '1px solid var(--yellow-tint-border)',
              borderRadius: 8, padding: '10px 14px', fontSize: 13, color: 'var(--yellow)', lineHeight: 1.6,
            }}>
              No API key configured.{' '}
              <button
                onClick={() => setSettingsOpen(true)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--yellow)', fontWeight: 700, textDecoration: 'underline', fontSize: 13, padding: 0, fontFamily: 'inherit' }}
              >
                Open Settings
              </button>
              {' '}to add your key.
            </div>
          )}

          {loadError && <p style={{ color: 'var(--red)', fontSize: 13 }}>{loadError}</p>}

          {tunnels.map(t => (
            <TunnelCard key={t.id} tunnel={t} onRefresh={loadTunnels} />
          ))}

          {/* Documentation sub-section */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
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
