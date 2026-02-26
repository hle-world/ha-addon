ARG BUILD_FROM
FROM $BUILD_FROM

RUN pip3 install --no-cache-dir \
        hle-client==1.1.2 \
        fastapi \
        uvicorn \
    && find /usr/lib/python3* /usr/local/lib/python3* -type d -name "*.dist-info" -exec rm -rf {} + 2>/dev/null; \
       find /usr/lib/python3* /usr/local/lib/python3* -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null; true

COPY backend/ /app/backend/
COPY static/ /app/backend/static
COPY run.sh /run.sh
RUN chmod +x /run.sh && mkdir -p /data/logs

CMD ["/run.sh"]
