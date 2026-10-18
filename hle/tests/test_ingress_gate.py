"""The add-on API answers the Supervisor's ingress proxy only.

Any other container on the hassio network must be refused, whatever headers
it sends, and the subdomain-keyed relay routes only act on tunnels this
add-on manages.
"""

from __future__ import annotations

import json

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from backend import main
from backend import tunnel_manager as tm

INGRESS = (main.INGRESS_PROXY_IP, 50000)
OTHER_ADDON = ("172.30.33.5", 50000)


@pytest.fixture(autouse=True)
def _tmp_data(tmp_path, monkeypatch):
    monkeypatch.setattr(tm, "DATA_FILE", tmp_path / "tunnels.json")
    monkeypatch.setattr(tm, "LOG_DIR", tmp_path / "logs")
    tm._processes.clear()
    yield
    tm._processes.clear()


def test_ingress_proxy_allowed() -> None:
    client = TestClient(main.app, client=INGRESS)
    assert client.get("/api/tunnels").status_code == 200


def test_loopback_allowed() -> None:
    client = TestClient(main.app, client=("127.0.0.1", 50000))
    assert client.get("/api/tunnels").status_code == 200


@pytest.mark.parametrize(
    "peer", [OTHER_ADDON, ("172.30.32.1", 50000), ("192.0.2.7", 50000)]
)
def test_every_route_refused_from_other_peers(peer) -> None:
    client = TestClient(main.app, client=peer)
    routes = [
        (method, route.path.replace("{", "").replace("}", ""))
        for route in main.app.routes
        if isinstance(route, APIRoute)
        for method in route.methods
    ]
    assert len(routes) > 20
    for method, path in routes:
        resp = client.request(method, path)
        assert resp.status_code == 403, (method, path, resp.status_code)
    assert client.get("/").status_code == 403


def test_spoofed_ingress_headers_refused() -> None:
    client = TestClient(main.app, client=OTHER_ADDON)
    resp = client.get(
        "/api/tunnels",
        headers={
            "X-Ingress-Path": "/api/hassio_ingress/abc",
            "X-Forwarded-For": main.INGRESS_PROXY_IP,
            "X-Hass-Source": "core.ingress",
        },
    )
    assert resp.status_code == 403


def test_subdomain_routes_limited_to_managed_tunnels(tmp_path, monkeypatch) -> None:
    (tmp_path / "tunnels.json").write_text(
        json.dumps(
            {
                "t1": {
                    "id": "t1",
                    "service_url": "http://192.0.2.10:8080",
                    "label": "svc",
                    "subdomain": "svc-owner",
                }
            }
        )
    )
    called = []

    async def _fake(subdomain, *args):
        called.append(subdomain)
        return {"has_pin": False, "updated_at": None}

    monkeypatch.setattr(main.hle_api, "get_pin_status", _fake)
    monkeypatch.setattr(main.hle_api, "remove_basic_auth", _fake)
    client = TestClient(main.app, client=INGRESS)

    assert client.get("/api/tunnels/someone-else/pin").status_code == 404
    assert client.delete("/api/tunnels/someone-else/basic-auth").status_code == 404
    assert called == []
    assert client.get("/api/tunnels/svc-owner/pin").status_code == 200
    assert called == ["svc-owner"]
