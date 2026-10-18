from datetime import datetime, timezone
from sqlalchemy import Column, DateTime, Float, Integer, String, Text, UniqueConstraint
from services.common.database import Base


def utc_now():
    return datetime.now(timezone.utc)


class SchemaMigration(Base):
    __tablename__ = "schema_migrations"

    version = Column(String(32), primary_key=True)
    name = Column(String(128), nullable=False)
    applied_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)


class ScaleMeasurement(Base):
    """Renpho Body Fat Scale ES-26BB-B 13-parameter measurement record."""

    __tablename__ = "scale_measurements"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(String(10), index=True, nullable=False)
    timestamp = Column(String(32), unique=True, index=True, nullable=False)
    source = Column(String(32), default="renpho_es26bb", nullable=False)
    weight_kg = Column(Float, nullable=False)
    bmi = Column(Float, nullable=False)
    body_fat_pct = Column(Float, nullable=False)
    muscle_mass_kg = Column(Float, nullable=False)
    visceral_fat = Column(Float, nullable=False)
    subcutaneous_fat_pct = Column(Float, nullable=False)
    water_pct = Column(Float, nullable=False)
    bone_mass_kg = Column(Float, nullable=False)
    bmr_kcal = Column(Integer, nullable=False)
    protein_pct = Column(Float, nullable=False)
    metabolic_age = Column(Integer, nullable=False)
    fat_free_weight_kg = Column(Float, nullable=False)
    sinew_mass_kg = Column(Float, nullable=False)


class DeviceDailyMetric(Base):
    """Per-wearable daily telemetry record (galaxy_watch6 or garmin_band)."""

    __tablename__ = "device_daily_metrics"
    __table_args__ = (UniqueConstraint("date", "device_source", name="uq_device_daily_date_source"),)

    id = Column(Integer, primary_key=True, index=True)
    date = Column(String(10), index=True, nullable=False)
    device_source = Column(String(32), index=True, nullable=False)
    steps = Column(Integer, default=0, nullable=False)
    active_calories_kcal = Column(Float, default=0.0, nullable=False)
    total_calories_kcal = Column(Float, default=0.0, nullable=False)
    resting_hr_bpm = Column(Float, nullable=True)
    min_hr_bpm = Column(Float, nullable=True)
    max_hr_bpm = Column(Float, nullable=True)
    hrv_ms = Column(Float, nullable=True)
    sleep_hours = Column(Float, nullable=True)
    deep_sleep_hours = Column(Float, nullable=True)
    light_sleep_hours = Column(Float, nullable=True)
    rem_sleep_hours = Column(Float, nullable=True)
    sleep_score = Column(Float, nullable=True)
    stress_score = Column(Float, nullable=True)
    body_battery_max = Column(Integer, nullable=True)
    body_battery_min = Column(Integer, nullable=True)
    spo2_pct = Column(Float, nullable=True)
    vo2_max = Column(Float, nullable=True)
    systolic_bp = Column(Float, nullable=True)
    diastolic_bp = Column(Float, nullable=True)
    water_liters = Column(Float, nullable=True)
    exercise_minutes = Column(Integer, default=0, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)


class DailyHealthSummary(Base):
    """Unified daily summary reconciled across Renpho ES-26BB-B, Galaxy Watch6, and Garmin Smart Band."""

    __tablename__ = "daily_health_summaries"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(String(10), unique=True, index=True, nullable=False)
    weight_kg = Column(Float, nullable=True)
    body_fat_pct = Column(Float, nullable=True)
    muscle_mass_kg = Column(Float, nullable=True)
    water_pct = Column(Float, nullable=True)
    visceral_fat = Column(Float, nullable=True)
    steps = Column(Integer, default=0, nullable=False)
    active_calories_kcal = Column(Float, default=0.0, nullable=False)
    total_calories_kcal = Column(Float, default=0.0, nullable=False)
    resting_hr_bpm = Column(Float, nullable=True)
    hrv_ms = Column(Float, nullable=True)
    sleep_hours = Column(Float, nullable=True)
    sleep_score = Column(Float, nullable=True)
    stress_score = Column(Float, nullable=True)
    body_battery_max = Column(Integer, nullable=True)
    spo2_pct = Column(Float, nullable=True)
    recovery_score = Column(Float, default=0.0, nullable=False)
    source_attribution_json = Column(Text, default="{}", nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)


class ReconciliationConfig(Base):
    """Stores per-metric device priority rules and active tracking cycle window (Section 6)."""

    __tablename__ = "reconciliation_configs"

    id = Column(Integer, primary_key=True, index=True)
    weight_priority_json = Column(Text, nullable=False)
    sleep_priority_json = Column(Text, nullable=False)
    activity_priority_json = Column(Text, nullable=False)
    heart_priority_json = Column(Text, nullable=False)
    merge_strategy = Column(String(24), default="priority", nullable=False)
    cycle_start_date = Column(String(10), nullable=False)
    target_weight_kg = Column(Float, default=78.0, nullable=False)
    height_cm = Column(Float, default=178.0, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)


class SyncLog(Base):
    """Execution history of automated and manual device synchronization jobs."""

    __tablename__ = "sync_logs"

    id = Column(Integer, primary_key=True, index=True)
    provider = Column(String(32), index=True, nullable=False)
    status = Column(String(24), nullable=False)
    records_processed = Column(Integer, default=0, nullable=False)
    message = Column(String(512), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)


class AIInsightReport(Base):
    """Generated multi-device AI health interpretation reports."""

    __tablename__ = "ai_insight_reports"

    id = Column(Integer, primary_key=True, index=True)
    focus_area = Column(String(64), nullable=False)
    source_mode = Column(String(32), nullable=False)
    summary_markdown = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)


class IntegrationSettings(Base):
    """Stores UI-managed cloud credentials, webhook tokens, and heartbeat thresholds."""

    __tablename__ = "integration_settings"

    id = Column(Integer, primary_key=True, index=True)
    renpho_email = Column(String(256), default="", nullable=False)
    renpho_password = Column(String(256), default="", nullable=False)
    garmin_email = Column(String(256), default="", nullable=False)
    garmin_password = Column(String(256), default="", nullable=False)
    gemini_api_key = Column(String(256), default="", nullable=False)
    webhook_secret = Column(String(256), default="", nullable=False)
    watch_export_dir = Column(String(256), default="/data/watch_exports", nullable=False)
    auto_sync_interval_minutes = Column(Integer, default=60, nullable=False)
    webhook_expected_interval_minutes = Column(Integer, default=60, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)


class WebhookHeartbeat(Base):
    """Records live webhook ingest and heartbeat pings from Galaxy Watch6 / Health Connect / bridges."""

    __tablename__ = "webhook_heartbeats"

    id = Column(Integer, primary_key=True, index=True)
    source = Column(String(64), index=True, nullable=False)
    device_label = Column(String(128), nullable=False)
    event_type = Column(String(32), default="heartbeat", nullable=False)
    status = Column(String(24), default="healthy", nullable=False)
    records_received = Column(Integer, default=0, nullable=False)
    latency_ms = Column(Float, default=1.2, nullable=False)
    payload_summary = Column(String(512), default="", nullable=False)
    created_at = Column(DateTime(timezone=True), default=utc_now, nullable=False)

