"""Proxy helpers: calls to the HLE relay server API using ApiClient from hle-client."""

from __future__ import annotations

import os

from hle_client.api import ApiClient, ApiClientConfig


def _client() -> ApiClient:
    api_key = os.environ.get("HLE_API_KEY", "")
    relay_host = os.environ.get("HLE_RELAY_HOST", "hle.world")
    return ApiClient(ApiClientConfig(relay_host=relay_host, api_key=api_key))


async def list_live_tunnels() -> list[dict]:
    return await _client().list_tunnels()


async def list_access_rules(subdomain: str) -> list[dict]:
    return await _client().list_access_rules(subdomain)


async def add_access_rule(subdomain: str, email: str, provider: str = "any") -> dict:
    return await _client().add_access_rule(subdomain, email, provider)


async def delete_access_rule(subdomain: str, rule_id: int) -> dict:
    return await _client().delete_access_rule(subdomain, rule_id)
