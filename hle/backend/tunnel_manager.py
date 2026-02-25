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

# In-memory registry: tunnel_id -> running asyncio subprocess
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
    log_path = LOG_DIR / f"tunnel-{cfg.id}.log"
    log_file = open(log_path, "ab")  # noqa: WPS515 — kept open for subprocess lifetime
    # Arguments passed as list — no shell, no injection risk
    cmd = [
        "hle", "expose",
        "--service", cfg.service_url,
        "--label", cfg.label,
        "--auth", cfg.auth_mode,
        "--relay-host", cfg.relay_host,
    ]
    return await asyncio.create_subprocess_exec(
        *cmd,
        stdout=log_file,
        stderr=asyncio.subprocess.STDOUT,
        env={**os.environ},
        start_new_session=True,
    )


def _is_running(proc: asyncio.subprocess.Process | None) -> bool:
    return proc is not None and proc.returncode is None


# ---------------------------------------------------------------------------
# Public async API
# ---------------------------------------------------------------------------

async def restore_all() -> None:
    """Called at startup: re-spawn all persisted tunnels."""
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
        relay_host=os.environ.get("HLE_RELAY_HOST", "hle.world"),
    )
    proc = await _spawn(cfg)
    _processes[cfg.id] = proc
    tunnels[cfg.id] = cfg
    _save_all(tunnels)
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
    tunnels = _load_all()
    cfg = tunnels.get(tunnel_id)
    if cfg is None:
        return None
    return _make_status(tunnel_id, cfg)


def _make_status(tunnel_id: str, cfg: TunnelConfig) -> TunnelStatus:
    proc = _processes.get(tunnel_id)
    running = _is_running(proc)
    return TunnelStatus(
        **cfg.model_dump(),
        state="RUNNING" if running else "STOPPED",
        pid=proc.pid if running else None,
    )
