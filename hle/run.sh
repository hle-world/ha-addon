#!/usr/bin/with-contenv bashio

export HLE_DATA_DIR="/data"
mkdir -p /data/logs

# ---------------------------------------------------------------------------
# Agent mode — every tunnel is declared in the hle.world dashboard rather than
# in this add-on. Enabled by setting the `agent_token` option (Configuration
# tab) or by writing `agent_token` into /data/hle_config.json.
#
# In this mode the add-on runs the agent instead of the local backend, so the
# HLE panel is not served — you manage endpoints from the dashboard.
# ---------------------------------------------------------------------------
AGENT_TOKEN="$(bashio::config 'agent_token')"
if bashio::var.is_empty "${AGENT_TOKEN}" || [ "${AGENT_TOKEN}" = "null" ]; then
    AGENT_TOKEN=""
    if [ -f /data/hle_config.json ]; then
        AGENT_TOKEN=$(python3 -c "import json; print(json.load(open('/data/hle_config.json')).get('agent_token',''))" 2>/dev/null || echo "")
    fi
fi

if [ -n "${AGENT_TOKEN}" ]; then
    export HLE_AGENT_TOKEN="${AGENT_TOKEN}"
    bashio::log.info "Starting HLE in agent mode — endpoints are managed from the dashboard."
    bashio::log.info "The HLE panel is not served in agent mode."
    # The Supervisor restarts the add-on if this exits, so no local supervisor.
    exec hle agent run
fi

# API key is managed entirely by the HLE addon UI (written to /data/hle_config.json).
# It is NOT stored in the HA addon options — only the agent token is, because
# agent mode has no local UI to enter it in.
API_KEY=""
HLE_CONFIG="/data/hle_config.json"
if [ -f "${HLE_CONFIG}" ]; then
    API_KEY=$(python3 -c "import json,sys; print(json.load(open('${HLE_CONFIG}')).get('api_key',''))" 2>/dev/null || echo "")
fi

if bashio::var.is_empty "${API_KEY}"; then
    bashio::log.warning "No API key configured. Open the HLE panel to set one."
fi

export HLE_API_KEY="${API_KEY}"

bashio::log.info "Starting HLE backend..."
exec python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8099 --app-dir /app
