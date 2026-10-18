import os
from typing import Any, Dict
from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy.orm import Session
from services.common import models
from services.common.database import get_db
from services.common.logger import attach_standard_middleware_and_handlers
from services.common.resilience import registry
from services.garmin_sync.app import sync_garmin_cloud
from services.reconciliation.app import reconcile_all_days
from services.renpho_sync.app import sync_renpho_cloud
from services.watch6_ingest.app import sync_watch6_export_dir

app = FastAPI(title="Automated Sync & Pipeline Scheduler Orchestrator", version="1.0.0")
logger = attach_standard_middleware_and_handlers(app, "scheduler-orchestrator")

VALID_PROVIDERS = {"all", "renpho", "garmin", "watch6"}


def get_sync_status_bundle(db: Session) -> Dict[str, Any]:
    int_cfg = db.query(models.IntegrationSettings).filter(models.IntegrationSettings.id == 1).first()
    interval = int(
        int_cfg.auto_sync_interval_minutes
        if int_cfg and int_cfg.auto_sync_interval_minutes
        else os.getenv("AUTO_SYNC_INTERVAL_MINUTES", "60")
    )
    logs = (
        db.query(models.SyncLog)
        .order_by(models.SyncLog.created_at.desc())
        .limit(20)
        .all()
    )

    renpho_count = db.query(models.ScaleMeasurement).count()
    garmin_count = (
        db.query(models.DeviceDailyMetric)
        .filter(models.DeviceDailyMetric.device_source == "garmin_band")
        .count()
    )
    watch6_count = (
        db.query(models.DeviceDailyMetric)
        .filter(models.DeviceDailyMetric.device_source == "galaxy_watch6")
        .count()
    )

    providers = [
        {
            "provider": "renpho",
            "device_name": "Renpho Body Fat Scale ES-26BB-B",
            "microservice": "renpho-sync-service",
            "mode": "Bulut API + Web Bluetooth (BLE)",
            "records_count": renpho_count,
            "circuit_state": registry.get_breaker("renpho-sync-service").state,
            "status": "nominal" if registry.get_breaker("renpho-sync-service").state == "CLOSED" else "degraded",
        },
        {
            "provider": "garmin",
            "device_name": "Garmin Smart Band",
            "microservice": "garmin-sync-service",
            "mode": "Garmin Connect OAuth Otomatik Çekim",
            "records_count": garmin_count,
            "circuit_state": registry.get_breaker("garmin-sync-service").state,
            "status": "nominal" if registry.get_breaker("garmin-sync-service").state == "CLOSED" else "degraded",
        },
        {
            "provider": "watch6",
            "device_name": "Samsung Galaxy Watch6",
            "microservice": "watch6-ingest-service",
            "mode": "Health Connect Webhook + Klasör İzleyici",
            "records_count": watch6_count,
            "circuit_state": registry.get_breaker("watch6-ingest-service").state,
            "status": "nominal" if registry.get_breaker("watch6-ingest-service").state == "CLOSED" else "degraded",
        },
    ]

    recent_logs = [
        {
            "id": l.id,
            "provider": l.provider,
            "status": l.status,
            "records_processed": l.records_processed,
            "message": l.message,
            "created_at": l.created_at.isoformat(),
        }
        for l in logs
    ]

    return {
        "auto_sync_interval_minutes": interval,
        "providers": providers,
        "recent_logs": recent_logs,
    }


def trigger_orchestrated_sync(db: Session, provider: str = "all") -> Dict[str, Any]:
    target = str(provider or "all").lower().strip()
    if target not in VALID_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"Geçersiz senkronizasyon sağlayıcısı: '{target}'. Geçerli değerler: all, renpho, garmin, watch6.",
        )

    total_processed = 0
    messages = []

    if target in ("all", "renpho"):
        res_r = registry.call_http_or_local(
            service_name="renpho-sync-service",
            base_url=os.getenv("RENPHO_SERVICE_URL"),
            method="POST",
            path="/sync",
            local_handler=lambda: sync_renpho_cloud(db),
            fallback=lambda: {
                "status": "degraded",
                "provider": "renpho",
                "records_processed": 0,
                "message": "Renpho mikroservisi devre kesici (Circuit Breaker) korumasında.",
            },
        )
        total_processed += int(res_r.get("records_processed", 0))
        messages.append(res_r.get("message", ""))

    if target in ("all", "garmin"):
        res_g = registry.call_http_or_local(
            service_name="garmin-sync-service",
            base_url=os.getenv("GARMIN_SERVICE_URL"),
            method="POST",
            path="/sync",
            local_handler=lambda: sync_garmin_cloud(db),
            fallback=lambda: {
                "status": "degraded",
                "provider": "garmin",
                "records_processed": 0,
                "message": "Garmin mikroservisi devre kesici (Circuit Breaker) korumasında.",
            },
        )
        total_processed += int(res_g.get("records_processed", 0))
        messages.append(res_g.get("message", ""))

    if target in ("all", "watch6"):
        res_w = registry.call_http_or_local(
            service_name="watch6-ingest-service",
            base_url=os.getenv("WATCH6_SERVICE_URL"),
            method="POST",
            path="/sync",
            local_handler=lambda: sync_watch6_export_dir(db),
            fallback=lambda: {
                "status": "degraded",
                "provider": "watch6",
                "records_processed": 0,
                "message": "Watch6 mikroservisi devre kesici (Circuit Breaker) korumasında.",
            },
        )
        total_processed += int(res_w.get("records_processed", 0))
        messages.append(res_w.get("message", ""))

    reconcile_all_days(db)
    return {
        "status": "nominal",
        "provider": target,
        "records_processed": total_processed,
        "message": " | ".join(m for m in messages if m),
    }


@app.get("/health")
def health():
    return {"service": "scheduler-orchestrator", "status": "healthy"}


@app.get("/status")
def status(db: Session = Depends(get_db)):
    return get_sync_status_bundle(db)


@app.post("/trigger")
def trigger(payload: Dict[str, Any], db: Session = Depends(get_db)):
    return trigger_orchestrated_sync(db, provider=str(payload.get("provider") or "all"))
