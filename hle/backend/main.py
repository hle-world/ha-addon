"""FastAPI management API for the HLE Home Assistant add-on."""

from __future__ import annotations

import json
import os
from contextlib import asynccontextmanager
from pathlib import Path

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles  # noqa: F401 — used in conditional mount below

from backend import hle_api
from backend.models import (
    AddAccessRuleRequest, AddTunnelRequest, CreateShareLinkRequest,
    SetPinRequest, TunnelStatus, UpdateConfigRequest,
)
from backend import tunnel_manager as tm


@asynccontextmanager
async def lifespan(app: FastAPI):
    await tm.restore_all()
    yield
    await tm.shutdown_all()


app = FastAPI(title="HLE Add-on API", docs_url=None, redoc_url=None, lifespan=lifespan)

HLE_CONFIG = Path("/data/hle_config.json")  # our own file, not managed by HA Supervisor
STATIC_DIR = Path("/app/backend/static")


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


# ---------------------------------------------------------------------------
# Serve React SPA (must be last)
# ---------------------------------------------------------------------------

if STATIC_DIR.exists():
    app.mount("/", StaticFiles(directory=str(STATIC_DIR), html=True), name="static")
else:
    @app.get("/")
    async def index():
        return {"status": "frontend not built"}
