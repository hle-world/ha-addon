"""Thin wrapper around the supervisord XML-RPC API via Unix socket."""

from __future__ import annotations

import http.client
import socket
import xmlrpc.client

SUPERVISOR_SOCK = "/var/run/supervisor.sock"


class _UnixStreamTransport(xmlrpc.client.Transport):
    """Connect to supervisord over a Unix domain socket instead of TCP."""

    def make_connection(self, host: str) -> http.client.HTTPConnection:
        class _UnixHTTPConn(http.client.HTTPConnection):
            def connect(self) -> None:
                self.sock = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
                self.sock.connect(SUPERVISOR_SOCK)

        return _UnixHTTPConn(host)


def get_client() -> xmlrpc.client.ServerProxy:
    return xmlrpc.client.ServerProxy("http://localhost", transport=_UnixStreamTransport())


# ---------------------------------------------------------------------------
# Convenience helpers (all synchronous — supervisord XML-RPC is sync)
# ---------------------------------------------------------------------------

def start(name: str) -> None:
    get_client().supervisor.startProcess(name)


def stop(name: str) -> None:
    get_client().supervisor.stopProcess(name)


def get_state(name: str) -> dict:
    """Return supervisord process info dict, or a synthetic UNKNOWN entry."""
    try:
        return get_client().supervisor.getProcessInfo(name)
    except xmlrpc.client.Fault:
        return {"statename": "UNKNOWN", "pid": 0}


def reload_and_add(name: str) -> None:
    """Tell supervisord to pick up a new conf file and start the process."""
    client = get_client()
    client.supervisor.reloadConfig()
    try:
        client.supervisor.addProcessGroup(name)
    except xmlrpc.client.Fault:
        # Group already known — update instead
        client.supervisor.reloadConfig()


def remove(name: str) -> None:
    """Stop and deregister a process group from supervisord."""
    client = get_client()
    try:
        client.supervisor.stopProcess(name)
    except xmlrpc.client.Fault:
        pass
    try:
        client.supervisor.removeProcessGroup(name)
    except xmlrpc.client.Fault:
        pass
