ARG BUILD_FROM
FROM $BUILD_FROM

RUN apk add --no-cache supervisor jq \
    && pip3 install --no-cache-dir \
        hle-client \
        fastapi \
        uvicorn \
        httpx

COPY backend/ /app/backend/
COPY static/ /app/backend/static
COPY supervisord.conf /etc/supervisord.conf
COPY run.sh /run.sh
RUN chmod +x /run.sh \
    && mkdir -p /etc/supervisor/conf.d /data/logs

CMD ["/run.sh"]
