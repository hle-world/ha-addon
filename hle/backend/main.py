"""FastAPI management API for the HLE Home Assistant add-on."""

from __future__ import annotations

import ipaddress
import json
import os
import re
import socket
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles  # noqa: F401 — used in conditional mount below

from backend import hle_api
from backend.models import (
    AddAccessRuleRequest, AddTunnelRequest, CreateShareLinkRequest,
    SetBasicAuthRequest, SetPinRequest, TunnelStatus, UpdateConfigRequest,
    UpdateTunnelRequest,
)
from backend import tunnel_manager as tm


@asynccontextmanager
async def lifespan(app: FastAPI):
    await tm.restore_all()
    yield
    await tm.shutdown_all()


app = FastAPI(title="HLE Add-on API", docs_url=None, redoc_url=None, lifespan=lifespan)

HLE_CONFIG      = Path("/data/hle_config.json")  # our own file, not managed by HA Supervisor
HA_CONFIG       = Path("/config/configuration.yaml")
RESTART_PENDING = Path("/data/restart_pending")   # sentinel: written on config apply, deleted when HA comes back up
STATIC_DIR      = Path("/app/backend/static")
SUPERVISOR_API  = "http://supervisor"
HA_HOST         = "homeassistant.local.hass.io"
HA_PORT         = 8123


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _require_api_key() -> None:
    if not os.environ.get("HLE_API_KEY"):
        raise HTTPException(status_code=400, detail="API key not configured. Set it in Settings first.")


# ---------------------------------------------------------------------------
# Tunnel management
# ---------------------------------------------------------------------------

@app.get("/api/tunnels", response_model=list[TunnelStatus])
async def list_tunnels():
    return tm.list_tunnels()


@app.post("/api/tunnels", response_model=TunnelStatus, status_code=201)
async def add_tunnel(req: AddTunnelRequest):
    _require_api_key()
    cfg = await tm.add_tunnel(req)
    return tm.get_tunnel(cfg.id)


@app.patch("/api/tunnels/{tunnel_id}", response_model=TunnelStatus)
async def update_tunnel(tunnel_id: str, req: UpdateTunnelRequest):
    if tm.get_tunnel(tunnel_id) is None:
        raise HTTPException(status_code=404, detail="Tunnel not found")
    cfg = await tm.update_tunnel(tunnel_id, req)
    return tm.get_tunnel(cfg.id)


@app.delete("/api/tunnels/{tunnel_id}", status_code=204)
async def remove_tunnel(tunnel_id: str):
    if tm.get_tunnel(tunnel_id) is None:
        raise HTTPException(status_code=404, detail="Tunnel not found")
    await tm.remove_tunnel(tunnel_id)


@app.post("/api/tunnels/{tunnel_id}/start", status_code=204)
async def start_tunnel(tunnel_id: str):
    if tm.get_tunnel(tunnel_id) is None:
        raise HTTPException(status_code=404, detail="Tunnel not found")
    await tm.start_tunnel(tunnel_id)


@app.post("/api/tunnels/{tunnel_id}/stop", status_code=204)
async def stop_tunnel(tunnel_id: str):
    if tm.get_tunnel(tunnel_id) is None:
        raise HTTPException(status_code=404, detail="Tunnel not found")
    await tm.stop_tunnel(tunnel_id)


# ---------------------------------------------------------------------------
# Tunnel logs
# ---------------------------------------------------------------------------

@app.get("/api/tunnels/{tunnel_id}/logs")
async def get_tunnel_logs(tunnel_id: str, lines: int = 100):
    log_path = Path(f"/data/logs/tunnel-{tunnel_id}.log")
    if not log_path.exists():
        return {"lines": []}
    text = log_path.read_text(errors="replace")
    all_lines = text.splitlines()
    return {"lines": all_lines[-lines:]}


# ---------------------------------------------------------------------------
# Access rules (keyed by subdomain, proxied to relay)
# ---------------------------------------------------------------------------

@app.get("/api/tunnels/{subdomain}/access")
async def list_access_rules(subdomain: str):
    try:
        return await hle_api.list_access_rules(subdomain)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)


@app.post("/api/tunnels/{subdomain}/access", status_code=201)
async def add_access_rule(subdomain: str, req: AddAccessRuleRequest):
    try:
        return await hle_api.add_access_rule(subdomain, req.email, req.provider)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)


@app.delete("/api/tunnels/{subdomain}/access/{rule_id}", status_code=204)
async def delete_access_rule(subdomain: str, rule_id: int):
    try:
        await hle_api.delete_access_rule(subdomain, rule_id)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)


# ---------------------------------------------------------------------------
# PIN protection (keyed by subdomain)
# ---------------------------------------------------------------------------

@app.get("/api/tunnels/{subdomain}/pin")
async def get_pin_status(subdomain: str):
    try:
        return await hle_api.get_pin_status(subdomain)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)


@app.put("/api/tunnels/{subdomain}/pin", status_code=204)
async def set_pin(subdomain: str, req: SetPinRequest):
    try:
        await hle_api.set_pin(subdomain, req.pin)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)


@app.delete("/api/tunnels/{subdomain}/pin", status_code=204)
async def remove_pin(subdomain: str):
    try:
        await hle_api.remove_pin(subdomain)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)


# ---------------------------------------------------------------------------
# Basic auth (keyed by subdomain)
# ---------------------------------------------------------------------------

@app.get("/api/tunnels/{subdomain}/basic-auth")
async def get_basic_auth_status(subdomain: str):
    try:
        return await hle_api.get_basic_auth_status(subdomain)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)


@app.put("/api/tunnels/{subdomain}/basic-auth", status_code=204)
async def set_basic_auth(subdomain: str, req: SetBasicAuthRequest):
    try:
        await hle_api.set_basic_auth(subdomain, req.username, req.password)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)


@app.delete("/api/tunnels/{subdomain}/basic-auth", status_code=204)
async def remove_basic_auth(subdomain: str):
    try:
        await hle_api.remove_basic_auth(subdomain)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)


# ---------------------------------------------------------------------------
# Share links (keyed by subdomain)
# ---------------------------------------------------------------------------

@app.get("/api/tunnels/{subdomain}/share")
async def list_share_links(subdomain: str):
    try:
        return await hle_api.list_share_links(subdomain)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)


@app.post("/api/tunnels/{subdomain}/share", status_code=201)
async def create_share_link(subdomain: str, req: CreateShareLinkRequest):
    try:
        return await hle_api.create_share_link(subdomain, req.duration, req.label, req.max_uses)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)


@app.delete("/api/tunnels/{subdomain}/share/{link_id}", status_code=204)
async def delete_share_link(subdomain: str, link_id: int):
    try:
        await hle_api.delete_share_link(subdomain, link_id)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(status_code=exc.response.status_code, detail=exc.response.text)


# ---------------------------------------------------------------------------
# Add-on config
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# HA configuration.yaml auto-setup
# ---------------------------------------------------------------------------

def _detect_subnet() -> str:
    """Return the /23 subnet this addon uses to reach HA (e.g. '172.30.32.0/23')."""
    try:
        with socket.create_connection(("homeassistant.local.hass.io", 8123), timeout=2) as s:
            addon_ip = s.getsockname()[0]
        return str(ipaddress.ip_network(f"{addon_ip}/23", strict=False))
    except Exception:
        return "172.30.32.0/23"


@app.get("/api/ha-setup/status")
async def ha_setup_status():
    """Check whether configuration.yaml already has the proxy settings."""
    if not HA_CONFIG.exists():
        return {"status": "no_file"}
    text = HA_CONFIG.read_text(errors="replace")
    subnet = _detect_subnet()
    if "use_x_forwarded_for" in text:
        # Also verify the addon's subnet is actually listed — having
        # use_x_forwarded_for without our subnet still causes 400 errors.
        if subnet in text:
            return {"status": "configured"}
        return {"status": "subnet_missing", "subnet": subnet}
    if re.search(r"^http:", text, re.MULTILINE):
        return {"status": "has_http_section", "subnet": subnet}
    return {"status": "not_configured", "subnet": subnet}


@app.post("/api/ha-setup/apply")
async def ha_setup_apply():
    """Append the http proxy block (or just the missing subnet) to configuration.yaml."""
    if not HA_CONFIG.exists():
        raise HTTPException(status_code=404, detail="configuration.yaml not found at /config/")
    text = HA_CONFIG.read_text(errors="replace")
    subnet = _detect_subnet()

    if "use_x_forwarded_for" in text:
        if subnet in text:
            return {"status": "already_configured", "subnet": subnet}
        # http block exists with use_x_forwarded_for but our subnet is missing —
        # insert the subnet after the last entry under trusted_proxies.
        lines = text.splitlines(keepends=True)
        tp_idx = next(
            (i for i, l in enumerate(lines) if re.match(r"[ \t]*trusted_proxies\s*:", l)),
            None,
        )
        if tp_idx is None:
            raise HTTPException(
                status_code=409,
                detail="Could not locate trusted_proxies key in configuration.yaml. Please add the subnet manually.",
            )
        # Detect indentation from the first existing list entry under trusted_proxies.
        entry_indent = "    "
        for i in range(tp_idx + 1, min(tp_idx + 10, len(lines))):
            m = re.match(r"([ \t]*)-\s+", lines[i])
            if m:
                entry_indent = m.group(1)
                break
        # Find the last list entry that belongs to this trusted_proxies block.
        last_entry_idx = tp_idx
        for i in range(tp_idx + 1, len(lines)):
            stripped = lines[i].strip()
            if re.match(r"-\s+", stripped):
                last_entry_idx = i
            elif stripped and not stripped.startswith("#"):
                break  # reached the next YAML key — stop
        new_line = f"{entry_indent}- {subnet}  # Added by HLE addon\n"
        lines.insert(last_entry_idx + 1, new_line)
        HA_CONFIG.write_text("".join(lines))
        RESTART_PENDING.write_text("1")
        return {"status": "applied", "subnet": subnet}

    if re.search(r"^http:", text, re.MULTILINE):
        raise HTTPException(
            status_code=409,
            detail=(
                "An 'http:' section already exists in configuration.yaml "
                "but does not contain 'use_x_forwarded_for'. "
                "Please add it manually."
            ),
        )

    block = (
        "\n# Added by HLE addon — required for tunnel reverse-proxy support\n"
        "http:\n"
        "  use_x_forwarded_for: true\n"
        "  trusted_proxies:\n"
        f"    - {subnet}\n"
    )
    HA_CONFIG.write_text(text + block)
    RESTART_PENDING.write_text("1")
    return {"status": "applied", "subnet": subnet}


@app.post("/api/ha-setup/restart")
async def ha_setup_restart():
    """Restart HA Core via the Supervisor API."""
    token = os.environ.get("SUPERVISOR_TOKEN")
    if not token:
        raise HTTPException(status_code=503, detail="SUPERVISOR_TOKEN not available")
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            resp = await client.post(
                f"{SUPERVISOR_API}/core/restart",
                headers={"Authorization": f"Bearer {token}"},
            )
        if resp.status_code not in (200, 204):
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
    except httpx.RequestError as exc:
        raise HTTPException(status_code=503, detail=f"Supervisor unreachable: {exc}")
    # Clear the sentinel immediately — even if the page reloads before the
    # response arrives, the backend has already recorded the restart intent.
    RESTART_PENDING.unlink(missing_ok=True)
    return {"status": "restarting"}


@app.get("/api/ha-ping")
async def ha_ping():
    """Check whether HA Core is reachable. Used by the frontend to detect
    when HA comes back up after a restart so the banner can be cleared."""
    try:
        with socket.create_connection((HA_HOST, HA_PORT), timeout=2):
            pass
        return {"alive": True}
    except Exception:
        return {"alive": False}


@app.get("/api/network-info")
async def get_network_info():
    """Return the addon container's IP and the trusted_proxies subnet for HA config."""
    addon_ip: str | None = None
    subnet: str | None = None
    try:
        # Connect toward HA so the OS picks the right source interface.
        with socket.create_connection(("homeassistant.local.hass.io", 8123), timeout=2) as s:
            addon_ip = s.getsockname()[0]
        # HA Supervisor always allocates addon IPs inside a /23 block.
        net = ipaddress.ip_network(f"{addon_ip}/23", strict=False)
        subnet = str(net)
    except Exception:
        pass
    return {"addon_ip": addon_ip, "trusted_subnet": subnet}


@app.get("/api/config")
async def get_config():
    # Prefer our own config file; fall back to env var set by run.sh
    key = ""
    if HLE_CONFIG.exists():
        key = json.loads(HLE_CONFIG.read_text()).get("api_key", "")
    if not key:
        key = os.environ.get("HLE_API_KEY", "")
    masked = f"{key[:4]}...{key[-4:]}" if len(key) > 8 else ("set" if key else "")
    return {"api_key_set": bool(key), "api_key_masked": masked}


@app.post("/api/config", status_code=204)
async def update_config(req: UpdateConfigRequest):
    # Write to our own file — Supervisor owns /data/options.json and will
    # overwrite it on addon updates, losing any direct edits.
    current = {}
    if HLE_CONFIG.exists():
        current = json.loads(HLE_CONFIG.read_text())
    current["api_key"] = req.api_key
    HLE_CONFIG.write_text(json.dumps(current, indent=2))
    os.environ["HLE_API_KEY"] = req.api_key
    # Start any configured tunnels that were waiting for a key
    await tm.restore_all()


# ---------------------------------------------------------------------------
# Serve React SPA (must be last)
# ---------------------------------------------------------------------------

if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
else:
    @app.get("/")
    async def index():
        return {"status": "frontend not built"}
