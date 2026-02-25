# Home Lab Everywhere — Add-on Documentation

## Setup

1. Open the **HLE** panel in the HA sidebar
2. Go to **Settings** and enter your API key from [hle.world/dashboard](https://hle.world/dashboard)
3. Click **Save**

## Exposing Home Assistant

On the **Tunnels** page, click **+ Add Tunnel** and use the ⚡ quick-add button.
This will expose HA at `ha.<your-code>.hle.world` with SSO enabled.

## Exposing Other Services

Click **+ Add Tunnel**, enter:
- **Service URL** — the internal URL of the service (e.g. `http://192.168.1.50:8096`)
- **Label** — used in the subdomain (e.g. `jellyfin` → `jellyfin.<your-code>.hle.world`)
- **Auth mode** — `SSO` requires visitors to sign in; `Open` allows anyone

## SSO Access Rules

When a tunnel uses SSO mode, you can restrict access to specific email addresses.
Click **Access Rules** on any running tunnel to manage the allow-list.

## Tunnel States

| State    | Meaning |
|----------|---------|
| RUNNING  | Connected to the relay, traffic is flowing |
| STARTING | Connecting to the relay |
| STOPPED  | Manually stopped |
| FATAL    | Crashed after too many retries — check the add-on logs |

## Logs

Full per-tunnel logs are available at **Settings → Add-on → Log** in HA, or in
`/data/logs/tunnel-<id>.log` inside the container.
