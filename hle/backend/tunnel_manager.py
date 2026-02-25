"""Manages tunnel lifecycle: config persistence, supervisord conf files, and state."""

from __future__ import annotations

import json
import textwrap
import uuid
from pathlib import Path

from backend import supervisor_client as sv
from backend.models import AddTunnelRequest, TunnelConfig, TunnelStatus

CONF_DIR = Path("/etc/supervisor/conf.d")
LOG_DIR = Path("/data/logs")
DATA_FILE = Path("/data/tunnels.json")

# ---------------------------------------------------------------------------
# Persistence helpers
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
# Supervisord conf generation
# ---------------------------------------------------------------------------

def _program_name(tunnel_id: str) -> str:
    return f"tunnel-{tunnel_id}"


def _write_conf(cfg: TunnelConfig) -> None:
    name = _program_name(cfg.id)
    flags = [
        f"--service {cfg.service_url}",
        f"--label {cfg.label}",
        f"--auth {cfg.auth_mode}",
        f"--relay-host {cfg.relay_host}",
    ]
    conf = textwrap.dedent(f"""
        [program:{name}]
        command=hle expose {' '.join(flags)}
        autostart=true
        autorestart=true
        autorestart=unexpected
        startsecs=5
        stopwaitsecs=10
        stdout_logfile={LOG_DIR}/{name}.log
        stdout_logfile_maxbytes=1MB
        stdout_logfile_backups=3
        redirect_stderr=true
        environment=HLE_API_KEY="%(ENV_HLE_API_KEY)s"
    """).strip() + "\n"
    (CONF_DIR / f"{name}.conf").write_text(conf)


def _remove_conf(tunnel_id: str) -> None:
    (CONF_DIR / f"{_program_name(tunnel_id)}.conf").unlink(missing_ok=True)


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def restore_all() -> None:
    """Called at container startup: regenerate conf files from saved state."""
    for cfg in _load_all().values():
        _write_conf(cfg)


def add_tunnel(req: AddTunnelRequest) -> TunnelConfig:
    tunnels = _load_all()
    cfg = TunnelConfig(
        id=uuid.uuid4().hex[:8],
        service_url=req.service_url,
        label=req.label,
        auth_mode=req.auth_mode,
        relay_host=_current_relay_host(),
    )
    _write_conf(cfg)
    sv.reload_and_add(_program_name(cfg.id))
    tunnels[cfg.id] = cfg
    _save_all(tunnels)
    return cfg


def remove_tunnel(tunnel_id: str) -> None:
    sv.remove(_program_name(tunnel_id))
    _remove_conf(tunnel_id)
    tunnels = _load_all()
    tunnels.pop(tunnel_id, None)
    _save_all(tunnels)


def start_tunnel(tunnel_id: str) -> None:
    sv.start(_program_name(tunnel_id))


def stop_tunnel(tunnel_id: str) -> None:
    sv.stop(_program_name(tunnel_id))


def list_tunnels() -> list[TunnelStatus]:
    result = []
    for tid, cfg in _load_all().items():
        info = sv.get_state(_program_name(tid))
        result.append(
            TunnelStatus(
                **cfg.model_dump(),
                state=info.get("statename", "UNKNOWN"),
                pid=info.get("pid") or None,
            )
        )
    return result


def get_tunnel(tunnel_id: str) -> TunnelStatus | None:
    tunnels = _load_all()
    cfg = tunnels.get(tunnel_id)
    if cfg is None:
        return None
    info = sv.get_state(_program_name(tunnel_id))
    return TunnelStatus(
        **cfg.model_dump(),
        state=info.get("statename", "UNKNOWN"),
        pid=info.get("pid") or None,
    )


# ---------------------------------------------------------------------------
# Config helpers
# ---------------------------------------------------------------------------

def _current_relay_host() -> str:
    import os
    return os.environ.get("HLE_RELAY_HOST", "hle.world")
