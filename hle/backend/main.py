"""FastAPI management API for the HLE Home Assistant add-on."""

from __future__ import annotations

import json
import os
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend import hle_api
from backend.models import AddAccessRuleRequest, AddTunnelRequest, TunnelStatus, UpdateConfigRequest
from backend import tunnel_manager as tm

app = FastAPI(title="HLE Add-on API", docs_url=None, redoc_url=None)

OPTIONS_FILE = Path("/data/options.json")
STATIC_DIR = Path("/app/backend/static")

# ---------------------------------------------------------------------------
# Tunnel management
# ---------------------------------------------------------------------------

@app.get("/api/tunnels", response_model=list[TunnelStatus])
async def list_tunnels():
    return tm.list_tunnels()


@app.post("/api/tunnels", response_model=TunnelStatus, status_code=201)
async def add_tunnel(req: AddTunnelRequest):
    cfg = tm.add_tunnel(req)
    status = tm.get_tunnel(cfg.id)
    return status


@app.delete("/api/tunnels/{tunnel_id}", status_code=204)
async def remove_tunnel(tunnel_id: str):
    if tm.get_tunnel(tunnel_id) is None:
        raise HTTPException(status_code=404, detail="Tunnel not found")
    tm.remove_tunnel(tunnel_id)


@app.post("/api/tunnels/{tunnel_id}/start", status_code=204)
async def start_tunnel(tunnel_id: str):
    if tm.get_tunnel(tunnel_id) is None:
        raise HTTPException(status_code=404, detail="Tunnel not found")
    tm.start_tunnel(tunnel_id)


@app.post("/api/tunnels/{tunnel_id}/stop", status_code=204)
async def stop_tunnel(tunnel_id: str):
    if tm.get_tunnel(tunnel_id) is None:
        raise HTTPException(status_code=404, detail="Tunnel not found")
    tm.stop_tunnel(tunnel_id)


# ---------------------------------------------------------------------------
# Access rules (proxy to HLE relay API)
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
# Add-on config
# ---------------------------------------------------------------------------

@app.get("/api/config")
async def get_config():
    if not OPTIONS_FILE.exists():
        return {"api_key": "", "relay_host": "hle.world"}
    data = json.loads(OPTIONS_FILE.read_text())
    # Mask the key so the frontend can show it's set without exposing it
    key = data.get("api_key", "")
    masked = f"{key[:4]}...{key[-4:]}" if len(key) > 8 else ("set" if key else "")
    return {"api_key_set": bool(key), "api_key_masked": masked, "relay_host": data.get("relay_host", "hle.world")}


@app.post("/api/config", status_code=204)
async def update_config(req: UpdateConfigRequest):
    """
    Persist a new API key and relay host to /data/options.json and update env vars
    so that ApiClient picks them up without a restart.
    HA Supervisor will honour /data/options.json on the next add-on restart.
    """
    current = {}
    if OPTIONS_FILE.exists():
        current = json.loads(OPTIONS_FILE.read_text())
    current["api_key"] = req.api_key
    current["relay_host"] = req.relay_host
    OPTIONS_FILE.write_text(json.dumps(current, indent=2))
    os.environ["HLE_API_KEY"] = req.api_key
    os.environ["HLE_RELAY_HOST"] = req.relay_host


# ---------------------------------------------------------------------------
# Serve React SPA (must be last)
# ---------------------------------------------------------------------------

if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
else:
    @app.get("/")
    async def index():
        return {"status": "frontend not built"}
