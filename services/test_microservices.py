import base64
import os
import sqlite3
import tempfile
import time

os.environ["DATABASE_URL"] = "sqlite:///:memory:"

from fastapi.testclient import TestClient
import pytest
from services.api_gateway.app import app
from services.common.database import Base, SessionLocal, engine
from services.common.migrate_db import ensure_default_config_and_seed
from services.common.resilience import CircuitBreaker, registry


@pytest.fixture(autouse=True)
def reset_db_and_breakers():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        ensure_default_config_and_seed(db)
    finally:
        db.close()
    for b in registry.breakers.values():
        b.state = "CLOSED"
        b.failure_count = 0
    yield


client = TestClient(app)


def test_health_and_changelog_endpoints():
    res = client.get("/api/health")
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "healthy"
    assert body["version"] == "1.0.0"
    assert len(body["services"]) == 7
    assert "X-Correlation-ID" in res.headers

    cl = client.get("/api/changelog")
    assert cl.status_code == 200
    cl_body = cl.json()
    assert cl_body["version"] == "1.0.0"
    assert "v1.0.0" in cl_body["changelog"]


def test_renpho_ble_scale_ingest_and_13_metrics():
    ble_payload = {
        "timestamp": "2026-10-18T08:15:00Z",
        "weight_kg": 81.45,
        "impedance_ohm": 472.0,
    }
    res = client.post("/api/ingest/ble-scale", json=ble_payload)
    assert res.status_code == 200
    assert res.json()["ingested_count"] == 1

    list_res = client.get("/api/measurements/scale?limit=5")
    assert list_res.status_code == 200
    items = list_res.json()["items"]
    assert len(items) >= 1
    latest = items[0]
    assert latest["weight_kg"] == 81.45
    for field in (
        "bmi",
        "body_fat_pct",
        "muscle_mass_kg",
        "visceral_fat",
        "subcutaneous_fat_pct",
        "water_pct",
        "bone_mass_kg",
        "bmr_kcal",
        "protein_pct",
        "metabolic_age",
        "fat_free_weight_kg",
        "sinew_mass_kg",
    ):
        assert latest[field] is not None

    # Test invalid BLE weight boundary (< 20 kg)
    bad = client.post("/api/ingest/ble-scale", json={"weight_kg": 8.5})
    assert bad.status_code == 400
    err = bad.json()
    assert err["error_code"] == "HTTP_400"
    assert "message" in err and "details" in err


def test_scale_bulk_delete_and_validation():
    # Database starts clean with zero dummy measurements
    initial_res = client.get("/api/measurements/scale?limit=5").json()
    assert initial_res["items"] == []

    # Ingest a real BLE measurement and then delete it
    client.post(
        "/api/ingest/ble-scale",
        json={"timestamp": "2026-10-18T08:30:00Z", "weight_kg": 81.2, "impedance_ohm": 470.0},
    )
    list_res = client.get("/api/measurements/scale?limit=5").json()
    first_id = list_res["items"][0]["id"]

    del_res = client.post("/api/measurements/scale/bulk-delete", json={"ids": [first_id]})
    assert del_res.status_code == 200
    assert del_res.json()["deleted_count"] == 1

    empty_del = client.post("/api/measurements/scale/bulk-delete", json={"ids": []})
    assert empty_del.status_code == 400
    assert empty_del.json()["error_code"] == "HTTP_400"


def test_watch6_and_garmin_webhook_and_comparison():
    webhook_w6 = {
        "device_source": "galaxy_watch6",
        "records": [
            {
                "date": "2026-10-18",
                "steps": 11420,
                "active_calories_kcal": 520.0,
                "resting_hr_bpm": 56.5,
                "hrv_ms": 58.0,
                "sleep_hours": 7.6,
                "sleep_score": 88.0,
                "spo2_pct": 97.8,
            }
        ],
    }
    r1 = client.post("/api/ingest/webhook", json=webhook_w6)
    assert r1.status_code == 200
    assert r1.json()["ingested_count"] == 1

    webhook_gm = {
        "device_source": "garmin_band",
        "records": [
            {
                "date": "2026-10-18",
                "steps": 11180,
                "active_calories_kcal": 498.0,
                "resting_hr_bpm": 56.0,
                "hrv_ms": 59.5,
                "sleep_hours": 7.75,
                "sleep_score": 90.0,
                "stress_score": 24.0,
                "body_battery_max": 94,
                "spo2_pct": 97.1,
            }
        ],
    }
    r2 = client.post("/api/ingest/webhook", json=webhook_gm)
    assert r2.status_code == 200

    comp = client.get("/api/wearables/comparison?days=14")
    assert comp.status_code == 200
    comp_data = comp.json()
    assert comp_data["agreement_score"] > 70.0
    latest_row = comp_data["rows"][0]
    assert latest_row["date"] == "2026-10-18"
    assert latest_row["watch6_steps"] == 11420
    assert latest_row["garmin_steps"] == 11180

    # Invalid webhook device_source
    bad_src = client.post(
        "/api/ingest/webhook",
        json={"device_source": "unknown_watch", "records": [{"date": "2026-10-18", "steps": 1000}]},
    )
    assert bad_src.status_code == 400


def test_health_connect_sqlite_db_and_csv_import():
    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as tmp:
        tmp_path = tmp.name

    try:
        conn = sqlite3.connect(tmp_path)
        cur = conn.cursor()
        cur.execute("CREATE TABLE steps_record_table (local_date INTEGER, count INTEGER)")
        cur.execute("CREATE TABLE resting_heart_rate_record_table (local_date INTEGER, beats_per_minute REAL)")
        # 20744 days since 1970-01-01 -> 2026-10-18
        cur.execute("INSERT INTO steps_record_table VALUES (20744, 12345)")
        cur.execute("INSERT INTO resting_heart_rate_record_table VALUES (20744, 57.2)")
        conn.commit()
        conn.close()

        with open(tmp_path, "rb") as f:
            raw_db_bytes = f.read()
        b64_db = base64.b64encode(raw_db_bytes).decode("ascii")

        res = client.post(
            "/api/ingest/import-file",
            json={
                "file_name": "health_connect_export.db",
                "format": "db",
                "device_source": "galaxy_watch6",
                "content_base64": b64_db,
            },
        )
        assert res.status_code == 200
        assert res.json()["ingested_count"] == 1

        # Also test Google Drive Health Connect .zip export archive containing health_connect_export.db
        import io
        import zipfile

        zip_buf = io.BytesIO()
        with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.writestr("health_connect_export.db", raw_db_bytes)
        b64_zip = base64.b64encode(zip_buf.getvalue()).decode("ascii")

        res_zip = client.post(
            "/api/ingest/import-file",
            json={
                "file_name": "Health Connect.zip",
                "format": "zip",
                "device_source": "galaxy_watch6",
                "content_base64": b64_zip,
            },
        )
        assert res_zip.status_code == 200
        assert res_zip.json()["ingested_count"] == 1
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

    # Reject non-SQLite bytes claiming format='db'
    bad_db = client.post(
        "/api/ingest/import-file",
        json={
            "file_name": "fake.db",
            "format": "db",
            "device_source": "galaxy_watch6",
            "content_base64": base64.b64encode(b"NOT A SQLITE DB").decode("ascii"),
        },
    )
    assert bad_db.status_code == 400

    # Valid CSV import
    csv_text = "date,steps,sleep_hours,resting_hr_bpm,hrv_ms\n2026-10-18,10800,7.5,58.0,52.0\n"
    res_csv = client.post(
        "/api/ingest/import-file",
        json={
            "file_name": "watch6.csv",
            "format": "csv",
            "device_source": "galaxy_watch6",
            "content_base64": base64.b64encode(csv_text.encode("utf-8")).decode("ascii"),
        },
    )
    assert res_csv.status_code == 200
    assert res_csv.json()["ingested_count"] == 1

    from services.watch6_ingest.app import _extract_gdrive_file_id, _extract_gdrive_folder_id

    folder_url = "https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrStUvWxYz?usp=sharing"
    file_url = "https://drive.google.com/file/d/1XyZ987654321AbCdEfGh/view?usp=sharing"
    assert _extract_gdrive_folder_id(folder_url) == "1AbCdEfGhIjKlMnOpQrStUvWxYz"
    assert _extract_gdrive_file_id(folder_url) is None
    assert _extract_gdrive_file_id(file_url) == "1XyZ987654321AbCdEfGh"


def test_reconciliation_rules_and_section6_temporal_window_guard():
    rules_res = client.get("/api/reconciliation/rules")
    assert rules_res.status_code == 200
    rules = rules_res.json()
    assert rules["merge_strategy"] == "priority"
    assert "birth_date" in rules
    assert "gender" in rules
    assert "surgeries" in rules

    # Switch merge strategy to 'average' and update personal medical profile
    rules["merge_strategy"] = "average"
    rules["full_name"] = "Sercan Gezer"
    rules["birth_date"] = "1991-06-15"
    rules["gender"] = "male"
    rules["blood_type"] = "A Rh+"
    rules["starting_weight_kg"] = 86.5
    rules["surgeries"] = "Safra kesesi ameliyatı (2022)"
    rules["chronic_conditions"] = "İnsülin direnci"
    rules["medications"] = "D3K2, Magnezyum"
    rules["allergies_and_notes"] = "Yüksek protein, şekersiz beslenme"
    upd = client.put("/api/reconciliation/rules", json=rules)
    assert upd.status_code == 200
    upd_body = upd.json()
    assert upd_body["merge_strategy"] == "average"
    assert upd_body["full_name"] == "Sercan Gezer"
    assert upd_body["birth_date"] == "1991-06-15"
    assert upd_body["surgeries"] == "Safra kesesi ameliyatı (2022)"
    assert upd_body["chronic_conditions"] == "İnsülin direnci"

    # Section 6 Temporal Baseline & Window Fallback Guard:
    # Setting cycle_start_date in the future must NOT bleed old measurements into the new cycle!
    future_rules = dict(rules)
    future_rules["cycle_start_date"] = "2027-01-01"
    upd_future = client.put("/api/reconciliation/rules", json=future_rules)
    assert upd_future.status_code == 200

    dash = client.get("/api/dashboard/overview?range=cycle&scope=all")
    assert dash.status_code == 200
    dash_body = dash.json()
    assert dash_body["window_status"] == "pending"
    assert dash_body["daily_rows"] == []

    insights = client.get("/api/analytics/insights?range=cycle")
    assert insights.status_code == 200
    assert insights.json()["window_status"] == "pending"
    assert insights.json()["composition_quality"]["status"] == "pending"


def test_analytics_insights_and_ai_advisor_endpoints():
    from datetime import date, timedelta

    # Initially pending when no device telemetry exists yet
    pending_res = client.get("/api/analytics/insights?range=30d")
    assert pending_res.status_code == 200
    assert pending_res.json()["window_status"] == "pending"

    # Ingest 3 days of multi-device telemetry within the active cycle
    today = date.today()
    for offset, (w, steps, slp, rhr, hrv) in enumerate(
        [
            (82.4, 9200, 7.1, 59.0, 49.0),
            (82.1, 10400, 7.5, 58.0, 52.0),
            (81.8, 11100, 7.8, 57.0, 55.0),
        ]
    ):
        d_str = (today - timedelta(days=2 - offset)).isoformat()
        client.post(
            "/api/ingest/ble-scale",
            json={"timestamp": f"{d_str}T07:30:00Z", "weight_kg": w, "impedance_ohm": 475.0},
        )
        client.post(
            "/api/ingest/webhook",
            json={
                "device_source": "galaxy_watch6",
                "records": [
                    {
                        "date": d_str,
                        "steps": steps,
                        "sleep_hours": slp,
                        "resting_hr_bpm": rhr,
                        "hrv_ms": hrv,
                    }
                ],
            },
        )
        client.post(
            "/api/ingest/webhook",
            json={
                "device_source": "garmin_band",
                "records": [
                    {
                        "date": d_str,
                        "steps": steps - 150,
                        "sleep_hours": slp + 0.1,
                        "resting_hr_bpm": rhr - 0.5,
                        "hrv_ms": hrv + 1.0,
                        "stress_score": 28.0 - offset,
                        "body_battery_max": 90 + offset,
                    }
                ],
            },
        )

    insights_res = client.get("/api/analytics/insights?range=30d")
    assert insights_res.status_code == 200
    ins = insights_res.json()
    assert ins["window_status"] == "active"
    assert ins["recovery_score"] > 0
    assert len(ins["correlations"]) == 4
    assert len(ins["anomalies"]) >= 1
    assert "clinical_evaluation" in ins
    assert len(ins["clinical_evaluation"]["pillars"]) == 5

    prompts_res = client.get("/api/ai/prompts")
    assert prompts_res.status_code == 200
    assert "Renpho ES-26BB-B" in prompts_res.json()["prompt_text"]

    # Initially empty before generating an AI report
    empty_reports = client.get("/api/ai/reports")
    assert empty_reports.status_code == 200
    assert empty_reports.json()["items"] == []

    ai_res = client.post("/api/ai/analyze", json={"focus_area": "holistic"})
    assert ai_res.status_code == 200
    assert "Vücut Kompozisyonu" in ai_res.json()["summary_markdown"]

    reports_res = client.get("/api/ai/reports")
    assert reports_res.status_code == 200
    assert len(reports_res.json()["items"]) == 1

    bad_ai = client.post("/api/ai/analyze", json={"focus_area": "invalid_topic"})
    assert bad_ai.status_code == 400


def test_circuit_breaker_isolation_and_recovery():
    cb = CircuitBreaker("test-service", "Test Role", failure_threshold=2, recovery_seconds=0.05)
    assert cb.state == "CLOSED"

    cb.record_failure(12.0)
    assert cb.state == "CLOSED"
    cb.record_failure(15.0)
    assert cb.state == "OPEN"
    assert not cb.allow_request()

    # Wait for recovery window -> transitions to HALF_OPEN
    time.sleep(0.06)
    assert cb.allow_request()
    assert cb.state == "HALF_OPEN"

    # Successful call closes the circuit
    cb.record_success(2.5)
    assert cb.state == "CLOSED"

    # Force garmin-sync-service circuit breaker OPEN and verify sync trigger degrades gracefully without 500
    garmin_cb = registry.get_breaker("garmin-sync-service")
    garmin_cb.state = "OPEN"
    garmin_cb.last_failure_epoch = time.monotonic() + 3600

    sync_res = client.post("/api/sync/trigger", json={"provider": "all"})
    assert sync_res.status_code == 200
    assert "Circuit Breaker" in sync_res.json()["message"]

    health_res = client.get("/api/health")
    assert health_res.status_code == 200
    assert health_res.json()["status"] == "degraded"


def test_integration_settings_and_webhook_heartbeat_monitor():
    cfg_res = client.get("/api/settings")
    assert cfg_res.status_code == 200
    cfg = cfg_res.json()
    assert cfg["auto_sync_interval_minutes"] == 60
    assert cfg["webhook_expected_interval_minutes"] == 60
    assert cfg["has_renpho_password"] is False

    upd_res = client.put(
        "/api/settings",
        json={
            "renpho_email": "sercan@ornek.com",
            "renpho_password": "secret-renpho-pass",
            "garmin_email": "garmin@ornek.com",
            "garmin_password": "secret-garmin-pass",
            "gemini_api_key": "AIza-test-key",
            "webhook_secret": "wh-secret-123",
            "watch_export_dir": "/data/watch_exports",
            "auto_sync_interval_minutes": 30,
            "webhook_expected_interval_minutes": 45,
        },
    )
    assert upd_res.status_code == 200
    upd = upd_res.json()
    assert upd["renpho_email"] == "sercan@ornek.com"
    assert upd["has_renpho_password"] is True
    assert upd["renpho_password_masked"] == "••••••••"
    assert upd["has_garmin_password"] is True
    assert upd["has_gemini_api_key"] is True
    assert upd["has_webhook_secret"] is True
    assert upd["auto_sync_interval_minutes"] == 30
    assert upd["webhook_expected_interval_minutes"] == 45

    # Invalid interval boundary (< 5 minutes) must return 400
    bad_cfg = client.put(
        "/api/settings",
        json={
            "renpho_email": "sercan@ornek.com",
            "garmin_email": "garmin@ornek.com",
            "watch_export_dir": "/data/watch_exports",
            "auto_sync_interval_minutes": 1,
            "webhook_expected_interval_minutes": 45,
        },
    )
    assert bad_cfg.status_code == 400

    # Check webhook heartbeat monitor (starts in 'waiting' state before any signal arrives)
    hb_res = client.get("/api/webhook/heartbeat")
    assert hb_res.status_code == 200
    hb = hb_res.json()
    assert hb["overall_status"] == "waiting"
    assert hb["expected_interval_minutes"] == 45
    assert len(hb["sources"]) == 3
    assert hb["total_heartbeats_24h"] == 0

    # Send a live webhook heartbeat probe -> transitions to 'healthy'
    ping_res = client.post(
        "/api/webhook/heartbeat",
        json={
            "source": "galaxy_watch6",
            "device_label": "Samsung Galaxy Watch6 (Tasker Bridge)",
            "event_type": "heartbeat",
            "records_received": 3,
            "latency_ms": 1.1,
            "payload_summary": "Canlı Tasker heartbeat yoklaması",
        },
    )
    assert ping_res.status_code == 200
    ping_body = ping_res.json()
    assert ping_body["overall_status"] == "healthy"
    assert ping_body["total_heartbeats_24h"] == 1
    assert ping_body["recent_heartbeats"][0]["payload_summary"] == "Canlı Tasker heartbeat yoklaması"

    # Reject unknown heartbeat source
    bad_hb = client.post("/api/webhook/heartbeat", json={"source": "unknown_device"})
    assert bad_hb.status_code == 400

    # Enforce X-Webhook-Secret when webhook_secret is configured
    unauth_wh = client.post(
        "/api/ingest/webhook",
        json={"device_source": "galaxy_watch6", "records": [{"date": "2026-10-18", "steps": 9200}]},
    )
    assert unauth_wh.status_code == 401

    auth_wh = client.post(
        "/api/ingest/webhook",
        headers={"X-Webhook-Secret": "wh-secret-123"},
        json={"device_source": "galaxy_watch6", "records": [{"date": "2026-10-18", "steps": 9200}]},
    )
    assert auth_wh.status_code == 200
    assert auth_wh.json()["ingested_count"] == 1


def test_renpho_rate_limit_cooldown_and_watch6_single_log(monkeypatch):
    import sys
    import types
    from services.renpho_sync import app as renpho_app

    # Seed one BLE scale record so existing_total > 0
    client.post(
        "/api/ingest/ble-scale",
        json={"timestamp": "2026-10-18T08:00:00Z", "weight_kg": 81.5, "impedance_ohm": 470.0},
    )
    client.put(
        "/api/settings",
        json={
            "renpho_email": "sercan@ornek.com",
            "renpho_password": "secret-renpho-pass",
            "garmin_email": "",
            "watch_export_dir": "/data/watch_exports",
            "auto_sync_interval_minutes": 60,
            "webhook_expected_interval_minutes": 60,
        },
    )

    class FakeRateLimitedRenphoClient:
        def __init__(self, email, password):
            self.email = email
            self.password = password
            self.token = None
            self.user_id = None

        def login(self):
            raise RuntimeError("Login failed: code=-114, msg=")

    fake_mod = types.ModuleType("renpho")
    fake_mod.RenphoClient = FakeRateLimitedRenphoClient  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "renpho", fake_mod)
    renpho_app._clear_renpho_session("sercan@ornek.com")

    res = client.post("/api/sync/trigger", json={"provider": "renpho"})
    assert res.status_code == 200
    body = res.json()
    assert body["status"] == "nominal"
    assert "geçici hız sınırında" in body["message"]


