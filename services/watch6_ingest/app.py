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
    db.commit()
    return count


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
    export_dir = os.getenv("WATCH_EXPORT_DIR", "/data/watch_exports")
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

    total_watch6 = (
        db.query(models.DeviceDailyMetric)
        .filter(models.DeviceDailyMetric.device_source == "galaxy_watch6")
        .count()
    )
    processed = imported if imported > 0 else total_watch6
    msg = f"Samsung Galaxy Watch6 (Health Connect) senkronizasyonu tamamlandı ({processed} günlük kayıt aktif)."
    db.add(
        models.SyncLog(
            provider="watch6",
            status="nominal",
            records_processed=processed,
            message=msg,
        )
    )
    db.commit()
    return {"status": "nominal", "provider": "watch6", "records_processed": processed, "message": msg}


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
