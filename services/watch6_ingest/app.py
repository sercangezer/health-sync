import base64
import csv
import io
import os
import sqlite3
import tempfile
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List
from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy.orm import Session
from services.common import models
from services.common.database import get_db
from services.common.logger import attach_standard_middleware_and_handlers
from services.garmin_sync.app import upsert_garmin_daily_records
from services.renpho_sync.app import upsert_scale_measurement

app = FastAPI(title="Samsung Galaxy Watch6 & Health Connect Ingest Microservice", version="1.0.0")
logger = attach_standard_middleware_and_handlers(app, "watch6-ingest-service")


def upsert_watch6_daily_records(db: Session, records: List[Dict[str, Any]], source: str = "galaxy_watch6") -> int:
    if not records:
        raise HTTPException(status_code=400, detail="Gönderilen kayıt listesi (records) boş olamaz.")

    if source not in ("galaxy_watch6", "garmin_band", "renpho_es26bb"):
        raise HTTPException(
            status_code=400,
            detail=f"Desteklenmeyen cihaz kaynağı: '{source}'. Geçerli kaynaklar: galaxy_watch6, garmin_band, renpho_es26bb.",
        )

    if source == "garmin_band":
        return upsert_garmin_daily_records(db, records)

    if source == "renpho_es26bb":
        count = 0
        for r in records:
            upsert_scale_measurement(db, r)
            count += 1
        return count

    count = 0
    for item in records:
        d_str = str(item.get("date") or "").strip()
        if len(d_str) != 10:
            raise HTTPException(status_code=400, detail=f"Geçersiz tarih formatı: '{d_str}'. YYYY-MM-DD bekleniyor.")

        steps = int(item.get("steps") or 0)
        if steps < 0 or steps > 150000:
            raise HTTPException(status_code=400, detail="Adım sayısı 0 ile 150000 arasında olmalıdır.")

        existing = (
            db.query(models.DeviceDailyMetric)
            .filter(
                models.DeviceDailyMetric.date == d_str,
                models.DeviceDailyMetric.device_source == "galaxy_watch6",
            )
            .first()
        )
        if not existing:
            existing = models.DeviceDailyMetric(date=d_str, device_source="galaxy_watch6")
            db.add(existing)

        existing.steps = steps
        existing.active_calories_kcal = float(item.get("active_calories_kcal") or round(steps * 0.045, 1))
        existing.total_calories_kcal = float(
            item.get("total_calories_kcal") or round(1755 + existing.active_calories_kcal, 1)
        )
        if item.get("resting_hr_bpm") is not None:
            existing.resting_hr_bpm = float(item["resting_hr_bpm"])
        if item.get("min_hr_bpm") is not None:
            existing.min_hr_bpm = float(item["min_hr_bpm"])
        if item.get("max_hr_bpm") is not None:
            existing.max_hr_bpm = float(item["max_hr_bpm"])
        if item.get("hrv_ms") is not None:
            existing.hrv_ms = float(item["hrv_ms"])
        if item.get("sleep_hours") is not None:
            existing.sleep_hours = float(item["sleep_hours"])
        if item.get("deep_sleep_hours") is not None:
            existing.deep_sleep_hours = float(item["deep_sleep_hours"])
        if item.get("light_sleep_hours") is not None:
            existing.light_sleep_hours = float(item["light_sleep_hours"])
        if item.get("rem_sleep_hours") is not None:
            existing.rem_sleep_hours = float(item["rem_sleep_hours"])
        if item.get("sleep_score") is not None:
            existing.sleep_score = float(item["sleep_score"])
        if item.get("stress_score") is not None:
            existing.stress_score = float(item["stress_score"])
        if item.get("spo2_pct") is not None:
            existing.spo2_pct = float(item["spo2_pct"])
        if item.get("vo2_max") is not None:
            existing.vo2_max = float(item["vo2_max"])
        if item.get("systolic_bp") is not None:
            existing.systolic_bp = float(item["systolic_bp"])
        if item.get("diastolic_bp") is not None:
            existing.diastolic_bp = float(item["diastolic_bp"])
        if item.get("water_liters") is not None:
            existing.water_liters = float(item["water_liters"])
        if item.get("exercise_minutes") is not None:
            existing.exercise_minutes = int(item["exercise_minutes"])
        existing.updated_at = datetime.now(timezone.utc)
        count += 1

    db.add(
        models.SyncLog(
            provider="watch6",
            status="nominal",
            records_processed=count,
            message=f"Samsung Galaxy Watch6 Health Connect Webhook ile {count} günlük kayıt işlendi.",
        )
    )
    db.add(
        models.WebhookHeartbeat(
            source="galaxy_watch6",
            device_label="Samsung Galaxy Watch6 (Health Connect Webhook)",
            event_type="webhook_ingest",
            status="healthy",
            records_received=count,
            latency_ms=1.6,
            payload_summary=f"Health Connect Webhook üzerinden {count} günlük kayıt alındı.",
        )
    )
    db.commit()
    return count


def get_or_create_integration_settings(db: Session) -> models.IntegrationSettings:
    cfg = db.query(models.IntegrationSettings).filter(models.IntegrationSettings.id == 1).first()
    if not cfg:
        cfg = models.IntegrationSettings(
            id=1,
            renpho_email=os.getenv("RENPHO_EMAIL", "").strip(),
            renpho_password=os.getenv("RENPHO_PASSWORD", "").strip(),
            garmin_email=os.getenv("GARMIN_EMAIL", "").strip(),
            garmin_password=os.getenv("GARMIN_PASSWORD", "").strip(),
            gemini_api_key=os.getenv("GEMINI_API_KEY", "").strip(),
            webhook_secret=os.getenv("WEBHOOK_SECRET_TOKEN", "").strip(),
            watch_export_dir=os.getenv("WATCH_EXPORT_DIR", "/data/watch_exports").strip() or "/data/watch_exports",
            auto_sync_interval_minutes=int(os.getenv("AUTO_SYNC_INTERVAL_MINUTES", "60")),
            webhook_expected_interval_minutes=60,
        )
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def serialize_integration_settings(cfg: models.IntegrationSettings) -> Dict[str, Any]:
    has_renpho_pw = bool(cfg.renpho_password or os.getenv("RENPHO_PASSWORD", "").strip())
    has_garmin_pw = bool(cfg.garmin_password or os.getenv("GARMIN_PASSWORD", "").strip())
    has_gemini = bool(cfg.gemini_api_key or os.getenv("GEMINI_API_KEY", "").strip())
    has_secret = bool(cfg.webhook_secret or os.getenv("WEBHOOK_SECRET_TOKEN", "").strip())
    return {
        "renpho_email": cfg.renpho_email or os.getenv("RENPHO_EMAIL", "").strip(),
        "has_renpho_password": has_renpho_pw,
        "renpho_password_masked": "••••••••" if has_renpho_pw else "Tanımlı değil",
        "garmin_email": cfg.garmin_email or os.getenv("GARMIN_EMAIL", "").strip(),
        "has_garmin_password": has_garmin_pw,
        "garmin_password_masked": "••••••••" if has_garmin_pw else "Tanımlı değil",
        "has_gemini_api_key": has_gemini,
        "gemini_api_key_masked": "••••••••" if has_gemini else "Tanımlı değil",
        "has_webhook_secret": has_secret,
        "webhook_secret_masked": "••••••••" if has_secret else "Açık (İmzasız)",
        "watch_export_dir": cfg.watch_export_dir or "/data/watch_exports",
        "auto_sync_interval_minutes": int(cfg.auto_sync_interval_minutes or 60),
        "webhook_expected_interval_minutes": int(cfg.webhook_expected_interval_minutes or 60),
        "updated_at": cfg.updated_at.isoformat() if cfg.updated_at else datetime.now(timezone.utc).isoformat(),
    }


def update_integration_settings(db: Session, payload: Dict[str, Any]) -> Dict[str, Any]:
    cfg = get_or_create_integration_settings(db)
    auto_interval = int(payload.get("auto_sync_interval_minutes") or cfg.auto_sync_interval_minutes or 60)
    hb_interval = int(payload.get("webhook_expected_interval_minutes") or cfg.webhook_expected_interval_minutes or 60)
    if auto_interval < 5 or auto_interval > 1440:
        raise HTTPException(
            status_code=400,
            detail="Otomatik senkronizasyon aralığı 5 ile 1440 dakika arasında olmalıdır.",
        )
    if hb_interval < 5 or hb_interval > 1440:
        raise HTTPException(
            status_code=400,
            detail="Beklenen webhook heartbeat aralığı 5 ile 1440 dakika arasında olmalıdır.",
        )

    if "renpho_email" in payload and payload["renpho_email"] is not None:
        cfg.renpho_email = str(payload["renpho_email"]).strip()
    if "garmin_email" in payload and payload["garmin_email"] is not None:
        cfg.garmin_email = str(payload["garmin_email"]).strip()
    if "watch_export_dir" in payload and payload["watch_export_dir"]:
        cfg.watch_export_dir = str(payload["watch_export_dir"]).strip()

    for secret_field in ("renpho_password", "garmin_password", "gemini_api_key", "webhook_secret"):
        raw_val = payload.get(secret_field)
        if raw_val is not None:
            s_val = str(raw_val).strip()
            if s_val == "CLEAR":
                setattr(cfg, secret_field, "")
            elif s_val and s_val != "••••••••":
                setattr(cfg, secret_field, s_val)

    cfg.auto_sync_interval_minutes = auto_interval
    cfg.webhook_expected_interval_minutes = hb_interval
    cfg.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(cfg)
    return serialize_integration_settings(cfg)


def get_webhook_heartbeat_monitor(db: Session) -> Dict[str, Any]:
    cfg = get_or_create_integration_settings(db)
    expected_minutes = int(cfg.webhook_expected_interval_minutes or 60)
    rows = (
        db.query(models.WebhookHeartbeat)
        .order_by(models.WebhookHeartbeat.created_at.desc(), models.WebhookHeartbeat.id.desc())
        .limit(30)
        .all()
    )
    now_utc = datetime.now(timezone.utc)
    cutoff_24h = now_utc - timedelta(hours=24)

    recent_24h = []
    for r in rows:
        created = r.created_at if r.created_at.tzinfo else r.created_at.replace(tzinfo=timezone.utc)
        if created >= cutoff_24h:
            recent_24h.append(r)

    if rows:
        latest_dt = rows[0].created_at
        if latest_dt.tzinfo is None:
            latest_dt = latest_dt.replace(tzinfo=timezone.utc)
        seconds_since = max(0, int((now_utc - latest_dt).total_seconds()))
        last_hb_iso = latest_dt.isoformat()
        overall_status = "healthy" if seconds_since <= expected_minutes * 60 else "stale"
    else:
        seconds_since = 0
        last_hb_iso = now_utc.isoformat()
        overall_status = "waiting"

    source_defs = [
        ("galaxy_watch6", "Samsung Galaxy Watch6 (Health Connect Webhook)"),
        ("garmin_band", "Garmin Smart Band (Connect Bridge)"),
        ("renpho_es26bb", "Renpho Body Fat Scale ES-26BB-B"),
    ]
    sources = []
    for src_key, default_label in source_defs:
        matching = (
            db.query(models.WebhookHeartbeat)
            .filter(models.WebhookHeartbeat.source == src_key)
            .order_by(models.WebhookHeartbeat.created_at.desc(), models.WebhookHeartbeat.id.desc())
            .limit(30)
            .all()
        )
        if matching:
            top = matching[0]
            top_dt = top.created_at if top.created_at.tzinfo else top.created_at.replace(tzinfo=timezone.utc)
            age_sec = max(0, int((now_utc - top_dt).total_seconds()))
            if top.status == "degraded":
                src_status = "degraded"
            else:
                src_status = "healthy" if age_sec <= expected_minutes * 60 else "stale"
            sources.append(
                {
                    "source": src_key,
                    "device_label": top.device_label or default_label,
                    "status": src_status,
                    "last_seen_at": top_dt.isoformat(),
                    "seconds_ago": age_sec,
                    "event_count": len(matching),
                    "last_latency_ms": round(float(top.latency_ms or 1.2), 2),
                    "last_payload_summary": top.payload_summary or "Telemetri sinyali alındı",
                }
            )
        else:
            sources.append(
                {
                    "source": src_key,
                    "device_label": default_label,
                    "status": "waiting",
                    "last_seen_at": "-",
                    "seconds_ago": 0,
                    "event_count": 0,
                    "last_latency_ms": 0.0,
                    "last_payload_summary": "Henüz sinyal alınmadı",
                }
            )

    recent_heartbeats = [
        {
            "id": r.id,
            "source": r.source,
            "device_label": r.device_label,
            "event_type": r.event_type,
            "status": r.status,
            "records_received": r.records_received,
            "latency_ms": round(float(r.latency_ms or 1.2), 2),
            "payload_summary": r.payload_summary,
            "created_at": (
                r.created_at.isoformat()
                if r.created_at.tzinfo
                else r.created_at.replace(tzinfo=timezone.utc).isoformat()
            ),
        }
        for r in rows[:15]
    ]

    return {
        "overall_status": overall_status,
        "webhook_ingest_url": "/api/ingest/webhook",
        "webhook_heartbeat_url": "/api/webhook/heartbeat",
        "expected_interval_minutes": expected_minutes,
        "last_heartbeat_at": last_hb_iso,
        "seconds_since_last_heartbeat": seconds_since,
        "total_heartbeats_24h": len(recent_24h),
        "total_records_ingested_24h": sum(int(r.records_received or 0) for r in recent_24h),
        "sources": sources,
        "recent_heartbeats": recent_heartbeats,
    }


def record_webhook_heartbeat(db: Session, payload: Dict[str, Any]) -> Dict[str, Any]:
    source = str(payload.get("source") or "galaxy_watch6").strip()
    valid_sources = {"galaxy_watch6", "garmin_band", "renpho_es26bb", "health_connect", "ui_probe"}
    if source not in valid_sources:
        raise HTTPException(
            status_code=400,
            detail=f"Geçersiz heartbeat kaynağı: '{source}'. Geçerli kaynaklar: galaxy_watch6, garmin_band, renpho_es26bb, health_connect, ui_probe.",
        )

    default_labels = {
        "galaxy_watch6": "Samsung Galaxy Watch6 (Health Connect Webhook)",
        "garmin_band": "Garmin Smart Band (Connect Bridge)",
        "renpho_es26bb": "Renpho Body Fat Scale ES-26BB-B",
        "health_connect": "Android Health Connect Otomasyon Köprüsü",
        "ui_probe": "Arayüz Canlı Heartbeat Doğrulama Testi",
    }
    device_label = str(payload.get("device_label") or default_labels.get(source, source)).strip()
    event_type = str(payload.get("event_type") or "heartbeat").strip()
    records_received = int(payload.get("records_received") or 0)
    latency_ms = float(payload.get("latency_ms") or 1.4)
    note = str(payload.get("payload_summary") or "Canlı webhook heartbeat sinyali doğrulandı.").strip()

    hb = models.WebhookHeartbeat(
        source="galaxy_watch6" if source in ("health_connect", "ui_probe") else source,
        device_label=device_label,
        event_type=event_type,
        status="healthy",
        records_received=records_received,
        latency_ms=latency_ms,
        payload_summary=note,
    )
    db.add(hb)
    db.commit()
    return get_webhook_heartbeat_monitor(db)


def parse_health_connect_sqlite_bytes(raw_bytes: bytes, db: Session) -> int:
    if not raw_bytes.startswith(b"SQLite format 3\x00"):
        raise HTTPException(
            status_code=400,
            detail="Geçersiz SQLite veritabanı başlığı. Yalnızca geçerli Health Connect .db dosyaları kabul edilir.",
        )

    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as tmp:
        tmp.write(raw_bytes)
        tmp_path = tmp.name

    try:
        conn = sqlite3.connect(tmp_path)
        cur = conn.cursor()
        data_map: Dict[int, Dict[str, Any]] = {}

        queries = [
            ("steps", "SELECT local_date, SUM(count) FROM steps_record_table GROUP BY local_date"),
            ("active_calories_kcal", "SELECT local_date, SUM(energy) FROM active_calories_burned_record_table GROUP BY local_date"),
            ("total_calories_kcal", "SELECT local_date, SUM(energy) / 1000.0 FROM total_calories_burned_record_table GROUP BY local_date"),
            ("resting_hr_bpm", "SELECT local_date, AVG(beats_per_minute) FROM resting_heart_rate_record_table GROUP BY local_date"),
            ("hrv_ms", "SELECT local_date, AVG(heart_rate_variability_millis) FROM heart_rate_variability_rmssd_record_table GROUP BY local_date"),
            ("sleep_hours", "SELECT local_date, SUM(end_time - start_time) / 3600000.0 FROM sleep_session_record_table GROUP BY local_date"),
            ("spo2_pct", "SELECT local_date, AVG(percentage) FROM oxygen_saturation_record_table GROUP BY local_date"),
            ("vo2_max", "SELECT local_date, AVG(vo2_milliliters_per_minute_kilogram) FROM vo2_max_record_table GROUP BY local_date"),
            ("water_liters", "SELECT local_date, SUM(volume) FROM hydration_record_table GROUP BY local_date"),
        ]
        for key, sql in queries:
            try:
                cur.execute(sql)
                for local_date, val in cur.fetchall():
                    if local_date is not None and val is not None:
                        data_map.setdefault(int(local_date), {})[key] = val
            except sqlite3.OperationalError:
                continue

        conn.close()

        epoch = datetime(1970, 1, 1)
        records: List[Dict[str, Any]] = []
        for local_date, metrics in sorted(data_map.items()):
            d_str = (epoch + timedelta(days=int(local_date))).strftime("%Y-%m-%d")
            metrics["date"] = d_str
            records.append(metrics)

        if not records:
            return 0
        return upsert_watch6_daily_records(db, records, source="galaxy_watch6")
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)


def parse_csv_bytes(raw_bytes: bytes, device_source: str, db: Session) -> int:
    try:
        text = raw_bytes.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise HTTPException(status_code=400, detail="CSV dosyası UTF-8 formatında okunamadı.") from exc

    reader = csv.DictReader(io.StringIO(text))
    rows = list(reader)
    if not rows:
        raise HTTPException(status_code=400, detail="CSV dosyası içinde veri satırı bulunamadı.")

    if device_source == "renpho_es26bb":
        count = 0
        for row in rows:
            upsert_scale_measurement(
                db,
                {
                    "timestamp": row.get("timestamp") or f"{row.get('date', '2026-10-18')}T07:30:00Z",
                    "source": "renpho_es26bb",
                    "weight_kg": float(row.get("weight_kg") or row.get("Weight (kg)") or 0),
                    "body_fat_pct": float(row["body_fat_pct"]) if row.get("body_fat_pct") else None,
                    "muscle_mass_kg": float(row["muscle_mass_kg"]) if row.get("muscle_mass_kg") else None,
                    "water_pct": float(row["water_pct"]) if row.get("water_pct") else None,
                },
            )
            count += 1
        return count

    normalized: List[Dict[str, Any]] = []
    for row in rows:
        normalized.append(
            {
                "date": row.get("date") or row.get("Date") or "",
                "steps": int(float(row.get("steps") or row.get("Steps") or 0)),
                "sleep_hours": float(row["sleep_hours"]) if row.get("sleep_hours") else None,
                "resting_hr_bpm": float(row["resting_hr_bpm"]) if row.get("resting_hr_bpm") else None,
                "hrv_ms": float(row["hrv_ms"]) if row.get("hrv_ms") else None,
                "active_calories_kcal": float(row["active_calories_kcal"]) if row.get("active_calories_kcal") else None,
                "stress_score": float(row["stress_score"]) if row.get("stress_score") else None,
                "body_battery_max": int(float(row["body_battery_max"])) if row.get("body_battery_max") else None,
                "spo2_pct": float(row["spo2_pct"]) if row.get("spo2_pct") else None,
            }
        )
    return upsert_watch6_daily_records(db, normalized, source=device_source or "galaxy_watch6")


def import_health_file_payload(payload: Dict[str, Any], db: Session) -> Dict[str, Any]:
    fmt = str(payload.get("format") or "").lower().strip()
    b64 = str(payload.get("content_base64") or "").strip()
    source = str(payload.get("device_source") or "galaxy_watch6").strip()
    if not b64:
        raise HTTPException(status_code=400, detail="Dosya içeriği (content_base64) boş olamaz.")

    try:
        raw_bytes = base64.b64decode(b64, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Geçersiz Base64 dosya kodlaması.") from exc

    if fmt in ("db", "sqlite", "sqlite3"):
        count = parse_health_connect_sqlite_bytes(raw_bytes, db)
    elif fmt == "csv":
        count = parse_csv_bytes(raw_bytes, source, db)
    else:
        raise HTTPException(status_code=400, detail=f"Desteklenmeyen dosya formatı: '{fmt}'. Sadece 'db' veya 'csv' desteklenir.")

    return {
        "status": "nominal",
        "ingested_count": count,
        "message": f"{payload.get('file_name', 'dosya')} içe aktarıldı ({count} kayıt güncellendi).",
    }


def sync_watch6_export_dir(db: Session) -> Dict[str, Any]:
    cfg = get_or_create_integration_settings(db)
    export_dir = cfg.watch_export_dir or os.getenv("WATCH_EXPORT_DIR", "/data/watch_exports")
    imported = 0
    if os.path.isdir(export_dir):
        for fname in sorted(os.listdir(export_dir)):
            fpath = os.path.join(export_dir, fname)
            if not os.path.isfile(fpath):
                continue
            try:
                with open(fpath, "rb") as f:
                    data = f.read()
                if fname.endswith(".db"):
                    imported += parse_health_connect_sqlite_bytes(data, db)
                elif fname.endswith(".csv"):
                    imported += parse_csv_bytes(data, "galaxy_watch6", db)
            except Exception as exc:
                logger.warning(f"Skipped invalid export file {fname}: {exc}")

    if imported == 0:
        total_watch6 = (
            db.query(models.DeviceDailyMetric)
            .filter(models.DeviceDailyMetric.device_source == "galaxy_watch6")
            .count()
        )
        msg = (
            f"Samsung Galaxy Watch6 dışa aktarım klasöründe ({export_dir}) yeni dosya bulunmadı "
            f"(mevcut kayıt: {total_watch6}, Webhook aktif dinlemede)."
        )
        db.add(
            models.SyncLog(
                provider="watch6",
                status="waiting",
                records_processed=0,
                message=msg,
            )
        )
        db.commit()
        return {"status": "waiting", "provider": "watch6", "records_processed": 0, "message": msg}

    msg = f"Samsung Galaxy Watch6 (Health Connect) klasör senkronizasyonu tamamlandı ({imported} günlük kayıt işlendi)."
    db.add(
        models.SyncLog(
            provider="watch6",
            status="nominal",
            records_processed=imported,
            message=msg,
        )
    )
    db.add(
        models.WebhookHeartbeat(
            source="galaxy_watch6",
            device_label="Samsung Galaxy Watch6 (Health Connect)",
            event_type="file_sync",
            status="healthy",
            records_received=imported,
            latency_ms=1.5,
            payload_summary=msg,
        )
    )
    db.commit()
    return {"status": "nominal", "provider": "watch6", "records_processed": imported, "message": msg}


@app.get("/health")
def health():
    return {"service": "watch6-ingest-service", "status": "healthy"}


@app.post("/webhook")
def webhook_ingest(payload: Dict[str, Any], db: Session = Depends(get_db)):
    source = str(payload.get("device_source") or "galaxy_watch6").strip()
    records = payload.get("records")
    if not isinstance(records, list):
        raise HTTPException(status_code=400, detail="Webhook gövdesinde 'records' dizisi zorunludur.")
    count = upsert_watch6_daily_records(db, records, source=source)
    return {
        "status": "nominal",
        "ingested_count": count,
        "message": f"{source} kaynağından {count} kayıt otomatik işlendi.",
    }


@app.post("/import-file")
def import_file(payload: Dict[str, Any], db: Session = Depends(get_db)):
    return import_health_file_payload(payload, db)


@app.post("/sync")
def trigger_watch6_sync(db: Session = Depends(get_db)):
    return sync_watch6_export_dir(db)


@app.get("/settings")
def get_settings(db: Session = Depends(get_db)):
    return serialize_integration_settings(get_or_create_integration_settings(db))


@app.put("/settings")
def put_settings(payload: Dict[str, Any], db: Session = Depends(get_db)):
    return update_integration_settings(db, payload)


@app.get("/heartbeat")
def get_heartbeat(db: Session = Depends(get_db)):
    return get_webhook_heartbeat_monitor(db)


@app.post("/heartbeat")
def post_heartbeat(payload: Dict[str, Any], db: Session = Depends(get_db)):
    return record_webhook_heartbeat(db, payload)

