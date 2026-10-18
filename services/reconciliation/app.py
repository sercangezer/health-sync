import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy.orm import Session
from services.common import models
from services.common.database import get_db
from services.common.logger import attach_standard_middleware_and_handlers
from services.common.migrate_db import ensure_default_config_and_seed

app = FastAPI(title="Multi-Device Reconciliation & Cycle Window Microservice", version="1.0.0")
logger = attach_standard_middleware_and_handlers(app, "reconciliation-service")

VALID_SOURCES = {"renpho_es26bb", "galaxy_watch6", "garmin_band"}
VALID_STRATEGIES = {"priority", "average", "max"}


def get_or_create_profile(db: Session) -> models.UserProfile:
    ensure_default_config_and_seed(db)
    prof = db.query(models.UserProfile).filter(models.UserProfile.id == 1).first()
    return prof


def get_or_create_config(db: Session) -> models.ReconciliationConfig:
    ensure_default_config_and_seed(db)
    cfg = db.query(models.ReconciliationConfig).filter(models.ReconciliationConfig.id == 1).first()
    prof = db.query(models.UserProfile).filter(models.UserProfile.id == 1).first()
    setattr(cfg, "_profile", prof)
    return cfg


def _calculate_age(birth_date_str: str) -> int:
    try:
        bd = datetime.strptime(str(birth_date_str or "1990-01-01").strip()[:10], "%Y-%m-%d").date()
        today = datetime.now(timezone.utc).date()
        return max(1, today.year - bd.year - ((today.month, today.day) < (bd.month, bd.day)))
    except Exception:
        return 35


def serialize_config(cfg: models.ReconciliationConfig) -> Dict[str, Any]:
    prof = getattr(cfg, "_profile", None)
    birth_date = getattr(prof, "birth_date", "1990-01-01") if prof else "1990-01-01"
    return {
        "weight_priority": json.loads(cfg.weight_priority_json),
        "sleep_priority": json.loads(cfg.sleep_priority_json),
        "activity_priority": json.loads(cfg.activity_priority_json),
        "heart_priority": json.loads(cfg.heart_priority_json),
        "merge_strategy": cfg.merge_strategy,
        "cycle_start_date": cfg.cycle_start_date,
        "target_weight_kg": cfg.target_weight_kg,
        "height_cm": cfg.height_cm,
        "full_name": getattr(prof, "full_name", "") if prof else "",
        "birth_date": birth_date,
        "age": _calculate_age(birth_date),
        "gender": getattr(prof, "gender", "male") if prof else "male",
        "blood_type": getattr(prof, "blood_type", "Bilinmiyor") if prof else "Bilinmiyor",
        "starting_weight_kg": getattr(prof, "starting_weight_kg", 85.0) if prof else 85.0,
        "activity_level": getattr(prof, "activity_level", "moderate") if prof else "moderate",
        "surgeries": getattr(prof, "surgeries", "") if prof else "",
        "chronic_conditions": getattr(prof, "chronic_conditions", "") if prof else "",
        "medications": getattr(prof, "medications", "") if prof else "",
        "allergies_and_notes": getattr(prof, "allergies_and_notes", "") if prof else "",
    }


def update_config(db: Session, payload: Dict[str, Any]) -> Dict[str, Any]:
    cfg = get_or_create_config(db)
    prof = get_or_create_profile(db)

    strategy = str(payload.get("merge_strategy") or cfg.merge_strategy or "priority").strip()
    if strategy not in VALID_STRATEGIES:
        raise HTTPException(
            status_code=400,
            detail=f"Geçersiz birleştirme stratejisi: '{strategy}'. Geçerli değerler: priority, average, max.",
        )

    cycle_start = str(payload["cycle_start_date"] if "cycle_start_date" in payload else cfg.cycle_start_date).strip()
    try:
        datetime.strptime(cycle_start, "%Y-%m-%d")
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail="Geçersiz döngü başlangıç tarihi (cycle_start_date). YYYY-MM-DD formatı zorunludur.",
        ) from exc

    target_weight = float(
        payload["target_weight_kg"] if "target_weight_kg" in payload and payload["target_weight_kg"] is not None else cfg.target_weight_kg
    )
    if target_weight < 35.0 or target_weight > 250.0:
        raise HTTPException(status_code=400, detail="Hedef kilo 35 kg ile 250 kg arasında olmalıdır.")

    height_cm = float(
        payload["height_cm"] if "height_cm" in payload and payload["height_cm"] is not None else cfg.height_cm
    )
    if height_cm < 120.0 or height_cm > 230.0:
        raise HTTPException(status_code=400, detail="Boy (height_cm) 120 cm ile 230 cm arasında olmalıdır.")

    for key, attr in (
        ("weight_priority", "weight_priority_json"),
        ("sleep_priority", "sleep_priority_json"),
        ("activity_priority", "activity_priority_json"),
        ("heart_priority", "heart_priority_json"),
    ):
        if key in payload:
            arr = payload.get(key)
            if not isinstance(arr, list) or not arr or any(s not in VALID_SOURCES for s in arr):
                raise HTTPException(status_code=400, detail=f"Geçersiz öncelik listesi: {key}")
            setattr(cfg, attr, json.dumps(arr))

    cfg.merge_strategy = strategy
    cfg.cycle_start_date = cycle_start
    cfg.target_weight_kg = round(target_weight, 2)
    cfg.height_cm = round(height_cm, 1)
    cfg.updated_at = datetime.now(timezone.utc)

    if "full_name" in payload and payload["full_name"] is not None:
        prof.full_name = str(payload["full_name"]).strip()[:128]
    if "birth_date" in payload and payload["birth_date"] is not None:
        bd_str = str(payload["birth_date"]).strip()
        try:
            datetime.strptime(bd_str, "%Y-%m-%d")
        except ValueError as exc:
            raise HTTPException(
                status_code=400,
                detail="Doğum tarihi YYYY-AA-GG formatında olmalıdır (Örn: 1990-05-15).",
            ) from exc
        prof.birth_date = bd_str
    if "gender" in payload and payload["gender"] is not None:
        prof.gender = str(payload["gender"]).strip()[:24]
    if "blood_type" in payload and payload["blood_type"] is not None:
        prof.blood_type = str(payload["blood_type"]).strip()[:16]
    if "starting_weight_kg" in payload and payload["starting_weight_kg"] is not None:
        sw = float(payload["starting_weight_kg"])
        if 30.0 <= sw <= 300.0:
            prof.starting_weight_kg = round(sw, 2)
    if "activity_level" in payload and payload["activity_level"] is not None:
        prof.activity_level = str(payload["activity_level"]).strip()[:32]
    if "surgeries" in payload and payload["surgeries"] is not None:
        prof.surgeries = str(payload["surgeries"]).strip()
    if "chronic_conditions" in payload and payload["chronic_conditions"] is not None:
        prof.chronic_conditions = str(payload["chronic_conditions"]).strip()
    if "medications" in payload and payload["medications"] is not None:
        prof.medications = str(payload["medications"]).strip()
    if "allergies_and_notes" in payload and payload["allergies_and_notes"] is not None:
        prof.allergies_and_notes = str(payload["allergies_and_notes"]).strip()
    prof.updated_at = datetime.now(timezone.utc)

    db.commit()
    db.refresh(cfg)
    db.refresh(prof)
    setattr(cfg, "_profile", prof)

    reconcile_all_days(db)
    return serialize_config(cfg)


def _resolve_metric(
    candidates: Dict[str, Optional[float]],
    priority_order: List[str],
    strategy: str,
) -> Tuple[Optional[float], str]:
    available = [(src, float(val)) for src, val in candidates.items() if val is not None]
    if not available:
        return None, "none"

    if strategy == "average" and len(available) > 1:
        avg_val = round(sum(v for _, v in available) / len(available), 2)
        return avg_val, "merged_average"

    if strategy == "max" and len(available) > 1:
        best_src, best_val = max(available, key=lambda x: x[1])
        return round(best_val, 2), f"max:{best_src}"

    for src in priority_order:
        if candidates.get(src) is not None:
            return round(float(candidates[src]), 2), src

    first_src, first_val = available[0]
    return round(first_val, 2), first_src


def compute_daily_recovery_score(
    sleep_hours: Optional[float],
    sleep_score: Optional[float],
    resting_hr: Optional[float],
    hrv_ms: Optional[float],
    stress_score: Optional[float],
    body_battery_max: Optional[int],
) -> float:
    sleep_component = min(100.0, max(25.0, float(sleep_score or ((sleep_hours or 7.0) / 8.0 * 100.0))))
    hrv_component = min(100.0, max(20.0, ((float(hrv_ms or 45.0) - 20.0) / 45.0) * 100.0))
    rhr_component = min(100.0, max(20.0, 100.0 - max(0.0, (float(resting_hr or 60.0) - 52.0) * 2.5)))
    stress_component = min(100.0, max(20.0, 100.0 - float(stress_score or 32.0)))
    bb_component = float(body_battery_max) if body_battery_max is not None else (sleep_component * 0.5 + stress_component * 0.5)

    score = (
        sleep_component * 0.30
        + hrv_component * 0.25
        + rhr_component * 0.20
        + stress_component * 0.15
        + bb_component * 0.10
    )
    return round(min(100.0, max(10.0, score)), 1)


def reconcile_all_days(db: Session) -> int:
    """
    Rebuilds DailyHealthSummary rows across all recorded dates using active
    ReconciliationConfig priority rules and merge strategy.
    """
    cfg = get_or_create_config(db)
    sleep_prio = json.loads(cfg.sleep_priority_json)
    act_prio = json.loads(cfg.activity_priority_json)
    heart_prio = json.loads(cfg.heart_priority_json)
    strategy = cfg.merge_strategy

    scale_rows = db.query(models.ScaleMeasurement).order_by(models.ScaleMeasurement.timestamp.asc()).all()
    height_m = max(1.2, min(2.3, float(cfg.height_cm or 178.0) / 100.0))
    scale_by_date: Dict[str, models.ScaleMeasurement] = {}
    for s in scale_rows:
        expected_bmi = round(float(s.weight_kg) / (height_m * height_m), 2)
        if abs(float(s.bmi or 0.0) - expected_bmi) >= 0.05:
            s.bmi = expected_bmi
        scale_by_date[s.date] = s

    wearable_rows = db.query(models.DeviceDailyMetric).all()
    wearables_by_date: Dict[str, Dict[str, models.DeviceDailyMetric]] = {}
    for w in wearable_rows:
        wearables_by_date.setdefault(w.date, {})[w.device_source] = w

    all_dates = sorted(set(scale_by_date.keys()) | set(wearables_by_date.keys()))
    if not all_dates:
        db.query(models.DailyHealthSummary).delete(synchronize_session=False)
        db.commit()
        return 0
    db.query(models.DailyHealthSummary).filter(~models.DailyHealthSummary.date.in_(all_dates)).delete(
        synchronize_session=False
    )
    reconciled_count = 0

    for d_str in all_dates:
        s_rec = scale_by_date.get(d_str)
        w_map = wearables_by_date.get(d_str, {})
        w6 = w_map.get("galaxy_watch6")
        gm = w_map.get("garmin_band")

        w6_steps_cand = w6.steps if (w6 and w6.steps and w6.steps > 0) else None
        gm_steps_cand = gm.steps if (gm and gm.steps and gm.steps > 0) else None
        if w6_steps_cand is None and gm_steps_cand is None:
            w6_steps_cand = w6.steps if w6 else None
            gm_steps_cand = gm.steps if gm else None

        steps_val, steps_src = _resolve_metric(
            {"galaxy_watch6": w6_steps_cand, "garmin_band": gm_steps_cand},
            act_prio,
            strategy,
        )
        active_cal_val, active_cal_src = _resolve_metric(
            {
                "galaxy_watch6": w6.active_calories_kcal if w6 else None,
                "garmin_band": gm.active_calories_kcal if gm else None,
            },
            act_prio,
            strategy,
        )
        total_cal_val, _ = _resolve_metric(
            {
                "galaxy_watch6": w6.total_calories_kcal if w6 else None,
                "garmin_band": gm.total_calories_kcal if gm else None,
            },
            act_prio,
            strategy,
        )
        sleep_val, sleep_src = _resolve_metric(
            {"galaxy_watch6": w6.sleep_hours if w6 else None, "garmin_band": gm.sleep_hours if gm else None},
            sleep_prio,
            strategy,
        )
        sleep_score_val, _ = _resolve_metric(
            {"galaxy_watch6": w6.sleep_score if w6 else None, "garmin_band": gm.sleep_score if gm else None},
            sleep_prio,
            strategy,
        )
        stress_val, stress_src = _resolve_metric(
            {"galaxy_watch6": w6.stress_score if w6 else None, "garmin_band": gm.stress_score if gm else None},
            sleep_prio,
            strategy,
        )
        rhr_val, rhr_src = _resolve_metric(
            {"galaxy_watch6": w6.resting_hr_bpm if w6 else None, "garmin_band": gm.resting_hr_bpm if gm else None},
            heart_prio,
            strategy,
        )
        hrv_val, hrv_src = _resolve_metric(
            {"galaxy_watch6": w6.hrv_ms if w6 else None, "garmin_band": gm.hrv_ms if gm else None},
            heart_prio,
            strategy,
        )
        spo2_val, spo2_src = _resolve_metric(
            {"galaxy_watch6": w6.spo2_pct if w6 else None, "garmin_band": gm.spo2_pct if gm else None},
            act_prio,
            strategy,
        )
        bb_max = gm.body_battery_max if (gm and gm.body_battery_max is not None) else None

        rec_score = compute_daily_recovery_score(
            sleep_hours=sleep_val,
            sleep_score=sleep_score_val,
            resting_hr=rhr_val,
            hrv_ms=hrv_val,
            stress_score=stress_val,
            body_battery_max=bb_max,
        )

        attribution = {
            "weight": "renpho_es26bb" if s_rec else "none",
            "steps": steps_src,
            "active_calories": active_cal_src,
            "sleep": sleep_src,
            "stress": stress_src,
            "resting_hr": rhr_src,
            "hrv": hrv_src,
            "spo2": spo2_src,
        }

        summary = (
            db.query(models.DailyHealthSummary)
            .filter(models.DailyHealthSummary.date == d_str)
            .first()
        )
        if not summary:
            summary = models.DailyHealthSummary(date=d_str)
            db.add(summary)

        summary.weight_kg = s_rec.weight_kg if s_rec else None
        summary.body_fat_pct = s_rec.body_fat_pct if s_rec else None
        summary.muscle_mass_kg = s_rec.muscle_mass_kg if s_rec else None
        summary.water_pct = s_rec.water_pct if s_rec else None
        summary.visceral_fat = s_rec.visceral_fat if s_rec else None
        summary.steps = int(steps_val or 0)
        summary.active_calories_kcal = float(active_cal_val or 0.0)
        summary.total_calories_kcal = float(total_cal_val or 0.0)
        summary.resting_hr_bpm = rhr_val
        summary.hrv_ms = hrv_val
        summary.sleep_hours = sleep_val
        summary.sleep_score = sleep_score_val
        summary.stress_score = stress_val
        summary.body_battery_max = bb_max
        summary.spo2_pct = spo2_val
        summary.recovery_score = rec_score
        summary.source_attribution_json = json.dumps(attribution)
        summary.updated_at = datetime.now(timezone.utc)
        reconciled_count += 1

    db.commit()
    return reconciled_count


def build_wearables_comparison(db: Session, days: int = 30) -> Dict[str, Any]:
    reconcile_all_days(db)
    safe_days = max(1, min(180, int(days)))
    wearable_rows = (
        db.query(models.DeviceDailyMetric)
        .order_by(models.DeviceDailyMetric.date.desc())
        .all()
    )
    by_date: Dict[str, Dict[str, models.DeviceDailyMetric]] = {}
    for w in wearable_rows:
        by_date.setdefault(w.date, {})[w.device_source] = w

    sorted_dates = sorted(by_date.keys(), reverse=True)[:safe_days]
    comparison_rows: List[Dict[str, Any]] = []
    agreement_scores: List[float] = []

    for d_str in sorted_dates:
        w6 = by_date[d_str].get("galaxy_watch6")
        gm = by_date[d_str].get("garmin_band")

        w6_steps = w6.steps if w6 else 0
        gm_steps = gm.steps if gm else 0
        max_steps = max(w6_steps, gm_steps, 1)
        steps_diff_pct = round(abs(w6_steps - gm_steps) / max_steps * 100.0, 1)

        w6_sleep = w6.sleep_hours if (w6 and w6.sleep_hours is not None) else 0.0
        gm_sleep = gm.sleep_hours if (gm and gm.sleep_hours is not None) else 0.0
        sleep_diff_h = round(abs(w6_sleep - gm_sleep), 2)

        w6_rhr = w6.resting_hr_bpm if (w6 and w6.resting_hr_bpm is not None) else 0.0
        gm_rhr = gm.resting_hr_bpm if (gm and gm.resting_hr_bpm is not None) else 0.0
        rhr_diff_bpm = round(abs(w6_rhr - gm_rhr), 1)

        w6_hrv = w6.hrv_ms if (w6 and w6.hrv_ms is not None) else 0.0
        gm_hrv = gm.hrv_ms if (gm and gm.hrv_ms is not None) else 0.0
        hrv_diff_ms = round(abs(w6_hrv - gm_hrv), 1)

        row_agreement = round(
            max(0.0, 100.0 - (steps_diff_pct * 0.45 + sleep_diff_h * 6.0 + rhr_diff_bpm * 2.0 + hrv_diff_ms * 0.8)),
            1,
        )
        agreement_scores.append(row_agreement)

        comparison_rows.append(
            {
                "date": d_str,
                "watch6_steps": w6_steps,
                "garmin_steps": gm_steps,
                "steps_diff_pct": steps_diff_pct,
                "watch6_sleep_hours": round(w6_sleep, 2),
                "garmin_sleep_hours": round(gm_sleep, 2),
                "sleep_diff_hours": sleep_diff_h,
                "watch6_rhr_bpm": round(w6_rhr, 1),
                "garmin_rhr_bpm": round(gm_rhr, 1),
                "rhr_diff_bpm": rhr_diff_bpm,
                "watch6_hrv_ms": round(w6_hrv, 1),
                "garmin_hrv_ms": round(gm_hrv, 1),
                "garmin_body_battery": gm.body_battery_max if gm else None,
                "garmin_stress": gm.stress_score if gm else None,
                "watch6_spo2_pct": w6.spo2_pct if w6 else None,
                "garmin_spo2_pct": gm.spo2_pct if gm else None,
                "agreement_pct": row_agreement,
            }
        )

    overall_agreement = round(sum(agreement_scores) / len(agreement_scores), 1) if agreement_scores else 0.0
    avg_step_delta = (
        round(sum(r["steps_diff_pct"] for r in comparison_rows) / len(comparison_rows), 1)
        if comparison_rows
        else 0.0
    )
    avg_sleep_delta = (
        round(sum(r["sleep_diff_hours"] for r in comparison_rows) / len(comparison_rows), 2)
        if comparison_rows
        else 0.0
    )
    avg_rhr_delta = (
        round(sum(r["rhr_diff_bpm"] for r in comparison_rows) / len(comparison_rows), 1)
        if comparison_rows
        else 0.0
    )

    return {
        "agreement_score": overall_agreement,
        "summary": {
            "compared_days": len(comparison_rows),
            "avg_steps_diff_pct": avg_step_delta,
            "avg_sleep_diff_hours": avg_sleep_delta,
            "avg_rhr_diff_bpm": avg_rhr_delta,
        },
        "rows": comparison_rows,
    }


@app.get("/health")
def health():
    return {"service": "reconciliation-service", "status": "healthy"}


@app.get("/rules")
def get_rules(db: Session = Depends(get_db)):
    cfg = get_or_create_config(db)
    return serialize_config(cfg)


@app.put("/rules")
def put_rules(payload: Dict[str, Any], db: Session = Depends(get_db)):
    return update_config(db, payload)


@app.get("/comparison")
def get_comparison(days: int = 30, db: Session = Depends(get_db)):
    return build_wearables_comparison(db, days=days)
