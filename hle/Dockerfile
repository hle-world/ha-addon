# ARG declared globally so it can be used in the FROM of stage 2
ARG BUILD_FROM

# Stage 1: build the React frontend
FROM node:22-alpine AS frontend
WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# Stage 2: final image
FROM $BUILD_FROM

RUN apk add --no-cache supervisor jq \
    && pip3 install --no-cache-dir \
        hle-client \
        fastapi \
        uvicorn \
        httpx

COPY backend/ /app/backend/
COPY --from=frontend /build/dist /app/backend/static
COPY supervisord.conf /etc/supervisord.conf
COPY run.sh /run.sh
RUN chmod +x /run.sh \
    && mkdir -p /etc/supervisor/conf.d /data/logs

CMD ["/run.sh"]
