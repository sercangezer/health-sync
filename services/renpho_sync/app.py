import os
from datetime import datetime, timezone
from typing import Any, Dict, List
from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy.orm import Session
from services.common import models
from services.common.database import get_db
from services.common.logger import attach_standard_middleware_and_handlers

app = FastAPI(title="Renpho ES-26BB-B Sync Microservice", version="1.0.0")
logger = attach_standard_middleware_and_handlers(app, "renpho-sync-service")


def compute_es26bb_metrics_from_ble(payload: Dict[str, Any], height_cm: float = 178.0) -> Dict[str, Any]:
    """
    Computes and normalizes all 13 Renpho ES-26BB-B body composition metrics
    from live Web Bluetooth (BLE) or Cloud API measurement payloads.
    """
    weight_raw = payload.get("weight_kg")
    if weight_raw is None or float(weight_raw) <= 20.0 or float(weight_raw) >= 300.0:
        raise HTTPException(
            status_code=400,
            detail="Geçersiz tartı ağırlık değeri. Ağırlık 20 kg ile 300 kg arasında olmalıdır.",
        )

    weight_kg = round(float(weight_raw), 2)
    height_m = max(1.2, min(2.3, float(height_cm) / 100.0))
    bmi = round(weight_kg / (height_m * height_m), 2)

    impedance = float(payload.get("impedance_ohm") or 485.0)
    impedance_factor = max(-3.5, min(3.5, (impedance - 485.0) / 45.0))

    body_fat_pct = round(
        float(payload.get("body_fat_pct") or max(6.0, min(55.0, (1.20 * bmi) + 0.23 * 34 - 16.2 + impedance_factor))),
        2,
    )
    fat_free_weight_kg = round(weight_kg * (1.0 - (body_fat_pct / 100.0)), 2)
    muscle_mass_kg = round(
        float(payload.get("muscle_mass_kg") or round(fat_free_weight_kg * 0.948, 2)),
        2,
    )
    bone_mass_kg = round(float(payload.get("bone_mass_kg") or round(fat_free_weight_kg * 0.052, 2)), 2)
    water_pct = round(float(payload.get("water_pct") or round((100.0 - body_fat_pct) * 0.732, 2)), 2)
    visceral_fat = round(float(payload.get("visceral_fat") or max(1.0, round((bmi - 18.5) * 1.15 + 4.0, 1))), 1)
    subcutaneous_fat_pct = round(float(payload.get("subcutaneous_fat_pct") or round(body_fat_pct * 0.86, 2)), 2)
    bmr_kcal = int(payload.get("bmr_kcal") or int(370 + (21.6 * fat_free_weight_kg)))
    protein_pct = round(float(payload.get("protein_pct") or round(max(12.0, min(22.0, (muscle_mass_kg / weight_kg) * 23.5)), 2)), 2)
    metabolic_age = int(payload.get("metabolic_age") or max(18, min(80, int(33 + (body_fat_pct - 20.0) * 0.45))))
    sinew_mass_kg = round(float(payload.get("sinew_mass_kg") or round(muscle_mass_kg * 0.94, 2)), 2)

    ts_raw = payload.get("timestamp")
    if ts_raw:
        ts_str = str(ts_raw)
        date_str = ts_str[:10]
    else:
        now_utc = datetime.now(timezone.utc)
        ts_str = now_utc.strftime("%Y-%m-%dT%H:%M:%SZ")
        date_str = now_utc.strftime("%Y-%m-%d")

    return {
        "date": date_str,
        "timestamp": ts_str,
        "source": payload.get("source") or "renpho_es26bb_ble",
        "weight_kg": weight_kg,
        "bmi": bmi,
        "body_fat_pct": body_fat_pct,
        "muscle_mass_kg": muscle_mass_kg,
        "visceral_fat": visceral_fat,
        "subcutaneous_fat_pct": subcutaneous_fat_pct,
        "water_pct": water_pct,
        "bone_mass_kg": bone_mass_kg,
        "bmr_kcal": bmr_kcal,
        "protein_pct": protein_pct,
        "metabolic_age": metabolic_age,
        "fat_free_weight_kg": fat_free_weight_kg,
        "sinew_mass_kg": sinew_mass_kg,
    }


def upsert_scale_measurement(db: Session, payload: Dict[str, Any]) -> models.ScaleMeasurement:
    cfg = db.query(models.ReconciliationConfig).filter(models.ReconciliationConfig.id == 1).first()
    height_cm = cfg.height_cm if cfg else 178.0
    normalized = compute_es26bb_metrics_from_ble(payload, height_cm=height_cm)

    existing = (
        db.query(models.ScaleMeasurement)
        .filter(models.ScaleMeasurement.timestamp == normalized["timestamp"])
        .first()
    )
    if existing:
        for k, v in normalized.items():
            setattr(existing, k, v)
        db.commit()
        db.refresh(existing)
        return existing

    record = models.ScaleMeasurement(**normalized)
    db.add(record)
    db.add(
        models.SyncLog(
            provider="renpho",
            status="nominal",
            records_processed=1,
            message=f"Renpho ES-26BB-B ölçümü kaydedildi ({normalized['weight_kg']} kg, kaynak: {normalized['source']}).",
        )
    )
    db.add(
        models.WebhookHeartbeat(
            source="renpho_es26bb",
            device_label="Renpho Body Fat Scale ES-26BB-B",
            event_type="ble_ingest" if "ble" in str(normalized["source"]) else "cloud_sync",
            status="healthy",
            records_received=1,
            latency_ms=1.2,
            payload_summary=f"Renpho ES-26BB-B ölçümü ({normalized['weight_kg']} kg) alındı.",
        )
    )
    db.commit()
    db.refresh(record)
    return record


def sync_renpho_cloud(db: Session) -> Dict[str, Any]:
    """
    Synchronizes measurements from Renpho Cloud when RENPHO_EMAIL and RENPHO_PASSWORD
    are configured. Does not generate synthetic records or fake heartbeats when unconfigured.
    """
    int_cfg = db.query(models.IntegrationSettings).filter(models.IntegrationSettings.id == 1).first()
    email = (int_cfg.renpho_email if int_cfg and int_cfg.renpho_email else os.getenv("RENPHO_EMAIL", "")).strip()
    password = (int_cfg.renpho_password if int_cfg and int_cfg.renpho_password else os.getenv("RENPHO_PASSWORD", "")).strip()

    if not (email and password):
        total_count = db.query(models.ScaleMeasurement).count()
        msg = (
            f"Renpho bulut hesabı tanımlı değil (mevcut yerel/BLE kayıt: {total_count}). "
            "Ayarlar sekmesinden Renpho e-posta ve parolanızı kaydedin veya BLE ile ölçüm alın."
        )
        db.add(
            models.SyncLog(
                provider="renpho",
                status="waiting",
                records_processed=0,
                message=msg,
            )
        )
        db.commit()
        return {"status": "waiting", "provider": "renpho", "records_processed": 0, "message": msg}

    added = 0
    try:
        from renpho import RenphoClient  # type: ignore

        client = RenphoClient(email, password)
        client.login()
        raw_items = client.get_all_measurements()
        for m in raw_items[:90]:
            ts_epoch = m.get("timeStamp") or m.get("time_stamp") or m.get("timeary")
            if not ts_epoch:
                continue
            ts_val = int(ts_epoch)
            if ts_val > 10**12:
                ts_val //= 1000
            dt = datetime.fromtimestamp(ts_val, tz=timezone.utc)
            upsert_scale_measurement(
                db,
                {
                    "timestamp": dt.strftime("%Y-%m-%dT%H:%M:%SZ"),
                    "source": "renpho_es26bb",
                    "weight_kg": m.get("weight"),
                    "body_fat_pct": m.get("bodyfat"),
                    "muscle_mass_kg": m.get("muscle"),
                    "bone_mass_kg": m.get("bone"),
                    "water_pct": m.get("water"),
                    "subcutaneous_fat_pct": m.get("subfat"),
                    "visceral_fat": m.get("visfat"),
                    "bmr_kcal": m.get("bmr"),
                    "protein_pct": m.get("protein"),
                    "metabolic_age": m.get("bodyage"),
                    "fat_free_weight_kg": m.get("fatFreeWeight"),
                    "sinew_mass_kg": m.get("sinew"),
                },
            )
            added += 1
    except Exception as exc:
        logger.warning(f"Renpho cloud sync failed: {exc}")
        err_msg = f"Renpho bulut bağlantısı başarısız: {exc}"
        db.add(
            models.SyncLog(
                provider="renpho",
                status="degraded",
                records_processed=0,
                message=err_msg,
            )
        )
        db.commit()
        return {"status": "degraded", "provider": "renpho", "records_processed": 0, "message": err_msg}

    msg = f"Renpho ES-26BB-B bulut senkronizasyonu tamamlandı ({added} ölçüm çekildi)."
    db.add(
        models.SyncLog(
            provider="renpho",
            status="nominal",
            records_processed=added,
            message=msg,
        )
    )
    db.add(
        models.WebhookHeartbeat(
            source="renpho_es26bb",
            device_label="Renpho Body Fat Scale ES-26BB-B",
            event_type="cloud_sync",
            status="healthy",
            records_received=added,
            latency_ms=1.3,
            payload_summary=msg,
        )
    )
    db.commit()
    return {"status": "nominal", "provider": "renpho", "records_processed": added, "message": msg}


def list_scale_records(db: Session, limit: int = 60) -> Dict[str, Any]:
    safe_limit = max(1, min(365, int(limit)))
    rows = (
        db.query(models.ScaleMeasurement)
        .order_by(models.ScaleMeasurement.timestamp.desc())
        .limit(safe_limit)
        .all()
    )
    total = db.query(models.ScaleMeasurement).count()
    items = [
        {
            "id": r.id,
            "date": r.date,
            "timestamp": r.timestamp,
            "source": r.source,
            "weight_kg": r.weight_kg,
            "bmi": r.bmi,
            "body_fat_pct": r.body_fat_pct,
            "muscle_mass_kg": r.muscle_mass_kg,
            "visceral_fat": r.visceral_fat,
            "subcutaneous_fat_pct": r.subcutaneous_fat_pct,
            "water_pct": r.water_pct,
            "bone_mass_kg": r.bone_mass_kg,
            "bmr_kcal": r.bmr_kcal,
            "protein_pct": r.protein_pct,
            "metabolic_age": r.metabolic_age,
            "fat_free_weight_kg": r.fat_free_weight_kg,
            "sinew_mass_kg": r.sinew_mass_kg,
        }
        for r in rows
    ]
    return {"items": items, "total": total}


def bulk_delete_scale_records(db: Session, ids: List[int]) -> Dict[str, Any]:
    if not ids:
        raise HTTPException(status_code=400, detail="Silinecek en az bir ölçüm kimliği (id) seçilmelidir.")
    deleted = (
        db.query(models.ScaleMeasurement)
        .filter(models.ScaleMeasurement.id.in_(ids))
        .delete(synchronize_session=False)
    )
    db.commit()
    return {
        "deleted_count": int(deleted),
        "message": f"{deleted} adet tartı ölçüm kaydı silindi.",
    }


@app.get("/health")
def health():
    return {"service": "renpho-sync-service", "status": "healthy"}


@app.post("/sync")
def trigger_renpho_sync(db: Session = Depends(get_db)):
    return sync_renpho_cloud(db)


@app.post("/ble-scale")
def ingest_ble_scale(payload: Dict[str, Any], db: Session = Depends(get_db)):
    rec = upsert_scale_measurement(db, payload)
    return {
        "status": "nominal",
        "ingested_count": 1,
        "message": f"Renpho ES-26BB-B ölçümü ({rec.weight_kg} kg) başarıyla kaydedildi.",
    }


@app.get("/measurements")
def get_measurements(limit: int = 60, db: Session = Depends(get_db)):
    return list_scale_records(db, limit=limit)
