"""Only the add-on's own address may be trusted as an HA reverse proxy.

Trusting the whole hassio /23 would let another add-on on the same Supervisor
spoof X-Forwarded-For. The generated configuration must always contain the
add-on's single-host /32 entry, including when migrating from older versions.
"""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend import main

INGRESS = (main.INGRESS_PROXY_IP, 50000)


def _connect_from(monkeypatch, ip: str) -> None:
    class _Socket:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def getsockname(self):
            return (ip, 12345)

    monkeypatch.setattr(main.socket, "create_connection", lambda *args, **kw: _Socket())


@pytest.fixture
def config(tmp_path, monkeypatch) -> Path:
    path = tmp_path / "configuration.yaml"
    path.write_text("")
    monkeypatch.setattr(main, "HA_CONFIG", path)
    monkeypatch.setattr(main, "RESTART_NEEDED", tmp_path / "restart_needed")
    return path


def test_detect_trusted_proxy_returns_single_address(monkeypatch) -> None:
    _connect_from(monkeypatch, "172.30.32.42")
    assert main._detect_trusted_proxy() == "172.30.32.42/32"


def test_detect_trusted_proxy_none_when_unreachable(monkeypatch) -> None:
    def _fail(*args, **kw):
        raise OSError("unreachable")

    monkeypatch.setattr(main.socket, "create_connection", _fail)
    assert main._detect_trusted_proxy() is None


def test_apply_writes_only_the_addon_address(config, monkeypatch) -> None:
    _connect_from(monkeypatch, "172.30.32.42")
    client = TestClient(main.app, client=INGRESS)

    resp = client.post("/api/ha-setup/apply")

    assert resp.status_code == 200
    text = config.read_text()
    assert "172.30.32.42/32" in text
    assert "/23" not in text


def test_apply_replaces_marked_legacy_subnet(config, monkeypatch) -> None:
    config.write_text(
        "http:\n"
        "  use_x_forwarded_for: true\n"
        "  trusted_proxies:\n"
        "    - 172.30.32.0/23  # Added by HLE addon\n"
    )
    _connect_from(monkeypatch, "172.30.32.42")
    client = TestClient(main.app, client=INGRESS)

    resp = client.post("/api/ha-setup/apply")

    assert resp.status_code == 200
    text = config.read_text()
    assert "172.30.32.42/32" in text
    assert "172.30.32.0/23" not in text


def test_startup_migrates_block_written_by_older_version(config, monkeypatch) -> None:
    # Older versions created the whole block, unmarked, under this header.
    config.write_text(
        "\n# Added by HLE addon — required for tunnel reverse-proxy support\n"
        "http:\n"
        "  use_x_forwarded_for: true\n"
        "  trusted_proxies:\n"
        "    - 172.30.32.0/23\n"
    )
    _connect_from(monkeypatch, "172.30.32.42")

    main._refresh_trusted_proxy()

    text = config.read_text()
    assert "172.30.32.42/32" in text
    assert "172.30.32.0/23" not in text


def test_handwritten_legacy_subnet_is_kept_with_warning(
    config, monkeypatch, capsys
) -> None:
    original = (
        "http:\n"
        "  use_x_forwarded_for: true\n"
        "  trusted_proxies:\n"
        "    - 172.30.32.0/23\n"
    )
    config.write_text(original)
    _connect_from(monkeypatch, "172.30.32.42")

    main._refresh_trusted_proxy()

    assert config.read_text() == original
    assert not main.RESTART_NEEDED.exists()
    assert "consider narrowing" in capsys.readouterr().out


def test_apply_keeps_handwritten_subnet_and_adds_address(config, monkeypatch) -> None:
    config.write_text(
        "http:\n"
        "  use_x_forwarded_for: true\n"
        "  trusted_proxies:\n"
        "    - 172.30.32.0/23\n"
    )
    _connect_from(monkeypatch, "172.30.32.42")
    client = TestClient(main.app, client=INGRESS)

    resp = client.post("/api/ha-setup/apply")

    assert resp.status_code == 200
    text = config.read_text()
    assert "172.30.32.0/23" in text
    assert "172.30.32.42/32" in text


def test_startup_refreshes_changed_address(config, monkeypatch) -> None:
    config.write_text(
        "http:\n"
        "  use_x_forwarded_for: true\n"
        "  trusted_proxies:\n"
        "    - 172.30.32.10/32  # Added by HLE addon\n"
    )
    _connect_from(monkeypatch, "172.30.32.42")

    main._refresh_trusted_proxy()

    text = config.read_text()
    assert "172.30.32.42/32" in text
    assert "172.30.32.10" not in text
    assert main.RESTART_NEEDED.exists()


def test_refresh_leaves_user_entries_alone(config, monkeypatch) -> None:
    config.write_text(
        "http:\n"
        "  use_x_forwarded_for: true\n"
        "  trusted_proxies:\n"
        "    - 192.168.1.0/24\n"
    )
    _connect_from(monkeypatch, "172.30.32.42")

    main._refresh_trusted_proxy()

    text = config.read_text()
    assert "192.168.1.0/24" in text
    assert "172.30.32.42/32" not in text
    assert not main.RESTART_NEEDED.exists()
