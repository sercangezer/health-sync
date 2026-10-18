import contextvars
import json
import logging
import os
import sys
import uuid
from datetime import datetime, timezone
from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

correlation_id_var: contextvars.ContextVar[str] = contextvars.ContextVar("correlation_id", default="N/A")


class SingleLineJsonFormatter(logging.Formatter):
    """Formats every log record as a strict single-line JSON object on stdout."""

    def __init__(self, component_name: str):
        super().__init__()
        self.component_name = component_name

    def format(self, record: logging.LogRecord) -> str:
        msg = record.getMessage().replace("\n", " ").replace("\r", " ")
        payload = {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "level": record.levelname,
            "component": getattr(record, "component", None) or self.component_name or record.name,
            "message": msg,
            "correlation_id": correlation_id_var.get(),
        }
        if record.exc_info:
            exc_text = self.formatException(record.exc_info).replace("\n", " | ")
            payload["exception"] = exc_text
        return json.dumps(payload, ensure_ascii=False)


def setup_logger(component_name: str) -> logging.Logger:
    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    level = getattr(logging, level_name, logging.INFO)

    logger = logging.getLogger(component_name)
    logger.setLevel(level)
    logger.propagate = False

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(SingleLineJsonFormatter(component_name))
    logger.handlers = [handler]

    for uv_name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        uv_logger = logging.getLogger(uv_name)
        uv_logger.setLevel(level)
        uv_logger.handlers = [handler]
        uv_logger.propagate = False

    return logger


def attach_standard_middleware_and_handlers(app: FastAPI, component_name: str) -> logging.Logger:
    logger = setup_logger(component_name)

    @app.middleware("http")
    async def correlation_and_access_log(request: Request, call_next):
        corr_id = request.headers.get("X-Correlation-ID") or str(uuid.uuid4())
        correlation_id_var.set(corr_id)
        logger.info(f"Incoming request: {request.method} {request.url.path}")
        response = await call_next(request)
        response.headers["X-Correlation-ID"] = corr_id
        logger.info(f"Completed request: {request.method} {request.url.path} status={response.status_code}")
        return response

    @app.exception_handler(HTTPException)
    async def http_exception_handler(request: Request, exc: HTTPException):
        detail_str = exc.detail if isinstance(exc.detail, str) else json.dumps(exc.detail, ensure_ascii=False)
        logger.warning(f"HTTP {exc.status_code} on {request.url.path}: {detail_str}")
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "error_code": f"HTTP_{exc.status_code}",
                "message": detail_str,
                "details": f"{request.method} {request.url.path}",
            },
        )

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError):
        err_summary = json.dumps(exc.errors(), ensure_ascii=False, default=str)
        logger.warning(f"Validation error on {request.url.path}: {err_summary}")
        return JSONResponse(
            status_code=422,
            content={
                "error_code": "VALIDATION_ERROR",
                "message": "İstek verisi şema doğrulamasından geçemedi.",
                "details": err_summary,
            },
        )

    @app.exception_handler(Exception)
    async def unhandled_exception_handler(request: Request, exc: Exception):
        logger.warning(f"Handled unexpected error on {request.url.path}: {exc}")
        return JSONResponse(
            status_code=500,
            content={
                "error_code": "INTERNAL_SERVICE_ERROR",
                "message": "İç servis işlemi sırasında beklenmeyen bir durum oluştu.",
                "details": type(exc).__name__,
            },
        )

    return logger
