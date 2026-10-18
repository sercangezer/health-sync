FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app

COPY services/requirements.txt /app/services/requirements.txt
RUN pip install --no-cache-dir -r /app/services/requirements.txt

COPY VERSION CHANGELOG.md /app/
COPY api /app/api
COPY services /app/services

EXPOSE 8000
CMD ["sh", "-c", "exec uvicorn ${SERVICE_MODULE:-services.api_gateway.app:app} --host 0.0.0.0 --port ${SERVICE_PORT:-8000}"]
