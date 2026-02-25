#!/usr/bin/with-contenv bashio

API_KEY=$(bashio::config 'api_key')
RELAY_HOST=$(bashio::config 'relay_host')

if bashio::var.is_empty "${API_KEY}"; then
    bashio::log.warning "No API key configured. Open the HLE panel to set one."
fi

export HLE_API_KEY="${API_KEY}"
export HLE_RELAY_HOST="${RELAY_HOST}"

mkdir -p /data/logs

bashio::log.info "Starting HLE backend..."
exec python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8099 --app-dir /app
