#!/usr/bin/with-contenv bashio

# Prefer our own config file (written by the Settings UI, survives addon updates).
# Fall back to the HA addon option (set via the HA UI config tab).
HLE_CONFIG="/data/hle_config.json"
if [ -f "${HLE_CONFIG}" ]; then
    API_KEY=$(python3 -c "import json,sys; print(json.load(open('${HLE_CONFIG}')).get('api_key',''))" 2>/dev/null || echo "")
fi
if bashio::var.is_empty "${API_KEY}"; then
    API_KEY=$(bashio::config 'api_key')
fi

if bashio::var.is_empty "${API_KEY}"; then
    bashio::log.warning "No API key configured. Open the HLE panel to set one."
fi

export HLE_API_KEY="${API_KEY}"

mkdir -p /data/logs

bashio::log.info "Starting HLE backend..."
exec python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8099 --app-dir /app
