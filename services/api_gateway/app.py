import json
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List
from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy.orm import Session
from services.ai_advisor.app import build_multi_device_prompt, generate_ai_report, list_ai_reports_data
from services.analytics_anomaly.app import build_analytics_insights, filter_summaries_by_range_and_cycle
from services.common.database import get_db
from services.common.logger import attach_standard_middleware_and_handlers
from services.common.migrate_db import ensure_default_config_and_seed, run_migrations
from services.common.resilience import registry
from services.reconciliation.app import (
    build_wearables_comparison,
    get_or_create_config,
    serialize_config,
    update_config,
)
from services.renpho_sync.app import bulk_delete_scale_records, list_scale_records, upsert_scale_measurement
from services.scheduler.app import get_sync_status_bundle, trigger_orchestrated_sync
from services.watch6_ingest.app import (
    get_or_create_integration_settings,
    get_webhook_heartbeat_monitor,
    import_health_file_payload,
    record_webhook_heartbeat,
    serialize_integration_settings,
    update_integration_settings,
    upsert_watch6_daily_records,
)

ROOT_DIR = Path(__file__).resolve().parent.parent.parent
VERSION_FILE = ROOT_DIR / "VERSION"
CHANGELOG_FILE = ROOT_DIR / "CHANGELOG.md"

from contextlib import asynccontextmanager


@asynccontextmanager
async def lifespan(_app: FastAPI):
    run_migrations()
    logger.info("HealthSync API Gateway initialized with 8 microservices registered.")
    yield


app = FastAPI(title="HealthSync Multi-Device Telemetry & Intelligence API", version="1.0.0", lifespan=lifespan)
logger = attach_standard_middleware_and_handlers(app, "api-gateway")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


def _read_version_and_commit() -> tuple[str, str]:
    version = os.getenv("APP_VERSION", "").strip()
    if not version and VERSION_FILE.exists():
        version = VERSION_FILE.read_text(encoding="utf-8").strip()
    version = version or "1.0.0"
    commit = os.getenv("GIT_COMMIT", "HEAD").strip() or "HEAD"
    return version, commit


class SyncTriggerPayload(BaseModel):
    provider: str = "all"


class WebhookIngestPayload(BaseModel):
    device_source: str
    records: List[Dict[str, Any]]


class BleScalePayload(BaseModel):
    timestamp: str | None = None
    weight_kg: float
    impedance_ohm: float | None = None
    body_fat_pct: float | None = None
    muscle_mass_kg: float | None = None
    water_pct: float | None = None
    visceral_fat: float | None = None
    bone_mass_kg: float | None = None
    bmr_kcal: int | None = None
    protein_pct: float | None = None
    metabolic_age: int | None = None


class FileImportPayload(BaseModel):
    file_name: str
    format: str
    device_source: str = "galaxy_watch6"
    content_base64: str


class ReconciliationRulesUpdatePayload(BaseModel):
    weight_priority: List[str]
    sleep_priority: List[str]
    activity_priority: List[str]
    heart_priority: List[str]
    merge_strategy: str
    cycle_start_date: str
    target_weight_kg: float
    height_cm: float


class BulkDeletePayload(BaseModel):
    ids: List[int]


class AiAnalyzePayload(BaseModel):
    focus_area: str = "holistic"


class IntegrationSettingsUpdatePayload(BaseModel):
    renpho_email: str = ""
    renpho_password: str | None = None
    garmin_email: str = ""
    garmin_password: str | None = None
    gemini_api_key: str | None = None
    webhook_secret: str | None = None
    watch_export_dir: str = "/data/watch_exports"
    auto_sync_interval_minutes: int = 60
    webhook_expected_interval_minutes: int = 60


class WebhookHeartbeatPingPayload(BaseModel):
    source: str = "galaxy_watch6"
    device_label: str | None = None
    event_type: str = "heartbeat"
    records_received: int = 0
    latency_ms: float = 1.4
    payload_summary: str | None = None



@app.get("/api/health")
def get_health(db: Session = Depends(get_db)):
    ensure_default_config_and_seed(db)
    version, commit = _read_version_and_commit()
    services = registry.all_statuses()
    overall = "healthy" if all(s["status"] == "healthy" for s in services) else "degraded"
    return {
        "status": overall,
        "version": version,
        "commit": commit,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "services": services,
    }


@app.get("/api/changelog")
def get_changelog():
    version, commit = _read_version_and_commit()
    changelog_text = (
        CHANGELOG_FILE.read_text(encoding="utf-8")
        if CHANGELOG_FILE.exists()
        else f"# Değişiklik Günlüğü\n\n## v{version}\n- İlk sürüm."
    )
    return {
        "version": version,
        "commit": commit,
        "changelog": changelog_text,
    }


@app.get("/api/sync/status")
def get_sync_status(db: Session = Depends(get_db)):
    ensure_default_config_and_seed(db)
    return registry.call_http_or_local(
        service_name="scheduler-orchestrator",
        base_url=os.getenv("SCHEDULER_SERVICE_URL"),
        method="GET",
        path="/status",
        local_handler=lambda: get_sync_status_bundle(db),
        fallback=lambda: {
            "auto_sync_interval_minutes": 60,
            "providers": [],
            "recent_logs": [],
        },
    )


@app.post("/api/sync/trigger")
def trigger_sync(payload: SyncTriggerPayload, db: Session = Depends(get_db)):
    ensure_default_config_and_seed(db)
    return registry.call_http_or_local(
        service_name="scheduler-orchestrator",
        base_url=os.getenv("SCHEDULER_SERVICE_URL"),
        method="POST",
        path="/trigger",
        json_body=payload.model_dump(),
        local_handler=lambda: trigger_orchestrated_sync(db, provider=payload.provider),
    )


@app.post("/api/ingest/webhook")
def ingest_webhook(payload: WebhookIngestPayload, db: Session = Depends(get_db)):
    ensure_default_config_and_seed(db)

    def _op():
        count = upsert_watch6_daily_records(db, payload.records, source=payload.device_source)
        return {
            "status": "nominal",
            "ingested_count": count,
            "message": f"{payload.device_source} kaynağından {count} kayıt otomatik işlendi.",
        }

    return registry.call_http_or_local(
        service_name="watch6-ingest-service",
        base_url=os.getenv("WATCH6_SERVICE_URL"),
        method="POST",
        path="/webhook",
        json_body=payload.model_dump(),
        local_handler=_op,
    )


@app.post("/api/ingest/ble-scale")
def ingest_ble_scale(payload: BleScalePayload, db: Session = Depends(get_db)):
    ensure_default_config_and_seed(db)

    def _op():
        rec = upsert_scale_measurement(db, payload.model_dump(exclude_none=True))
        return {
            "status": "nominal",
            "ingested_count": 1,
            "message": f"Renpho ES-26BB-B Web Bluetooth ölçümü ({rec.weight_kg} kg) kaydedildi.",
        }

    return registry.call_http_or_local(
        service_name="renpho-sync-service",
        base_url=os.getenv("RENPHO_SERVICE_URL"),
        method="POST",
        path="/ble-scale",
        json_body=payload.model_dump(exclude_none=True),
        local_handler=_op,
    )


@app.post("/api/ingest/import-file")
def import_health_file(payload: FileImportPayload, db: Session = Depends(get_db)):
    ensure_default_config_and_seed(db)
    return registry.call_http_or_local(
        service_name="watch6-ingest-service",
        base_url=os.getenv("WATCH6_SERVICE_URL"),
        method="POST",
        path="/import-file",
        json_body=payload.model_dump(),
        local_handler=lambda: import_health_file_payload(payload.model_dump(), db),
    )


@app.get("/api/reconciliation/rules")
def get_reconciliation_rules(db: Session = Depends(get_db)):
    return registry.call_http_or_local(
        service_name="reconciliation-service",
        base_url=os.getenv("RECONCILIATION_SERVICE_URL"),
        method="GET",
        path="/rules",
        local_handler=lambda: serialize_config(get_or_create_config(db)),
    )


@app.put("/api/reconciliation/rules")
def update_reconciliation_rules(payload: ReconciliationRulesUpdatePayload, db: Session = Depends(get_db)):
    return registry.call_http_or_local(
        service_name="reconciliation-service",
        base_url=os.getenv("RECONCILIATION_SERVICE_URL"),
        method="PUT",
        path="/rules",
        json_body=payload.model_dump(),
        local_handler=lambda: update_config(db, payload.model_dump()),
    )


@app.get("/api/dashboard/overview")
def get_dashboard_overview(range: str = "30d", scope: str = "all", db: Session = Depends(get_db)):
    if range not in ("7d", "30d", "90d", "cycle"):
        raise HTTPException(status_code=400, detail="Geçersiz zaman aralığı (range). 7d, 30d, 90d veya cycle seçin.")
    if scope not in ("all", "renpho", "garmin", "watch6"):
        raise HTTPException(status_code=400, detail="Geçersiz kapsam (scope). all, renpho, garmin veya watch6 seçin.")

    ensure_default_config_and_seed(db)
    summaries, window_status, cycle_start = filter_summaries_by_range_and_cycle(db, range_key=range)
    insights = registry.call_http_or_local(
        service_name="analytics-anomaly-service",
        base_url=os.getenv("ANALYTICS_SERVICE_URL"),
        method="GET",
        path="/insights",
        params={"range": range},
        local_handler=lambda: build_analytics_insights(db, range_key=range),
        fallback=lambda: {
            "window_status": window_status,
            "recovery_score": 0.0,
            "recovery_status": "degraded",
            "composition_quality": {},
            "correlations": [],
            "anomalies": [],
            "rolling_series": [],
        },
    )

    if not summaries or window_status == "pending":
        return {
            "last_updated": datetime.now(timezone.utc).isoformat(),
            "range": range,
            "scope": scope,
            "window_status": "pending",
            "cycle_start_date": cycle_start,
            "metrics": [
                {"key": "weight", "label": "Güncel Kilo", "value": "Bekleniyor", "delta": "Yeni döngü", "target_tab": "scale"},
                {"key": "body_fat", "label": "Vücut Yağ Oranı", "value": "Bekleniyor", "delta": "Yeni döngü", "target_tab": "scale"},
                {"key": "muscle", "label": "Kas Kütlesi", "value": "Bekleniyor", "delta": "Yeni döngü", "target_tab": "scale"},
                {"key": "recovery", "label": "Toparlanma Skoru", "value": "Bekleniyor", "delta": "Yeni döngü", "target_tab": "insights"},
                {"key": "steps", "label": "Günlük Adım", "value": "Bekleniyor", "delta": "Yeni döngü", "target_tab": "wearables"},
                {"key": "sleep", "label": "Uyku Süresi", "value": "Bekleniyor", "delta": "Yeni döngü", "target_tab": "wearables"},
            ],
            "weight_series": [],
            "recovery_series": [],
            "daily_rows": [],
            "anomalies": insights.get("anomalies", []),
            "services": registry.all_statuses(),
        }

    latest = summaries[-1]
    first = summaries[0]

    def _fmt_delta(cur: float | None, prev: float | None, unit: str) -> str:
        if cur is None or prev is None:
            return f"0.0 {unit}"
        diff = round(cur - prev, 2)
        sign = "+" if diff > 0 else ""
        return f"{sign}{diff} {unit}"

    metrics = [
        {
            "key": "weight",
            "label": "Güncel Kilo (Renpho)",
            "value": f"{latest.weight_kg:.2f} kg" if latest.weight_kg is not None else "-",
            "delta": _fmt_delta(latest.weight_kg, first.weight_kg, "kg"),
            "target_tab": "scale",
        },
        {
            "key": "body_fat",
            "label": "Yağ Oranı (ES-26BB-B)",
            "value": f"%{latest.body_fat_pct:.1f}" if latest.body_fat_pct is not None else "-",
            "delta": _fmt_delta(latest.body_fat_pct, first.body_fat_pct, "puan"),
            "target_tab": "scale",
        },
        {
            "key": "muscle",
            "label": "Kas Kütlesi (ES-26BB-B)",
            "value": f"{latest.muscle_mass_kg:.2f} kg" if latest.muscle_mass_kg is not None else "-",
            "delta": _fmt_delta(latest.muscle_mass_kg, first.muscle_mass_kg, "kg"),
            "target_tab": "scale",
        },
        {
            "key": "recovery",
            "label": "Toparlanma Skoru",
            "value": f"{latest.recovery_score:.0f} / 100",
            "delta": _fmt_delta(latest.recovery_score, first.recovery_score, "puan"),
            "target_tab": "insights",
        },
        {
            "key": "steps",
            "label": "Günlük Adım (Watch6/Garmin)",
            "value": f"{latest.steps:,}".replace(",", "."),
            "delta": f"{latest.steps - first.steps:+d} adım",
            "target_tab": "wearables",
        },
        {
            "key": "sleep",
            "label": "Uyku Süresi (Garmin/Watch6)",
            "value": f"{latest.sleep_hours:.1f} sa" if latest.sleep_hours is not None else "-",
            "delta": _fmt_delta(latest.sleep_hours, first.sleep_hours, "sa"),
            "target_tab": "wearables",
        },
    ]

    rolling = insights.get("rolling_series", [])
    weight_series = [
        {
            "id": "Kilo (kg)",
            "data": [{"x": r["date"][5:], "y": r["weight_kg"]} for r in rolling if r.get("weight_kg") is not None],
        },
        {
            "id": "7g Ort. Kilo (kg)",
            "data": [
                {"x": r["date"][5:], "y": r["rolling_7d_weight_kg"]}
                for r in rolling
                if r.get("rolling_7d_weight_kg") is not None
            ],
        },
        {
            "id": "Kas Kütlesi (kg)",
            "data": [
                {"x": r["date"][5:], "y": r["muscle_mass_kg"]}
                for r in rolling
                if r.get("muscle_mass_kg") is not None
            ],
        },
    ]

    recovery_series = [
        {
            "id": "Toparlanma Skoru",
            "data": [{"x": r["date"][5:], "y": r["recovery_score"]} for r in rolling if r.get("recovery_score") is not None],
        },
        {
            "id": "HRV (ms)",
            "data": [{"x": r["date"][5:], "y": r["hrv_ms"]} for r in rolling if r.get("hrv_ms") is not None],
        },
        {
            "id": "Dinlenik Nabız (bpm)",
            "data": [
                {"x": r["date"][5:], "y": r["resting_hr_bpm"]}
                for r in rolling
                if r.get("resting_hr_bpm") is not None
            ],
        },
    ]

    daily_rows = []
    for s in reversed(summaries):
        attr = json.loads(s.source_attribution_json or "{}")
        daily_rows.append(
            {
                "id": s.id,
                "date": s.date,
                "weight_kg": s.weight_kg,
                "body_fat_pct": s.body_fat_pct,
                "muscle_mass_kg": s.muscle_mass_kg,
                "water_pct": s.water_pct,
                "steps": s.steps,
                "sleep_hours": s.sleep_hours,
                "resting_hr_bpm": s.resting_hr_bpm,
                "hrv_ms": s.hrv_ms,
                "stress_score": s.stress_score,
                "body_battery_max": s.body_battery_max,
                "recovery_score": s.recovery_score,
                "primary_source": f"Tartı:{attr.get('weight', '-')}|Uyku:{attr.get('sleep', '-')}|Adım:{attr.get('steps', '-')}",
            }
        )

    return {
        "last_updated": datetime.now(timezone.utc).isoformat(),
        "range": range,
        "scope": scope,
        "window_status": window_status,
        "cycle_start_date": cycle_start,
        "metrics": metrics,
        "weight_series": weight_series,
        "recovery_series": recovery_series,
        "daily_rows": daily_rows,
        "anomalies": insights.get("anomalies", []),
        "services": registry.all_statuses(),
    }


@app.get("/api/measurements/scale")
def list_scale_measurements(limit: int = 60, db: Session = Depends(get_db)):
    ensure_default_config_and_seed(db)
    return registry.call_http_or_local(
        service_name="renpho-sync-service",
        base_url=os.getenv("RENPHO_SERVICE_URL"),
        method="GET",
        path="/measurements",
        params={"limit": limit},
        local_handler=lambda: list_scale_records(db, limit=limit),
    )


@app.post("/api/measurements/scale/bulk-delete")
def bulk_delete_scale_measurements(payload: BulkDeletePayload, db: Session = Depends(get_db)):
    ensure_default_config_and_seed(db)
    return bulk_delete_scale_records(db, ids=payload.ids)


@app.get("/api/wearables/comparison")
def get_wearables_comparison(days: int = 30, db: Session = Depends(get_db)):
    ensure_default_config_and_seed(db)
    return registry.call_http_or_local(
        service_name="reconciliation-service",
        base_url=os.getenv("RECONCILIATION_SERVICE_URL"),
        method="GET",
        path="/comparison",
        params={"days": days},
        local_handler=lambda: build_wearables_comparison(db, days=days),
    )


@app.get("/api/analytics/insights")
def get_analytics_insights(range: str = "30d", db: Session = Depends(get_db)):
    ensure_default_config_and_seed(db)
    return registry.call_http_or_local(
        service_name="analytics-anomaly-service",
        base_url=os.getenv("ANALYTICS_SERVICE_URL"),
        method="GET",
        path="/insights",
        params={"range": range},
        local_handler=lambda: build_analytics_insights(db, range_key=range),
    )


@app.get("/api/ai/prompts")
def get_ai_prompts(db: Session = Depends(get_db)):
    ensure_default_config_and_seed(db)
    return registry.call_http_or_local(
        service_name="ai-advisor-service",
        base_url=os.getenv("AI_SERVICE_URL"),
        method="GET",
        path="/prompts",
        local_handler=lambda: build_multi_device_prompt(db),
    )


@app.post("/api/ai/analyze")
def create_ai_analysis(payload: AiAnalyzePayload, db: Session = Depends(get_db)):
    ensure_default_config_and_seed(db)
    return registry.call_http_or_local(
        service_name="ai-advisor-service",
        base_url=os.getenv("AI_SERVICE_URL"),
        method="POST",
        path="/analyze",
        json_body=payload.model_dump(),
        local_handler=lambda: generate_ai_report(db, focus_area=payload.focus_area),
    )


@app.get("/api/ai/reports")
def list_ai_reports(db: Session = Depends(get_db)):
    ensure_default_config_and_seed(db)
    return registry.call_http_or_local(
        service_name="ai-advisor-service",
        base_url=os.getenv("AI_SERVICE_URL"),
        method="GET",
        path="/reports",
        local_handler=lambda: list_ai_reports_data(db),
    )


@app.get("/api/settings")
def get_integration_settings(db: Session = Depends(get_db)):
    ensure_default_config_and_seed(db)
    return registry.call_http_or_local(
        service_name="watch6-ingest-service",
        base_url=os.getenv("WATCH6_SERVICE_URL"),
        method="GET",
        path="/settings",
        local_handler=lambda: serialize_integration_settings(get_or_create_integration_settings(db)),
    )


@app.put("/api/settings")
def put_integration_settings(payload: IntegrationSettingsUpdatePayload, db: Session = Depends(get_db)):
    ensure_default_config_and_seed(db)
    return registry.call_http_or_local(
        service_name="watch6-ingest-service",
        base_url=os.getenv("WATCH6_SERVICE_URL"),
        method="PUT",
        path="/settings",
        json_body=payload.model_dump(exclude_none=True),
        local_handler=lambda: update_integration_settings(db, payload.model_dump(exclude_none=True)),
    )


@app.get("/api/webhook/heartbeat")
def get_webhook_heartbeat(db: Session = Depends(get_db)):
    ensure_default_config_and_seed(db)
    return registry.call_http_or_local(
        service_name="watch6-ingest-service",
        base_url=os.getenv("WATCH6_SERVICE_URL"),
        method="GET",
        path="/heartbeat",
        local_handler=lambda: get_webhook_heartbeat_monitor(db),
    )


@app.post("/api/webhook/heartbeat")
def send_webhook_heartbeat(payload: WebhookHeartbeatPingPayload, db: Session = Depends(get_db)):
    ensure_default_config_and_seed(db)
    return registry.call_http_or_local(
        service_name="watch6-ingest-service",
        base_url=os.getenv("WATCH6_SERVICE_URL"),
        method="POST",
        path="/heartbeat",
        json_body=payload.model_dump(exclude_none=True),
        local_handler=lambda: record_webhook_heartbeat(db, payload.model_dump(exclude_none=True)),
    )

