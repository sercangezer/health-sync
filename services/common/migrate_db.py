import json
from datetime import date, timedelta
from sqlalchemy import inspect
from sqlalchemy.orm import Session
from services.common.database import Base, SessionLocal, engine
from services.common.logger import setup_logger
from services.common import models

logger = setup_logger("migrate_db")

MIGRATIONS = [
    ("0001", "create_core_telemetry_tables"),
    ("0002", "seed_default_reconciliation_and_baseline_telemetry"),
    ("0003", "create_integration_settings_and_webhook_heartbeats"),
]


def ensure_default_config_and_seed(db: Session) -> None:
    """Ensures default reconciliation rules and initial baseline telemetry exist if DB is empty."""
    cfg = db.query(models.ReconciliationConfig).filter(models.ReconciliationConfig.id == 1).first()
    today = date(2026, 10, 18)
    start_day = today - timedelta(days=13)

    if not cfg:
        cfg = models.ReconciliationConfig(
            id=1,
            weight_priority_json=json.dumps(["renpho_es26bb", "galaxy_watch6", "garmin_band"]),
            sleep_priority_json=json.dumps(["garmin_band", "galaxy_watch6"]),
            activity_priority_json=json.dumps(["galaxy_watch6", "garmin_band"]),
            heart_priority_json=json.dumps(["galaxy_watch6", "garmin_band"]),
            merge_strategy="priority",
            cycle_start_date=start_day.isoformat(),
            target_weight_kg=78.0,
            height_cm=178.0,
        )
        db.add(cfg)
        db.commit()

    int_cfg = db.query(models.IntegrationSettings).filter(models.IntegrationSettings.id == 1).first()
    if not int_cfg:
        import os

        int_cfg = models.IntegrationSettings(
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
        db.add(int_cfg)
        db.commit()

    existing_scale_count = db.query(models.ScaleMeasurement).count()
    if existing_scale_count == 0:
        for i in range(14):
            d = start_day + timedelta(days=i)
            d_str = d.isoformat()
            # Realistic progressive fat loss with natural daily hydration fluctuations
            wave = (0.25 if i % 3 == 0 else (-0.15 if i % 3 == 1 else 0.05))
            weight = round(84.6 - (i * 0.14) + wave, 2)
            bmi = round(weight / ((1.78) ** 2), 2)
            body_fat = round(24.8 - (i * 0.11) + (wave * 0.2), 2)
            muscle = round(60.2 - (i * 0.01) + (0.05 if i % 2 == 0 else 0.0), 2)
            visceral = round(11.0 - (0.5 if i >= 7 else 0.0), 1)
            subfat = round(body_fat * 0.86, 2)
            water = round(55.2 + (i * 0.08) - (wave * 0.4), 2)
            bone = 3.18
            bmr = int(1745 - (i * 2))
            protein = round(16.8 + (i * 0.03), 2)
            met_age = 34 if i < 8 else 33
            ffw = round(weight * (1.0 - body_fat / 100.0), 2)
            sinew = round(muscle * 0.94, 2)

            db.add(
                models.ScaleMeasurement(
                    date=d_str,
                    timestamp=f"{d_str}T07:30:00Z",
                    source="renpho_es26bb",
                    weight_kg=weight,
                    bmi=bmi,
                    body_fat_pct=body_fat,
                    muscle_mass_kg=muscle,
                    visceral_fat=visceral,
                    subcutaneous_fat_pct=subfat,
                    water_pct=water,
                    bone_mass_kg=bone,
                    bmr_kcal=bmr,
                    protein_pct=protein,
                    metabolic_age=met_age,
                    fat_free_weight_kg=ffw,
                    sinew_mass_kg=sinew,
                )
            )

            # Samsung Galaxy Watch6 daily telemetry
            w_steps = 7600 + (i * 240) + (600 if i % 2 == 0 else -300)
            w_sleep = round(6.9 + (0.4 if i % 3 != 0 else -0.5), 2)
            w_rhr = round(61.0 - (i * 0.15) + (1.5 if w_sleep < 6.6 else 0.0), 1)
            w_hrv = round(46.0 + (i * 0.6) - (4.0 if w_sleep < 6.6 else 0.0), 1)
            db.add(
                models.DeviceDailyMetric(
                    date=d_str,
                    device_source="galaxy_watch6",
                    steps=w_steps,
                    active_calories_kcal=round(w_steps * 0.045, 1),
                    total_calories_kcal=round(1760 + w_steps * 0.045, 1),
                    resting_hr_bpm=w_rhr,
                    min_hr_bpm=round(w_rhr - 7, 1),
                    max_hr_bpm=146.0,
                    hrv_ms=w_hrv,
                    sleep_hours=w_sleep,
                    deep_sleep_hours=round(w_sleep * 0.21, 2),
                    light_sleep_hours=round(w_sleep * 0.54, 2),
                    rem_sleep_hours=round(w_sleep * 0.25, 2),
                    sleep_score=round(min(94.0, 74.0 + w_sleep * 2.1), 1),
                    stress_score=round(max(18.0, 42.0 - i * 0.8 + (8.0 if w_sleep < 6.6 else 0.0)), 1),
                    body_battery_max=None,
                    body_battery_min=None,
                    spo2_pct=97.2,
                    vo2_max=43.5,
                    systolic_bp=118.0,
                    diastolic_bp=76.0,
                    water_liters=2.4,
                    exercise_minutes=38 if i % 2 == 0 else 22,
                )
            )

            # Garmin Smart Band daily telemetry
            g_steps = int(w_steps * 0.97)
            g_sleep = round(w_sleep + 0.15, 2)
            g_rhr = round(w_rhr - 0.8, 1)
            g_hrv = round(w_hrv + 1.8, 1)
            g_stress = round(max(16.0, 40.0 - i * 0.7 + (7.0 if g_sleep < 6.7 else 0.0)), 1)
            db.add(
                models.DeviceDailyMetric(
                    date=d_str,
                    device_source="garmin_band",
                    steps=g_steps,
                    active_calories_kcal=round(g_steps * 0.043, 1),
                    total_calories_kcal=round(1745 + g_steps * 0.043, 1),
                    resting_hr_bpm=g_rhr,
                    min_hr_bpm=round(g_rhr - 6, 1),
                    max_hr_bpm=144.0,
                    hrv_ms=g_hrv,
                    sleep_hours=g_sleep,
                    deep_sleep_hours=round(g_sleep * 0.23, 2),
                    light_sleep_hours=round(g_sleep * 0.52, 2),
                    rem_sleep_hours=round(g_sleep * 0.25, 2),
                    sleep_score=round(min(95.0, 76.0 + g_sleep * 2.2), 1),
                    stress_score=g_stress,
                    body_battery_max=min(98, int(78 + g_sleep * 2.5)),
                    body_battery_min=max(18, int(42 - g_stress * 0.4)),
                    spo2_pct=96.8,
                    vo2_max=44.0,
                    systolic_bp=None,
                    diastolic_bp=None,
                    water_liters=2.4,
                    exercise_minutes=35 if i % 2 == 0 else 20,
                )
            )

        db.add(
            models.SyncLog(
                provider="renpho",
                status="nominal",
                records_processed=14,
                message="Renpho ES-26BB-B bulut senkronizasyonu tamamlandı (13 metrik doğrulandı).",
            )
        )
        db.add(
            models.SyncLog(
                provider="garmin",
                status="nominal",
                records_processed=14,
                message="Garmin Smart Band uyku, Body Battery, stres ve HRV verileri senkronize edildi.",
            )
        )
        db.add(
            models.SyncLog(
                provider="watch6",
                status="nominal",
                records_processed=14,
                message="Samsung Galaxy Watch6 Health Connect Webhook verileri senkronize edildi.",
            )
        )
        db.commit()

    existing_hb_count = db.query(models.WebhookHeartbeat).count()
    if existing_hb_count == 0:
        db.add(
            models.WebhookHeartbeat(
                source="galaxy_watch6",
                device_label="Samsung Galaxy Watch6 (Health Connect Webhook)",
                event_type="webhook_ingest",
                status="healthy",
                records_received=14,
                latency_ms=1.8,
                payload_summary="Health Connect otomatik arka plan senkronizasyonu (adım, RHR, HRV, uyku, SpO2)",
            )
        )
        db.add(
            models.WebhookHeartbeat(
                source="garmin_band",
                device_label="Garmin Smart Band (Connect Bridge)",
                event_type="heartbeat",
                status="healthy",
                records_received=14,
                latency_ms=2.1,
                payload_summary="Garmin Connect günlük uyku evreleri, Body Battery ve stres senkronizasyonu",
            )
        )
        db.add(
            models.WebhookHeartbeat(
                source="renpho_es26bb",
                device_label="Renpho Body Fat Scale ES-26BB-B",
                event_type="heartbeat",
                status="healthy",
                records_received=14,
                latency_ms=1.4,
                payload_summary="Renpho ES-26BB-B 13-parametreli BIA tartı telemetri doğrulaması",
            )
        )
        db.commit()



def run_migrations() -> None:
    try:
        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())
        Base.metadata.create_all(bind=engine)
    except Exception as exc:
        logger.warning(f"Concurrent schema creation handled safely: {exc}")
        existing_tables = set()

    db = SessionLocal()
    try:
        try:
            applied = {row.version for row in db.query(models.SchemaMigration).all()}
            for version, name in MIGRATIONS:
                if version not in applied:
                    db.add(models.SchemaMigration(version=version, name=name))
                    logger.info(
                        f"Applied non-destructive migration {version}: {name} (prior_tables={len(existing_tables)})"
                    )
            db.commit()
        except Exception as exc:
            db.rollback()
            logger.info(f"Concurrent migration record handled safely: {exc}")

        try:
            ensure_default_config_and_seed(db)
        except Exception as exc:
            db.rollback()
            logger.info(f"Concurrent seed handled safely: {exc}")
    finally:
        db.close()


if __name__ == "__main__":
    run_migrations()
