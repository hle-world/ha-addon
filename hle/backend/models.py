"""Pydantic models for the HLE add-on management API."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel


class TunnelConfig(BaseModel):
    id: str
    service_url: str
    label: str
    auth_mode: Literal["sso", "none"] = "sso"
    relay_host: str = "hle.world"


class TunnelStatus(TunnelConfig):
    """TunnelConfig extended with live supervisord state."""

    state: Literal["RUNNING", "STOPPED", "STARTING", "FATAL", "UNKNOWN"] = "UNKNOWN"
    public_url: Optional[str] = None
    pid: Optional[int] = None


class AddTunnelRequest(BaseModel):
    service_url: str
    label: str
    auth_mode: Literal["sso", "none"] = "sso"


class UpdateConfigRequest(BaseModel):
    api_key: str
    relay_host: str = "hle.world"


class AddAccessRuleRequest(BaseModel):
    email: str
    provider: Literal["any", "google", "github", "hle"] = "any"
