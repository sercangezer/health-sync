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
    ("0004", "purge_initial_dummy_seed_telemetry"),
]


def ensure_default_config_and_seed(db: Session) -> None:
    """Ensures default reconciliation rules and integration settings exist without inserting dummy telemetry."""
    cfg = db.query(models.ReconciliationConfig).filter(models.ReconciliationConfig.id == 1).first()
    start_day = date.today() - timedelta(days=30)

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
                    if version == "0004":
                        db.query(models.ScaleMeasurement).delete(synchronize_session=False)
                        db.query(models.DeviceDailyMetric).delete(synchronize_session=False)
                        db.query(models.DailyHealthSummary).delete(synchronize_session=False)
                        db.query(models.SyncLog).delete(synchronize_session=False)
                        db.query(models.WebhookHeartbeat).delete(synchronize_session=False)
                        db.query(models.AIInsightReport).delete(synchronize_session=False)
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
            logger.info(f"Concurrent config init handled safely: {exc}")
    finally:
        db.close()


if __name__ == "__main__":
    run_migrations()
