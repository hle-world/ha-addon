"""Pydantic models for the HLE add-on management API."""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel


class TunnelConfig(BaseModel):
    id: str
    service_url: str
    label: str
    auth_mode: Literal["sso", "none"] = "sso"
    verify_ssl: bool = False
    subdomain: Optional[str] = None  # populated once tunnel connects to relay


class TunnelStatus(TunnelConfig):
    state: Literal["RUNNING", "STOPPED"] = "STOPPED"
    public_url: Optional[str] = None
    pid: Optional[int] = None


class AddTunnelRequest(BaseModel):
    service_url: str
    label: str
    auth_mode: Literal["sso", "none"] = "sso"
    verify_ssl: bool = False


class UpdateConfigRequest(BaseModel):
    api_key: str


class AddAccessRuleRequest(BaseModel):
    email: str
    provider: Literal["any", "google", "github", "hle"] = "any"


class SetPinRequest(BaseModel):
    pin: str  # 4-8 digits


class CreateShareLinkRequest(BaseModel):
    duration: Literal["1h", "24h", "7d"] = "24h"
    label: str = ""
    max_uses: Optional[int] = None
