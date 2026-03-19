import http from 'node:http'

const tunnels = [
  {
    id: 'tun_abc123', service_url: 'http://192.168.1.50:8123', label: 'homeassistant',
    name: 'Home Assistant', auth_mode: 'sso', verify_ssl: false, websocket_enabled: true,
    api_key: null, upstream_basic_auth: null, forward_host: true, response_timeout: null,
    subdomain: 'homeassistant-x7k', state: 'CONNECTED', error: null,
    public_url: 'https://homeassistant-x7k.hle.world', pid: 1234
  },
  {
    id: 'tun_def456', service_url: 'http://192.168.1.100:8096', label: 'jellyfin',
    name: 'Jellyfin', auth_mode: 'none', verify_ssl: false, websocket_enabled: true,
    api_key: null, upstream_basic_auth: null, forward_host: false, response_timeout: 30,
    subdomain: 'jellyfin-x7k', state: 'STOPPED', error: null,
    public_url: 'https://jellyfin-x7k.hle.world', pid: null
  },
  {
    id: 'tun_ghi789', service_url: 'https://192.168.1.10:8006', label: 'proxmox',
    name: 'Proxmox VE', auth_mode: 'sso', verify_ssl: false, websocket_enabled: true,
    api_key: null, upstream_basic_auth: null, forward_host: false, response_timeout: null,
    subdomain: 'proxmox-x7k', state: 'FAILED', error: 'Connection refused',
    public_url: null, pid: null
  },
]

const config = { api_key_set: true, api_key_masked: 'hle_xxxx...xxxx' }
const haSetupStatus = { proxy_configured: true, external_url: 'https://homeassistant-x7k.hle.world' }
const accessRules = [
  { id: 1, allowed_email: 'user@gmail.com', provider: 'google', created_at: '2025-01-15T10:00:00Z' }
]
const pinStatus = { has_pin: false, updated_at: null }
const basicAuthStatus = { has_basic_auth: false, username: null, updated_at: null }
const shareLinks = []

const server = http.createServer((req, res) => {
  res.setHeader('Content-Type', 'application/json')
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return }

  const url = req.url?.split('?')[0]

  // Webapp auth mock endpoints
  if (url === '/api/auth/me') {
    res.end(JSON.stringify({ user: { id: 1, email: 'demo@hle.world', username: 'demo', is_admin: false, is_verified: true, user_code: 'x7k' } }))
  } else if (url === '/api/auth/recaptcha-config') {
    res.end(JSON.stringify({ enabled: false }))
  } else if (url === '/api/auth/sso/providers') {
    res.end(JSON.stringify({ google: false, github: false }))
  } else if (url === '/api/feedback/config') {
    res.end(JSON.stringify({ enabled: false }))
  } else if (url === '/api/keys') {
    res.end(JSON.stringify([{ id: 1, name: 'default', key_prefix: 'hle_xxxx', max_tunnels: 5, tunnel_count: 3, created_at: '2025-01-01T00:00:00Z' }]))
  } else if (url === '/api/subscription') {
    res.end(JSON.stringify({ plan: 'free', tunnels_allowed: 5, tunnels_used: 3 }))
  } else if (url === '/api/config' && req.method === 'GET') {
    res.end(JSON.stringify(config))
  } else if (url === '/api/config' && req.method === 'POST') {
    res.end(JSON.stringify(config))
  } else if (url === '/api/tunnels' && req.method === 'GET') {
    res.end(JSON.stringify(tunnels))
  } else if (url === '/api/tunnels' && req.method === 'POST') {
    res.end(JSON.stringify(tunnels[0]))
  } else if (url === '/api/ha-setup/status') {
    res.end(JSON.stringify(haSetupStatus))
  } else if (url?.match(/\/api\/tunnels\/[^/]+\/access$/) && req.method === 'GET') {
    res.end(JSON.stringify(accessRules))
  } else if (url?.match(/\/api\/tunnels\/[^/]+\/pin$/) && req.method === 'GET') {
    res.end(JSON.stringify(pinStatus))
  } else if (url?.match(/\/api\/tunnels\/[^/]+\/basic-auth$/) && req.method === 'GET') {
    res.end(JSON.stringify(basicAuthStatus))
  } else if (url?.match(/\/api\/tunnels\/[^/]+\/share$/) && req.method === 'GET') {
    res.end(JSON.stringify(shareLinks))
  } else if (url?.match(/\/api\/tunnels\/[^/]+\/logs/) && req.method === 'GET') {
    res.end(JSON.stringify({ lines: ['[2025-01-15 10:00:00] Tunnel connected', '[2025-01-15 10:00:01] Proxying requests'] }))
  } else if (url?.match(/\/api\/tunnels\/[^/]+\/(start|stop)/) && req.method === 'POST') {
    res.writeHead(204); res.end()
  } else if (url?.match(/\/api\/tunnels\/[^/]+/) && req.method === 'PATCH') {
    res.end(JSON.stringify(tunnels[0]))
  } else if (url?.match(/\/api\/tunnels\/[^/]+/) && req.method === 'DELETE') {
    res.writeHead(204); res.end()
  } else {
    res.writeHead(404); res.end(JSON.stringify({ error: 'not found' }))
  }
})

const port = process.argv[2] || 3099
server.listen(port, () => console.log(`Mock API on http://localhost:${port}`))
