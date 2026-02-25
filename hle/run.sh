#!/usr/bin/with-contenv bashio

# Read options from HA config and export for supervisord children
API_KEY=$(bashio::config 'api_key')
RELAY_HOST=$(bashio::config 'relay_host')

if bashio::var.is_empty "${API_KEY}"; then
    bashio::log.warning "No API key configured. Open the HLE panel to set one."
fi

export HLE_API_KEY="${API_KEY}"
export HLE_RELAY_HOST="${RELAY_HOST}"

# Ensure data directories exist
mkdir -p /data/logs /etc/supervisor/conf.d

# Restore tunnel supervisor configs from saved state
bashio::log.info "Restoring tunnel configurations..."
python3 /app/backend/restore_tunnels.py

bashio::log.info "Starting supervisord..."
exec supervisord -c /etc/supervisord.conf
