"""Entrypoint called at container startup to regenerate supervisord conf files."""

from __future__ import annotations

import sys

sys.path.insert(0, "/app")

from backend.tunnel_manager import restore_all

if __name__ == "__main__":
    restore_all()
    print("Tunnel configs restored.")
