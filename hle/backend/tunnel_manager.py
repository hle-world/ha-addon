"""Manages tunnel lifecycle: persistence and asyncio subprocess management."""

from __future__ import annotations

import asyncio
import json
import os
import uuid
from pathlib import Path

from backend.models import AddTunnelRequest, TunnelConfig, TunnelStatus

LOG_DIR = Path("/data/logs")
DATA_FILE = Path("/data/tunnels.json")

_processes: dict[str, asyncio.subprocess.Process] = {}


# ---------------------------------------------------------------------------
# Persistence
# ---------------------------------------------------------------------------

def _load_all() -> dict[str, TunnelConfig]:
    if not DATA_FILE.exists():
        return {}
    data = json.loads(DATA_FILE.read_text())
    return {tid: TunnelConfig(**cfg) for tid, cfg in data.items()}


def _save_all(tunnels: dict[str, TunnelConfig]) -> None:
    DATA_FILE.write_text(
        json.dumps({tid: cfg.model_dump() for tid, cfg in tunnels.items()}, indent=2)
    )


# ---------------------------------------------------------------------------
# Process management
# ---------------------------------------------------------------------------

async def _spawn(cfg: TunnelConfig) -> asyncio.subprocess.Process:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    log_file = open(LOG_DIR / f"tunnel-{cfg.id}.log", "ab")
    # All args passed as list — no shell injection risk
    cmd = ["hle", "expose", "--service", cfg.service_url, "--label", cfg.label, "--auth", cfg.auth_mode]
    return await asyncio.create_subprocess_exec(
        *cmd,
        stdout=log_file,
        stderr=asyncio.subprocess.STDOUT,
        env={**os.environ},
        start_new_session=True,
    )


def _is_running(proc: asyncio.subprocess.Process | None) -> bool:
    return proc is not None and proc.returncode is None


async def _detect_subdomain(cfg_id: str, service_url: str, label: str) -> None:
    """Background task: poll the relay API until the tunnel appears, then store its subdomain."""
    from backend import hle_api
    for _ in range(15):  # up to ~30 seconds
        await asyncio.sleep(2)
        try:
            live = await hle_api.list_live_tunnels()
            for t in live:
                if t.get("service_url") == service_url or t.get("service_label") == label:
                    subdomain = t.get("subdomain") or t.get("service_label")
                    if subdomain:
                        tunnels = _load_all()
                        if cfg_id in tunnels:
                            tunnels[cfg_id].subdomain = subdomain
                            _save_all(tunnels)
                        return
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Public async API
# ---------------------------------------------------------------------------

async def restore_all() -> None:
    for cfg in _load_all().values():
        try:
            proc = await _spawn(cfg)
            _processes[cfg.id] = proc
        except Exception as exc:
            print(f"[hle] Failed to restore tunnel {cfg.id}: {exc}")


async def add_tunnel(req: AddTunnelRequest) -> TunnelConfig:
    tunnels = _load_all()
    cfg = TunnelConfig(
        id=uuid.uuid4().hex[:8],
        service_url=req.service_url,
        label=req.label,
        auth_mode=req.auth_mode,
    )
    proc = await _spawn(cfg)
    _processes[cfg.id] = proc
    tunnels[cfg.id] = cfg
    _save_all(tunnels)
    # Detect subdomain in background — updates saved state once tunnel connects
    asyncio.create_task(_detect_subdomain(cfg.id, cfg.service_url, cfg.label))
    return cfg


async def remove_tunnel(tunnel_id: str) -> None:
    proc = _processes.pop(tunnel_id, None)
    if _is_running(proc):
        proc.terminate()
        try:
            await asyncio.wait_for(proc.wait(), timeout=5.0)
        except asyncio.TimeoutError:
            proc.kill()
    tunnels = _load_all()
    tunnels.pop(tunnel_id, None)
    _save_all(tunnels)


async def start_tunnel(tunnel_id: str) -> None:
    tunnels = _load_all()
    cfg = tunnels.get(tunnel_id)
    if cfg is None:
        raise KeyError(tunnel_id)
    if not _is_running(_processes.get(tunnel_id)):
        _processes[tunnel_id] = await _spawn(cfg)
        asyncio.create_task(_detect_subdomain(cfg.id, cfg.service_url, cfg.label))


async def stop_tunnel(tunnel_id: str) -> None:
    proc = _processes.get(tunnel_id)
    if _is_running(proc):
        proc.terminate()
        try:
            await asyncio.wait_for(proc.wait(), timeout=5.0)
        except asyncio.TimeoutError:
            proc.kill()


def list_tunnels() -> list[TunnelStatus]:
    return [_make_status(tid, cfg) for tid, cfg in _load_all().items()]


def get_tunnel(tunnel_id: str) -> TunnelStatus | None:
    cfg = _load_all().get(tunnel_id)
    return _make_status(tunnel_id, cfg) if cfg else None


def _make_status(tunnel_id: str, cfg: TunnelConfig) -> TunnelStatus:
    proc = _processes.get(tunnel_id)
    running = _is_running(proc)
    public_url = f"https://{cfg.subdomain}.hle.world" if cfg.subdomain else None
    return TunnelStatus(
        **cfg.model_dump(),
        state="RUNNING" if running else "STOPPED",
        public_url=public_url,
        pid=proc.pid if running else None,
    )
