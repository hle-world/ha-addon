## 2026-02-25 00:00

Initial scaffold: HA add-on for Home Lab Everywhere.

- Add-on manifest, Dockerfile, supervisord config
- FastAPI backend: tunnel management via supervisord XML-RPC, HLE API proxy
- React frontend skeleton: dashboard, settings, access rules

<details>
<summary>Technical details</summary>

- Uses `hle-client` from PyPI to drive `hle expose` subprocesses via supervisord
- Tunnel configs persisted to `/data/tunnels.json`, restored on container restart
- Frontend served via HA Ingress (hash routing to avoid base-path issues)

</details>
