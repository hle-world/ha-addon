# HomeLab Everywhere — Add-on Documentation

The add-on runs in one of two modes.

| Mode | Where you manage tunnels | Set up by |
|------|--------------------------|-----------|
| **Add-on mode** (default) | The HLE panel in the HA sidebar | Entering an API key |
| **Agent mode** | The [hle.world dashboard](https://hle.world/dashboard) | Entering an agent token |

Use agent mode if you want every tunnel on this machine — and on any other
homelab machines — managed from one place. Use add-on mode if you'd rather keep
everything inside Home Assistant.

## Setup

1. Open the **HLE** panel in the HA sidebar
2. Go to **Settings** and enter your API key from [hle.world/dashboard](https://hle.world/dashboard)
3. Click **Save**

## Setup — Agent Mode

In agent mode this add-on runs the HLE agent instead of the local backend, so
**the HLE panel is not served** — you add, edit, and remove endpoints in the
dashboard and the agent converges within seconds, with no restart.

1. In the [dashboard](https://hle.world/dashboard), go to **Agents → New Agent**
2. Copy the `hlea_…` token — it is shown only once
3. In the add-on's **Configuration** tab, paste it into **agent_token** and save
4. Restart the add-on

To go back to add-on mode, clear **agent_token** and restart.

When adding endpoints for Home Assistant itself, point them at
`http://homeassistant:8123` and apply the `trusted_proxies` prerequisite below.

## Exposing Home Assistant

> **One-time prerequisite:** Home Assistant blocks requests from reverse proxies by default.
> Before using the HA quick-add, add the following to your `configuration.yaml` and restart HA:
>
> ```yaml
> http:
>   use_x_forwarded_for: true
>   trusted_proxies:
>     - 172.30.32.0/23
> ```
>
> This is required by every reverse proxy (Nginx, Traefik, Cloudflare Tunnel, etc.) — not specific to HLE.

On the **Tunnels** page, click **+ Add Tunnel** and use the ⚡ quick-add button.
This will expose HA at `ha-<your-code>.hle.world` with SSO enabled.

## Exposing Other Services

Click **+ Add Tunnel**, enter:
- **Service URL** — the internal URL of the service (e.g. `http://192.168.1.50:8096`)
- **Label** — used in the subdomain (e.g. `jellyfin` → `jellyfin-<your-code>.hle.world`)
- **Auth mode** — `SSO` requires visitors to sign in; `Open` allows anyone

## SSO Access Rules

When a tunnel uses SSO mode, you can restrict access to specific email addresses.
Click **Access Rules** on any running tunnel to manage the allow-list.

## Tunnel States

| State    | Meaning |
|----------|---------|
| RUNNING  | Process is running and connecting/connected to the relay |
| STOPPED  | Manually stopped or not yet started |

## Logs

Full per-tunnel logs are available at **Settings → Add-on → Log** in HA, or in
`/data/logs/tunnel-<id>.log` inside the container.
