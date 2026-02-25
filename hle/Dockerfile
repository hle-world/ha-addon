ARG BUILD_FROM
FROM $BUILD_FROM

# Install system dependencies
RUN apk add --no-cache \
    supervisor \
    nodejs \
    npm \
    jq

# Install Python backend dependencies
COPY backend/requirements.txt /app/backend/requirements.txt
RUN pip3 install --no-cache-dir -r /app/backend/requirements.txt

# Build frontend
COPY frontend/ /app/frontend/
RUN cd /app/frontend \
    && npm ci \
    && npm run build \
    && mv dist /app/backend/static \
    && rm -rf /app/frontend

# Copy backend
COPY backend/ /app/backend/

# Copy supervisor base config and entrypoint
COPY supervisord.conf /etc/supervisord.conf
COPY run.sh /run.sh
RUN chmod +x /run.sh

# Supervisor will write dynamic tunnel configs here
RUN mkdir -p /etc/supervisor/conf.d /data/logs

CMD ["/run.sh"]
