"""FastAPI management API for the HLE Home Assistant add-on."""

from __future__ import annotations

import ipaddress
import json
import os
import re
import socket
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated
from urllib.parse import urlsplit

import httpx
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles  # noqa: F401 — used in conditional mount below

from backend import hle_api
from backend.models import (
    AddAccessRuleRequest,
    AddTunnelRequest,
    CreateShareLinkRequest,
    SetBasicAuthRequest,
    SetPinRequest,
    TunnelStatus,
    UpdateConfigRequest,
    UpdateTunnelRequest,
)
from backend import tunnel_manager as tm
from backend.tunnel_manager import DuplicateLabelError


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Clean up old sentinel location from previous versions
    Path("/data/restart_pending").unlink(missing_ok=True)
    # Restore API key from persisted config if not already set in environment
    if not os.environ.get("HLE_API_KEY") and HLE_CONFIG.exists():
        try:
            api_key = json.loads(HLE_CONFIG.read_text()).get("api_key", "")
            if api_key:
                os.environ["HLE_API_KEY"] = api_key
        except Exception:
            pass
    try:
        # Best effort: a read-only or unreadable config folder must never keep
        # the add-on (and its tunnels) from starting.
        _refresh_trusted_proxy()
    except Exception:  # nosec B110
        pass
    await tm.restore_all()
    yield
    await tm.shutdown_all()


app = FastAPI(title="HLE Add-on API", docs_url=None, redoc_url=None, lifespan=lifespan)

HLE_CONFIG = Path("/data/hle_config.json")  # our own file, not managed by HA Supervisor


def _ha_config_path() -> Path:
    """Path to Home Assistant's configuration.yaml.

    The `homeassistant_config` map mounts the HA config folder at /homeassistant
    (the deprecated `config` map used /config), so accept whichever is present.
    """
    for parent in (Path("/homeassistant"), Path("/config")):
        if (parent / "configuration.yaml").exists():
            return parent / "configuration.yaml"
    return Path("/homeassistant/configuration.yaml")


HA_CONFIG = _ha_config_path()
RESTART_NEEDED = Path(
    "/tmp/restart_needed"  # nosec B108 — intentional use of /tmp in addon container
)  # sentinel: created on config apply, auto-cleared when config is confirmed
STATIC_DIR = Path("/app/backend/static")
SUPERVISOR_API = "http://supervisor"
HA_HOST = "homeassistant.local.hass.io"
HA_PORT = 8123

# The Supervisor's ingress proxy. Home Assistant's add-on guidance is that an
# ingress add-on accepts connections from this address only: the panel is
# reached through ingress, which has already checked the HA session. Any other
# container on the hassio network is refused. Loopback stays open for the
# add-on's own processes.
INGRESS_PROXY_IP = "172.30.32.2"
_ALLOWED_PEERS = frozenset({INGRESS_PROXY_IP, "127.0.0.1", "::1"})


@app.middleware("http")
async def _ingress_only(request: Request, call_next):
    peer = request.client.host if request.client else ""
    if peer not in _ALLOWED_PEERS:
        return JSONResponse({"detail": "Forbidden"}, status_code=403)
    return await call_next(request)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _require_api_key() -> None:
    if not os.environ.get("HLE_API_KEY"):
        raise HTTPException(
            status_code=400, detail="API key not configured. Set it in Settings first."
        )


def _managed_subdomain(subdomain: str) -> str:
    """Only proxy relay calls for tunnels this add-on manages.

    The relay calls below use the account's global key, which can reach every
    tunnel on the account; this keeps them scoped to the local tunnels.
    """
    if not any(t.subdomain == subdomain for t in tm.list_tunnels()):
        raise HTTPException(status_code=404, detail="Tunnel not found")
    return subdomain


ManagedSubdomain = Annotated[str, Depends(_managed_subdomain)]


# ---------------------------------------------------------------------------
# Tunnel management
# ---------------------------------------------------------------------------


@app.get("/api/tunnels", response_model=list[TunnelStatus])
async def list_tunnels():
    return tm.list_tunnels()


@app.post("/api/tunnels", response_model=TunnelStatus, status_code=201)
async def add_tunnel(req: AddTunnelRequest):
    _require_api_key()
    try:
        cfg = await tm.add_tunnel(req)
    except DuplicateLabelError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
    return tm.get_tunnel(cfg.id)


@app.patch("/api/tunnels/{tunnel_id}", response_model=TunnelStatus)
async def update_tunnel(tunnel_id: str, req: UpdateTunnelRequest):
    if tm.get_tunnel(tunnel_id) is None:
        raise HTTPException(status_code=404, detail="Tunnel not found")
    try:
        cfg = await tm.update_tunnel(tunnel_id, req)
    except DuplicateLabelError as exc:
        raise HTTPException(status_code=409, detail=str(exc))
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


@app.get("/api/tunnels/{tunnel_id}/logs/download")
async def download_tunnel_logs(tunnel_id: str, lines: int = 2000):
    """Download the last N log lines as a plain text file."""
    log_path = Path(f"/data/logs/tunnel-{tunnel_id}.log")
    if not log_path.exists():
        raise HTTPException(status_code=404, detail="No log file found")
    text = log_path.read_text(errors="replace")
    all_lines = text.splitlines()
    content = "\n".join(all_lines[-lines:])
    return Response(
        content=content,
        media_type="text/plain",
        headers={
            "Content-Disposition": f'attachment; filename="tunnel-{tunnel_id}.log"'
        },
    )


# ---------------------------------------------------------------------------
# Favicon proxy (fetches from the tunnel's local service URL)
# ---------------------------------------------------------------------------

FAVICON_DIR = Path("/data/favicons")

# Favicon bytes are rendered on the management origin, so they must be inert:
# raster formats only (never SVG, which can carry script), confirmed by magic
# bytes, and never larger than this.
MAX_FAVICON_BYTES = 256 * 1024

_FAVICON_MAGIC: tuple[tuple[bytes, str], ...] = (
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"\x00\x00\x01\x00", "image/x-icon"),
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
)


def _sniff_image(data: bytes) -> str | None:
    """Return the media type for a supported raster image, or ``None``.

    The upstream ``Content-Type`` is deliberately ignored — the upstream is
    attacker controlled — and the format is decided purely by magic bytes.
    This is what keeps SVG (and any other script-bearing content) from ever
    being served from the management origin.
    """
    for magic, media_type in _FAVICON_MAGIC:
        if data.startswith(magic):
            return media_type
    return None


def _url_origin(url: str) -> str:
    parts = urlsplit(url)
    return f"{parts.scheme}://{parts.netloc}"


def _favicon_response(data: bytes, media_type: str) -> Response:
    return Response(
        content=data,
        media_type=media_type,
        headers={
            "Content-Security-Policy": "default-src 'none'; sandbox",
            "X-Content-Type-Options": "nosniff",
        },
    )


async def _read_capped(resp, limit: int) -> bytes | None:
    """Read at most ``limit`` bytes of a streamed body; ``None`` if it is larger.

    The upstream is attacker controlled, so the cap is enforced while reading
    rather than after the whole body has been buffered.
    """
    declared = resp.headers.get("content-length")
    if declared is not None and declared.isdigit() and int(declared) > limit:
        return None
    body = bytearray()
    async for chunk in resp.aiter_bytes():
        body.extend(chunk)
        if len(body) > limit:
            return None
    return bytes(body)


async def _fetch_same_origin(
    client, url: str, origin: str, limit: int, max_redirects: int = 5
) -> tuple[httpx.URL, bytes] | None:
    """GET ``url`` and return ``(final_url, body)`` for a 200 response.

    Only redirects that stay on ``origin`` are followed: following the
    upstream's redirect to another host would be SSRF. A cross-origin
    ``Location``, too many hops, a non-200 status or a body over ``limit``
    bytes all return ``None``, which the caller treats as "no favicon".
    """
    for _ in range(max_redirects + 1):
        async with client.stream("GET", url, follow_redirects=False) as resp:
            if resp.is_redirect and resp.headers.get("location"):
                url = str(resp.url.join(resp.headers["location"]))
                if _url_origin(url) != origin:
                    return None
                continue
            if resp.status_code != 200:
                return None
            body = await _read_capped(resp, limit)
            return None if body is None else (resp.url, body)
    return None


@app.get("/api/tunnels/{tunnel_id}/favicon")
async def get_tunnel_favicon(tunnel_id: str):
    """Return the favicon from the tunnel's local service, cached on disk.

    Only PNG/ICO/JPEG/GIF are served, confirmed by magic bytes — never SVG —
    because these bytes render on the management origin. Responses are capped
    in size and sent with ``nosniff`` and a sandboxing CSP, and only
    same-origin URLs are ever fetched.
    """
    # Serve from cache if available
    cached = FAVICON_DIR / tunnel_id
    if cached.exists():
        data = cached.read_bytes()
        media_type = _sniff_image(data)
        if media_type is not None and 0 < len(data) <= MAX_FAVICON_BYTES:
            return _favicon_response(data, media_type)

    # Look up tunnel config to get service_url
    status = tm.get_tunnel(tunnel_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Tunnel not found")

    service_url = status.service_url.rstrip("/")
    origin = _url_origin(service_url)

    # Common favicon paths — services like Jellyfin use /web/favicon.ico
    favicon_paths = [
        "/favicon.ico",
        "/web/favicon.ico",
        "/favicon.png",
        "/favicon.svg",
    ]

    icon_data: bytes | None = None
    icon_media = "image/x-icon"

    async with httpx.AsyncClient(timeout=5, verify=False) as client:  # nosec B501 — local LAN services often use self-signed certs
        for path in favicon_paths:
            try:
                fetched = await _fetch_same_origin(
                    client, f"{service_url}{path}", origin, MAX_FAVICON_BYTES
                )
            except Exception:
                continue
            if fetched is None:
                continue
            data = fetched[1]
            media_type = _sniff_image(data)
            if media_type is not None and len(data) > 0:
                icon_data = data
                icon_media = media_type
                break

        # Fallback: parse <link rel="icon"> from HTML
        if icon_data is None:
            try:
                # Pages are often larger than the head we scan, so this fetch
                # gets a generous cap and only the first 8 KiB is searched.
                page = await _fetch_same_origin(
                    client, service_url, origin, 2 * 1024 * 1024
                )
                if page is not None:
                    page_url, page_body = page
                    html = page_body[:8192].decode(
                        "utf-8", "replace"
                    )  # only scan the head
                    match = re.search(
                        r'<link[^>]+rel=["\'](?:shortcut )?icon["\'][^>]+href=["\']([^"\']+)',
                        html,
                        re.IGNORECASE,
                    )
                    if match:
                        # Resolve relative to the (same-origin) final URL and
                        # refuse anything that escapes the service's origin.
                        href = str(page_url.join(match.group(1)))
                        if _url_origin(href) == origin:
                            icon = await _fetch_same_origin(
                                client, href, origin, MAX_FAVICON_BYTES
                            )
                            if icon is not None:
                                data = icon[1]
                                media_type = _sniff_image(data)
                                if media_type is not None and len(data) > 0:
                                    icon_data = data
                                    icon_media = media_type
            except Exception:
                pass

    if icon_data is None:
        raise HTTPException(status_code=404, detail="No favicon found")

    # Cache to disk
    FAVICON_DIR.mkdir(parents=True, exist_ok=True)
    cached.write_bytes(icon_data)

    return _favicon_response(icon_data, icon_media)


# ---------------------------------------------------------------------------
# Access rules (keyed by subdomain, proxied to relay)
# ---------------------------------------------------------------------------


@app.get("/api/tunnels/{subdomain}/access")
async def list_access_rules(subdomain: ManagedSubdomain):
    try:
        return await hle_api.list_access_rules(subdomain)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code, detail=exc.response.text
        )


@app.post("/api/tunnels/{subdomain}/access", status_code=201)
async def add_access_rule(subdomain: ManagedSubdomain, req: AddAccessRuleRequest):
    try:
        return await hle_api.add_access_rule(subdomain, req.email, req.provider)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code, detail=exc.response.text
        )


@app.delete("/api/tunnels/{subdomain}/access/{rule_id}", status_code=204)
async def delete_access_rule(subdomain: ManagedSubdomain, rule_id: int):
    try:
        await hle_api.delete_access_rule(subdomain, rule_id)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code, detail=exc.response.text
        )


# ---------------------------------------------------------------------------
# PIN protection (keyed by subdomain)
# ---------------------------------------------------------------------------


@app.get("/api/tunnels/{subdomain}/pin")
async def get_pin_status(subdomain: ManagedSubdomain):
    try:
        return await hle_api.get_pin_status(subdomain)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code, detail=exc.response.text
        )


@app.put("/api/tunnels/{subdomain}/pin", status_code=204)
async def set_pin(subdomain: ManagedSubdomain, req: SetPinRequest):
    try:
        await hle_api.set_pin(subdomain, req.pin)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code, detail=exc.response.text
        )


@app.delete("/api/tunnels/{subdomain}/pin", status_code=204)
async def remove_pin(subdomain: ManagedSubdomain):
    try:
        await hle_api.remove_pin(subdomain)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code, detail=exc.response.text
        )


# ---------------------------------------------------------------------------
# Basic auth (keyed by subdomain)
# ---------------------------------------------------------------------------


@app.get("/api/tunnels/{subdomain}/basic-auth")
async def get_basic_auth_status(subdomain: ManagedSubdomain):
    try:
        return await hle_api.get_basic_auth_status(subdomain)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code, detail=exc.response.text
        )


@app.put("/api/tunnels/{subdomain}/basic-auth", status_code=204)
async def set_basic_auth(subdomain: ManagedSubdomain, req: SetBasicAuthRequest):
    try:
        await hle_api.set_basic_auth(subdomain, req.username, req.password)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code, detail=exc.response.text
        )


@app.delete("/api/tunnels/{subdomain}/basic-auth", status_code=204)
async def remove_basic_auth(subdomain: ManagedSubdomain):
    try:
        await hle_api.remove_basic_auth(subdomain)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code, detail=exc.response.text
        )


# ---------------------------------------------------------------------------
# Share links (keyed by subdomain)
# ---------------------------------------------------------------------------


@app.get("/api/tunnels/{subdomain}/share")
async def list_share_links(subdomain: ManagedSubdomain):
    try:
        return await hle_api.list_share_links(subdomain)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code, detail=exc.response.text
        )


@app.post("/api/tunnels/{subdomain}/share", status_code=201)
async def create_share_link(subdomain: ManagedSubdomain, req: CreateShareLinkRequest):
    try:
        return await hle_api.create_share_link(
            subdomain, req.duration, req.label, req.max_uses
        )
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code, detail=exc.response.text
        )


@app.delete("/api/tunnels/{subdomain}/share/{link_id}", status_code=204)
async def delete_share_link(subdomain: ManagedSubdomain, link_id: int):
    try:
        await hle_api.delete_share_link(subdomain, link_id)
    except httpx.HTTPStatusError as exc:
        raise HTTPException(
            status_code=exc.response.status_code, detail=exc.response.text
        )


# ---------------------------------------------------------------------------
# Add-on config
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# HA configuration.yaml auto-setup
# ---------------------------------------------------------------------------


# Older versions trusted the whole hassio /23, which let any other add-on on
# that network spoof X-Forwarded-For. Only the add-on's own address may be
# trusted. Entries this add-on writes carry a marker so they can be refreshed
# when the container's IP changes.
_LEGACY_TRUSTED_PROXY = "172.30.32.0/23"
_HLE_PROXY_MARKER = "# Added by HLE addon"
# Older versions that created the whole `http:` block wrote this comment above
# it and left the single trusted_proxies entry unmarked.
_LEGACY_BLOCK_HEADER = "# Added by HLE addon —"


def _detect_trusted_proxy() -> str | None:
    """Return this add-on's own address as a single-host network.

    For IPv4 that is e.g. '172.30.32.5/32'.  Trusting only this address stops
    other add-ons on the hassio network from spoofing proxy headers.  Returns
    None when the address cannot be determined.
    """
    try:
        with socket.create_connection(
            ("homeassistant.local.hass.io", 8123), timeout=2
        ) as s:
            addon_ip = ipaddress.ip_address(s.getsockname()[0])
        return f"{addon_ip}/{addon_ip.max_prefixlen}"
    except Exception:
        return None


def _trusted_proxy_bounds(lines: list[str]) -> tuple[int, int] | None:
    """Return the line range holding the trusted_proxies list entries."""
    for i, line in enumerate(lines):
        if re.match(r"[ \t]*trusted_proxies\s*:", line):
            end = len(lines)
            for j in range(i + 1, len(lines)):
                stripped = lines[j].strip()
                if not stripped or stripped.startswith("#"):
                    continue
                if stripped.startswith("-"):
                    continue
                end = j
                break
            return i + 1, end
    return None


def _rewrite_trusted_proxies(text: str, current: str) -> str:
    """Replace add-on-managed trusted_proxies entries with ``current``.

    An entry counts as add-on-written only if it carries the
    "Added by HLE addon" marker, or is the first, unmarked entry of the block
    older versions created whole (recognised by its "Added by HLE addon —"
    header comment).  Any other entry, including a hand-written
    ``172.30.32.0/23`` that other proxy add-ons rely on, is never touched.
    """
    lines = text.splitlines(keepends=True)
    bounds = _trusted_proxy_bounds(lines)
    if bounds is None:
        return text
    start, end = bounds
    kept: list[str] = []
    replaced = False
    found_managed = False
    first_entry = True
    legacy_block = _LEGACY_BLOCK_HEADER in text
    for line in lines[start:end]:
        match = re.match(r"([ \t]*)-\s+(\S+)(.*)$", line)
        managed = match is not None and (
            _HLE_PROXY_MARKER in match.group(3)
            or (first_entry and legacy_block and match.group(2).endswith("/23"))
        )
        if match is not None:
            first_entry = False
        if not managed:
            kept.append(line)
            continue
        found_managed = True
        if match.group(2) == current:
            kept.append(line)
            replaced = True
        elif not replaced:
            kept.append(f"{match.group(1)}- {current}  {_HLE_PROXY_MARKER}\n")
            replaced = True
    if not found_managed:
        return text
    return "".join(lines[:start] + kept + lines[end:])


def _refresh_trusted_proxy() -> None:
    """Refresh the managed trusted_proxies entry on add-on start.

    The add-on's container IP can change between restarts, so an old address
    must not stay trusted.  HA still needs a restart to pick up the change, so
    the restart sentinel is set when the file is modified.
    """
    if not HA_CONFIG.exists():
        return
    current = _detect_trusted_proxy()
    if not current:
        return
    text = HA_CONFIG.read_text(errors="replace")
    if "use_x_forwarded_for" not in text:
        return
    updated = _rewrite_trusted_proxies(text, current)
    if re.search(
        rf"^[ \t]*-\s+{re.escape(_LEGACY_TRUSTED_PROXY)}\s*$", updated, re.MULTILINE
    ):
        print(
            f"[hle] WARNING: configuration.yaml trusts {_LEGACY_TRUSTED_PROXY} "
            "as a reverse proxy; consider narrowing it, since every add-on on "
            "that network can then spoof X-Forwarded-For.",
            flush=True,
        )
    if updated == text:
        return
    HA_CONFIG.write_text(updated)
    RESTART_NEEDED.write_text("1")


def _sentinel_stale() -> bool:
    """Return True if the restart sentinel is old enough that HA has likely
    been restarted since it was created.

    After "Apply", the user must restart HA for config changes to take effect.
    A restart typically takes 10-60 seconds.  We use a 2-minute threshold: if
    the sentinel is older than that and the config file looks correct, we
    assume the restart happened (or the user chose not to restart).
    """
    try:
        return (time.time() - RESTART_NEEDED.stat().st_mtime) > 120
    except OSError:
        return False


@app.get("/api/ha-setup/status")
async def ha_setup_status():
    """Check whether configuration.yaml already has the proxy settings.

    Called on every page load.  When the config is correct *and* the
    sentinel is old enough that HA has likely restarted, the sentinel is
    auto-cleared so the restart banner disappears.
    """
    restart_needed = RESTART_NEEDED.exists()
    if not HA_CONFIG.exists():
        return {"status": "no_file", "restart_pending": restart_needed}
    text = HA_CONFIG.read_text(errors="replace")
    subnet = _detect_trusted_proxy()
    if subnet and "use_x_forwarded_for" in text:
        if subnet in text:
            # Config looks correct.  If the sentinel is old enough, assume
            # the restart has already happened and auto-clear.
            if restart_needed and _sentinel_stale():
                RESTART_NEEDED.unlink(missing_ok=True)
                restart_needed = False
            return {"status": "configured", "restart_pending": restart_needed}
        return {
            "status": "subnet_missing",
            "subnet": subnet,
            "restart_pending": restart_needed,
        }
    if re.search(r"^http:", text, re.MULTILINE):
        return {
            "status": "has_http_section",
            "subnet": subnet,
            "restart_pending": restart_needed,
        }
    return {
        "status": "not_configured",
        "subnet": subnet,
        "restart_pending": restart_needed,
    }


@app.post("/api/ha-setup/apply")
async def ha_setup_apply():
    """Append the http proxy block (or just the missing subnet) to configuration.yaml."""
    if not HA_CONFIG.exists():
        raise HTTPException(
            status_code=404,
            detail=f"configuration.yaml not found at {HA_CONFIG.parent}/",
        )
    text = HA_CONFIG.read_text(errors="replace")
    subnet = _detect_trusted_proxy()
    if not subnet:
        raise HTTPException(
            status_code=503,
            detail="Could not determine the add-on's IP address. Please add it manually.",
        )

    if "use_x_forwarded_for" in text:
        if subnet in text:
            return {"status": "already_configured", "subnet": subnet}
        # Replace any stale entry this add-on wrote (including the historical
        # /23), then insert our address if it is still missing.
        text = _rewrite_trusted_proxies(text, subnet)
        if subnet not in text:
            lines = text.splitlines(keepends=True)
            tp_idx = next(
                (
                    i
                    for i, line in enumerate(lines)
                    if re.match(r"[ \t]*trusted_proxies\s*:", line)
                ),
                None,
            )
            if tp_idx is None:
                raise HTTPException(
                    status_code=409,
                    detail="Could not locate trusted_proxies key in configuration.yaml. Please add the address manually.",
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
            new_line = f"{entry_indent}- {subnet}  {_HLE_PROXY_MARKER}\n"
            lines.insert(last_entry_idx + 1, new_line)
            text = "".join(lines)
        HA_CONFIG.write_text(text)
        RESTART_NEEDED.write_text("1")
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
        f"    - {subnet}  {_HLE_PROXY_MARKER}\n"
    )
    HA_CONFIG.write_text(text + block)
    RESTART_NEEDED.write_text("1")
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
    RESTART_NEEDED.unlink(missing_ok=True)
    return {"status": "restarting"}


@app.post("/api/ha-setup/dismiss", status_code=204)
async def ha_setup_dismiss():
    """Clear the restart-needed sentinel.

    Called by the frontend when:
    - The user clicks the dismiss button on the restart banner.
    - The RestartBanner detects HA has come back up after a restart.
    """
    RESTART_NEEDED.unlink(missing_ok=True)


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
    """Return the add-on's IP and the trusted_proxies entry for HA config."""
    trusted = _detect_trusted_proxy()
    addon_ip = trusted.rsplit("/", 1)[0] if trusted else None
    return {"addon_ip": addon_ip, "trusted_subnet": trusted}


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
