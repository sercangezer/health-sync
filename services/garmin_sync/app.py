import contextlib
import io
import os
import threading
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List
from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy.orm import Session
from services.common import models
from services.common.database import get_db
from services.common.logger import attach_standard_middleware_and_handlers

app = FastAPI(title="Garmin Smart Band Sync Microservice", version="1.0.0")
logger = attach_standard_middleware_and_handlers(app, "garmin-sync-service")

_GARMIN_LOCK = threading.Lock()
_GARMIN_TOKENSTORE_FILE = Path("/tmp/garmin_tokenstore.json")
_GARMIN_TOKENSTORE_MEM: Dict[str, str] = {}


def upsert_garmin_daily_records(
    db: Session, records: List[Dict[str, Any]], emit_log: bool = True
) -> int:
    if not records:
        raise HTTPException(status_code=400, detail="Garmin veri listesi boş olamaz.")

    count = 0
    for item in records:
        d_str = str(item.get("date") or "").strip()
        if len(d_str) != 10:
            raise HTTPException(status_code=400, detail=f"Geçersiz tarih formatı: '{d_str}'. YYYY-MM-DD bekleniyor.")

        steps = int(item.get("steps") or 0)
        if steps < 0 or steps > 150000:
            raise HTTPException(status_code=400, detail="Geçersiz adım sayısı değeri.")

        existing = (
            db.query(models.DeviceDailyMetric)
            .filter(
                models.DeviceDailyMetric.date == d_str,
                models.DeviceDailyMetric.device_source == "garmin_band",
            )
            .first()
        )
        if not existing:
            existing = models.DeviceDailyMetric(date=d_str, device_source="garmin_band")
            db.add(existing)

        existing.steps = steps
        existing.active_calories_kcal = float(item.get("active_calories_kcal") or round(steps * 0.043, 1))
        existing.total_calories_kcal = float(item.get("total_calories_kcal") or round(1740 + existing.active_calories_kcal, 1))
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
        if item.get("body_battery_max") is not None:
            existing.body_battery_max = int(item["body_battery_max"])
        if item.get("body_battery_min") is not None:
            existing.body_battery_min = int(item["body_battery_min"])
        if item.get("spo2_pct") is not None:
            existing.spo2_pct = float(item["spo2_pct"])
        if item.get("vo2_max") is not None:
            existing.vo2_max = float(item["vo2_max"])
        if item.get("exercise_minutes") is not None:
            existing.exercise_minutes = int(item["exercise_minutes"])
        existing.updated_at = datetime.now(timezone.utc)
        count += 1

    if emit_log:
        db.add(
            models.SyncLog(
                provider="garmin",
                status="nominal",
                records_processed=count,
                message=f"Garmin Smart Band kaynağından {count} günlük kayıt işlendi.",
            )
        )
        db.add(
            models.WebhookHeartbeat(
                source="garmin_band",
                device_label="Garmin Smart Band (Connect Bridge)",
                event_type="webhook_ingest",
                status="healthy",
                records_received=count,
                latency_ms=1.7,
                payload_summary=f"Garmin Smart Band üzerinden {count} günlük kayıt alındı.",
            )
        )
    db.commit()
    return count


def sync_garmin_cloud(db: Session) -> Dict[str, Any]:
    """
    Pulls daily stats, heart rate, sleep stages, stress, Body Battery, and HRV
    from Garmin Connect when GARMIN_EMAIL and GARMIN_PASSWORD are set.
    """
    int_cfg = db.query(models.IntegrationSettings).filter(models.IntegrationSettings.id == 1).first()
    email = (int_cfg.garmin_email if int_cfg and int_cfg.garmin_email else os.getenv("GARMIN_EMAIL", "")).strip()
    password = (int_cfg.garmin_password if int_cfg and int_cfg.garmin_password else os.getenv("GARMIN_PASSWORD", "")).strip()

    if not (email and password):
        total_garmin = (
            db.query(models.DeviceDailyMetric)
            .filter(models.DeviceDailyMetric.device_source == "garmin_band")
            .count()
        )
        msg = (
            f"Garmin Connect hesabı tanımlı değil (mevcut kayıt: {total_garmin}). "
            "Ayarlar sekmesinden Garmin e-posta ve parolanızı kaydedin."
        )
        db.add(
            models.SyncLog(
                provider="garmin",
                status="waiting",
                records_processed=0,
                message=msg,
            )
        )
        db.commit()
        return {"status": "waiting", "provider": "garmin", "records_processed": 0, "message": msg}

    synced = 0
    with _GARMIN_LOCK:
        try:
            from garminconnect import Garmin  # type: ignore

            api = Garmin(email, password)
            tokenstore_str = _GARMIN_TOKENSTORE_MEM.get(email)
            if not tokenstore_str and _GARMIN_TOKENSTORE_FILE.exists():
                try:
                    tokenstore_str = _GARMIN_TOKENSTORE_FILE.read_text(encoding="utf-8").strip()
                except Exception:
                    tokenstore_str = None

            capture_buf = io.StringIO()
            with contextlib.redirect_stdout(capture_buf), contextlib.redirect_stderr(capture_buf):
                api.login(tokenstore=tokenstore_str)

            if hasattr(api, "client") and hasattr(api.client, "dumps"):
                try:
                    dumped = api.client.dumps()
                    if dumped:
                        _GARMIN_TOKENSTORE_MEM[email] = dumped
                        _GARMIN_TOKENSTORE_FILE.write_text(dumped, encoding="utf-8")
                except Exception:
                    pass

            today = date.today()
            batch: List[Dict[str, Any]] = []
            for offset in range(14):
                d_str = (today - timedelta(days=offset)).isoformat()
                stats = api.get_stats(d_str) or {}
                hr = api.get_heart_rates(d_str) or {}
                sleep_full = api.get_sleep_data(d_str) or {}
                sleep = sleep_full.get("dailySleepDTO") or {}
                sleep_sec = float(sleep.get("sleepTimeSeconds") or 0)
                total_steps = int(stats.get("totalSteps") or 0)
                rhr = hr.get("restingHeartRate") or stats.get("restingHeartRate")
                overnight_hrv = sleep_full.get("avgOvernightHrv") or sleep.get("avgOvernightHrv")
                exercise_mins = int(stats.get("moderateIntensityMinutes") or 0) + int(
                    stats.get("vigorousIntensityMinutes") or 0
                )
                if total_steps <= 0 and sleep_sec <= 0 and rhr is None and overnight_hrv is None:
                    continue
                batch.append(
                    {
                        "date": d_str,
                        "steps": total_steps,
                        "active_calories_kcal": float(stats.get("activeKilocalories") or 0.0),
                        "total_calories_kcal": float(stats.get("totalKilocalories") or 0.0),
                        "resting_hr_bpm": rhr,
                        "min_hr_bpm": hr.get("minHeartRate") or stats.get("minHeartRate"),
                        "max_hr_bpm": hr.get("maxHeartRate") or stats.get("maxHeartRate"),
                        "hrv_ms": round(float(overnight_hrv), 1) if overnight_hrv is not None else None,
                        "sleep_hours": round(sleep_sec / 3600.0, 2) if sleep_sec > 0 else None,
                        "deep_sleep_hours": round(float(sleep.get("deepSleepSeconds") or 0) / 3600.0, 2),
                        "light_sleep_hours": round(float(sleep.get("lightSleepSeconds") or 0) / 3600.0, 2),
                        "rem_sleep_hours": round(float(sleep.get("remSleepSeconds") or 0) / 3600.0, 2),
                        "sleep_score": (sleep.get("sleepScores", {}).get("overall", {}) or {}).get("value"),
                        "stress_score": stats.get("averageStressLevel"),
                        "body_battery_max": stats.get("bodyBatteryHighestValue"),
                        "body_battery_min": stats.get("bodyBatteryLowestValue"),
                        "spo2_pct": stats.get("averageSpo2"),
                        "exercise_minutes": exercise_mins,
                    }
                )
            if batch:
                synced = upsert_garmin_daily_records(db, batch, emit_log=False)
        except Exception as exc:
            logger.warning(f"Garmin Connect cloud sync failed: {exc}")
            err_msg = f"Garmin Connect bağlantısı başarısız: {exc}"
            db.add(
                models.SyncLog(
                    provider="garmin",
                    status="degraded",
                    records_processed=0,
                    message=err_msg,
                )
            )
            db.add(
                models.WebhookHeartbeat(
                    source="garmin_band",
                    device_label="Garmin Smart Band (Connect Bridge)",
                    event_type="cloud_sync",
                    status="degraded",
                    records_received=0,
                    latency_ms=0.0,
                    payload_summary=err_msg,
                )
            )
            db.commit()
            return {"status": "degraded", "provider": "garmin", "records_processed": 0, "message": err_msg}

    msg = f"Garmin Smart Band bulut senkronizasyonu tamamlandı ({synced} günlük kayıt çekildi)."
    db.add(
        models.SyncLog(
            provider="garmin",
            status="nominal",
            records_processed=synced,
            message=msg,
        )
    )
    db.add(
        models.WebhookHeartbeat(
            source="garmin_band",
            device_label="Garmin Smart Band (Connect Bridge)",
            event_type="cloud_sync",
            status="healthy",
            records_received=synced,
            latency_ms=1.9,
            payload_summary=msg,
        )
    )
    db.commit()
    return {"status": "nominal", "provider": "garmin", "records_processed": synced, "message": msg}


@app.get("/health")
def health():
    return {"service": "garmin-sync-service", "status": "healthy"}


@app.post("/sync")
def trigger_garmin_sync(db: Session = Depends(get_db)):
    return sync_garmin_cloud(db)
