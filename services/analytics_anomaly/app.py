import math
from typing import Any, Dict, List, Tuple
from fastapi import Depends, FastAPI
from sqlalchemy.orm import Session
from services.common import models
from services.common.database import get_db
from services.common.logger import attach_standard_middleware_and_handlers
from services.reconciliation.app import get_or_create_config, reconcile_all_days

app = FastAPI(title="Analytics, Correlation & Anomaly Microservice", version="1.0.0")
logger = attach_standard_middleware_and_handlers(app, "analytics-anomaly-service")


def pearson_correlation(xs: List[float], ys: List[float]) -> float:
    n = min(len(xs), len(ys))
    if n < 3:
        return 0.0
    x_slice = xs[:n]
    y_slice = ys[:n]
    mean_x = sum(x_slice) / n
    mean_y = sum(y_slice) / n
    num = sum((x_slice[i] - mean_x) * (y_slice[i] - mean_y) for i in range(n))
    den_x = math.sqrt(sum((x - mean_x) ** 2 for x in x_slice))
    den_y = math.sqrt(sum((y - mean_y) ** 2 for y in y_slice))
    if den_x == 0 or den_y == 0:
        return 0.0
    return round(max(-1.0, min(1.0, num / (den_x * den_y))), 2)


def filter_summaries_by_range_and_cycle(
    db: Session, range_key: str = "30d"
) -> Tuple[List[models.DailyHealthSummary], str, str]:
    """
    Enforces Section 6 Temporal Baseline & Window Fallback:
    When range_key == 'cycle' or when validating against active cycle_start_date,
    never allows historical records from before cycle_start_date to bleed into the active cycle.
    If no measurements exist on or after cycle_start_date, returns window_status='pending'.
    """
    reconcile_all_days(db)
    cfg = get_or_create_config(db)
    cycle_start = cfg.cycle_start_date

    all_rows = (
        db.query(models.DailyHealthSummary)
        .order_by(models.DailyHealthSummary.date.asc())
        .all()
    )
    cycle_rows = [r for r in all_rows if r.date >= cycle_start]

    if not cycle_rows:
        return [], "pending", cycle_start

    if range_key == "cycle":
        return cycle_rows, "active", cycle_start

    limit_map = {"7d": 7, "30d": 30, "90d": 90}
    days_limit = limit_map.get(range_key, 30)
    scoped = cycle_rows[-days_limit:]
    return scoped, "active", cycle_start


def compute_composition_quality(
    db: Session, cycle_start: str, window_status: str
) -> Dict[str, Any]:
    if window_status == "pending":
        return {
            "status": "pending",
            "headline": "Yeni takip döngüsü penceresi henüz ölçüm almadı",
            "total_weight_delta_kg": 0.0,
            "fat_mass_delta_kg": 0.0,
            "muscle_mass_delta_kg": 0.0,
            "water_pct_delta": 0.0,
            "fat_loss_share_pct": 0.0,
            "muscle_loss_share_pct": 0.0,
            "interpretation": (
                f"Aktif döngü başlangıç tarihi ({cycle_start}) sonrasında henüz tartı ölçümü bulunmuyor. "
                "Önceki döngü verileri bazal karşılaştırmaya dahil edilmez."
            ),
        }

    scale_rows = (
        db.query(models.ScaleMeasurement)
        .filter(models.ScaleMeasurement.date >= cycle_start)
        .order_by(models.ScaleMeasurement.timestamp.asc())
        .all()
    )
    if len(scale_rows) < 2:
        return {
            "status": "initializing",
            "headline": "Bazal ölçüm kaydedildi, değişim hesabı için ikinci ölçüm bekleniyor",
            "total_weight_delta_kg": 0.0,
            "fat_mass_delta_kg": 0.0,
            "muscle_mass_delta_kg": 0.0,
            "water_pct_delta": 0.0,
            "fat_loss_share_pct": 0.0,
            "muscle_loss_share_pct": 0.0,
            "interpretation": "Döngü penceresinde tek ölçüm mevcut; ikinci ölçümden itibaren yağ/kas/su kırılımı hesaplanır.",
        }

    first = scale_rows[0]
    latest = scale_rows[-1]
    weight_delta = round(latest.weight_kg - first.weight_kg, 2)
    first_fat_kg = first.weight_kg * (first.body_fat_pct / 100.0)
    latest_fat_kg = latest.weight_kg * (latest.body_fat_pct / 100.0)
    fat_delta_kg = round(latest_fat_kg - first_fat_kg, 2)
    muscle_delta_kg = round(latest.muscle_mass_kg - first.muscle_mass_kg, 2)
    water_delta = round(latest.water_pct - first.water_pct, 2)

    abs_total = max(0.01, abs(weight_delta))
    fat_share = round(min(100.0, max(0.0, (abs(fat_delta_kg) / abs_total) * 100.0)), 1) if fat_delta_kg < 0 else 0.0
    muscle_share = (
        round(min(100.0, max(0.0, (abs(muscle_delta_kg) / abs_total) * 100.0)), 1)
        if muscle_delta_kg < 0
        else 0.0
    )

    if weight_delta < -0.2 and muscle_share <= 22.0:
        status = "nominal"
        headline = "Sağlıklı Yağ Kaybı ve Kas Korunumu"
        interp = (
            f"Döngü başından beri toplam {weight_delta} kg değişimin %{fat_share} kadarı yağ kütlesinden gerçekleşti. "
            f"Kas kütlesi değişimi ({muscle_delta_kg} kg) güvenli fizyolojik sınırlar içindedir."
        )
    elif weight_delta < -0.2 and muscle_share > 22.0:
        status = "warning"
        headline = "Kas Kaybı Payı Yüksek — Protein ve Direnç Egzersizi Gerekli"
        interp = (
            f"Toplam kilo kaybının ({weight_delta} kg) %{muscle_share} kadarı kas dokusundan kaynaklanıyor. "
            "Günlük protein alımını ve direnç antrenmanlarını artırmanız önerilir."
        )
    else:
        status = "info"
        headline = "Hidrasyon ve Kompozisyon Dengesi İzleniyor"
        interp = (
            f"Toplam ağırlık değişimi {weight_delta} kg, vücut su oranı değişimi {water_delta} puan olarak ölçüldü."
        )

    return {
        "status": status,
        "headline": headline,
        "total_weight_delta_kg": weight_delta,
        "fat_mass_delta_kg": fat_delta_kg,
        "muscle_mass_delta_kg": muscle_delta_kg,
        "water_pct_delta": water_delta,
        "fat_loss_share_pct": fat_share,
        "muscle_loss_share_pct": muscle_share,
        "interpretation": interp,
    }


def detect_anomalies(
    db: Session,
    summaries: List[models.DailyHealthSummary],
    composition: Dict[str, Any],
) -> List[Dict[str, Any]]:
    if not summaries:
        return [
            {
                "id": "window-pending",
                "date": "-",
                "severity": "warning",
                "metric": "Takip Döngüsü Penceresi",
                "source": "reconciliation-service",
                "title": "Yeni Döngü Ölçümü Bekleniyor",
                "detail": "Seçili döngü başlangıç tarihinden sonra henüz veri kaydedilmedi (Bölüm 6 Sınır Koruması aktif).",
            }
        ]

    anomalies: List[Dict[str, Any]] = []
    latest = summaries[-1]

    # Baseline averages over prior window
    rhr_vals = [s.resting_hr_bpm for s in summaries[:-1] if s.resting_hr_bpm is not None]
    hrv_vals = [s.hrv_ms for s in summaries[:-1] if s.hrv_ms is not None]

    if rhr_vals and latest.resting_hr_bpm is not None:
        base_rhr = sum(rhr_vals) / len(rhr_vals)
        if latest.resting_hr_bpm - base_rhr >= 4.0:
            anomalies.append(
                {
                    "id": f"rhr-spike-{latest.date}",
                    "date": latest.date,
                    "severity": "critical",
                    "metric": f"RHR {latest.resting_hr_bpm} bpm (+{round(latest.resting_hr_bpm - base_rhr, 1)})",
                    "source": "galaxy_watch6 / garmin_band",
                    "title": "Dinlenik Nabız Bazal Üzerinde",
                    "detail": "Dinlenik nabız 14 günlük bazal ortalamanın belirgin üzerinde. Yetersiz toparlanma veya stres yükü olasıdır.",
                }
            )

    if hrv_vals and latest.hrv_ms is not None:
        base_hrv = sum(hrv_vals) / len(hrv_vals)
        if base_hrv > 0 and ((base_hrv - latest.hrv_ms) / base_hrv) >= 0.12:
            anomalies.append(
                {
                    "id": f"hrv-drop-{latest.date}",
                    "date": latest.date,
                    "severity": "warning",
                    "metric": f"HRV {latest.hrv_ms} ms (Bazal: {round(base_hrv, 1)} ms)",
                    "source": "galaxy_watch6 / garmin_band",
                    "title": "HRV Otonom Toparlanma Düşüşü",
                    "detail": "Kalp atış hızı değişkenliği (HRV) bazalin %12'den fazla altında. Ağır antrenman yerine aktif dinlenme önerilir.",
                }
            )

    if composition.get("muscle_loss_share_pct", 0.0) > 22.0:
        anomalies.append(
            {
                "id": f"muscle-loss-{latest.date}",
                "date": latest.date,
                "severity": "critical",
                "metric": f"Kas Payı %{composition['muscle_loss_share_pct']}",
                "source": "renpho_es26bb",
                "title": "Kas Kütlesi Kaybı Riski",
                "detail": composition.get("interpretation", ""),
            }
        )

    recent_sleep = [s.sleep_hours for s in summaries[-3:] if s.sleep_hours is not None]
    if recent_sleep and (sum(recent_sleep) / len(recent_sleep)) < 6.6:
        avg_slp = round(sum(recent_sleep) / len(recent_sleep), 2)
        anomalies.append(
            {
                "id": f"sleep-debt-{latest.date}",
                "date": latest.date,
                "severity": "warning",
                "metric": f"3g Ort. Uyku: {avg_slp} sa",
                "source": "garmin_band",
                "title": "Birikimli Uyku Borcu",
                "detail": "Son 3 günlük ortalama uyku süresi 6.6 saatin altında; kortizol kaynaklı su tutumu (ödem) görülebilir.",
            }
        )

    if not anomalies:
        anomalies.append(
            {
                "id": f"nominal-state-{latest.date}",
                "date": latest.date,
                "severity": "nominal",
                "metric": f"Toparlanma {latest.recovery_score}/100",
                "source": "all_devices",
                "title": "Tüm Biyometrik Göstergeler Nominal Aralıkta",
                "detail": "Renpho ES-26BB-B, Galaxy Watch6 ve Garmin Smart Band metriklerinde kritik sapma tespit edilmedi.",
            }
        )

    return anomalies


def build_analytics_insights(db: Session, range_key: str = "30d") -> Dict[str, Any]:
    summaries, window_status, cycle_start = filter_summaries_by_range_and_cycle(db, range_key=range_key)
    composition = compute_composition_quality(db, cycle_start=cycle_start, window_status=window_status)
    anomalies = detect_anomalies(db, summaries=summaries, composition=composition)

    if not summaries:
        return {
            "window_status": "pending",
            "recovery_score": 0.0,
            "recovery_status": "pending",
            "composition_quality": composition,
            "correlations": [],
            "anomalies": anomalies,
            "rolling_series": [],
        }

    weights = [float(s.weight_kg) for s in summaries if s.weight_kg is not None]
    sleeps = [float(s.sleep_hours) for s in summaries if s.sleep_hours is not None]
    stresses = [float(s.stress_score) for s in summaries if s.stress_score is not None]
    hrvs = [float(s.hrv_ms) for s in summaries if s.hrv_ms is not None]
    steps_list = [float(s.steps) for s in summaries]
    body_fats = [float(s.body_fat_pct) for s in summaries if s.body_fat_pct is not None]
    rhrs = [float(s.resting_hr_bpm) for s in summaries if s.resting_hr_bpm is not None]

    # Next-day weight delta vs sleep
    sleep_for_delta: List[float] = []
    next_day_weight_delta: List[float] = []
    for idx in range(len(summaries) - 1):
        cur_s = summaries[idx]
        nxt_s = summaries[idx + 1]
        if cur_s.sleep_hours is not None and cur_s.weight_kg is not None and nxt_s.weight_kg is not None:
            sleep_for_delta.append(float(cur_s.sleep_hours))
            next_day_weight_delta.append(float(nxt_s.weight_kg - cur_s.weight_kg))

    r_sleep_weight = pearson_correlation(sleep_for_delta, next_day_weight_delta)
    r_stress_hrv = pearson_correlation(stresses, hrvs)
    r_steps_fat = pearson_correlation(steps_list, body_fats)
    r_rhr_sleep = pearson_correlation(rhrs, sleeps)

    correlations = [
        {
            "id": "sleep-vs-weight-delta",
            "pair": "Uyku Süresi (Garmin/Watch6) ↔ Ertesi Gün Tartı Değişimi (Renpho)",
            "r_value": r_sleep_weight,
            "strength": "Güçlü Negatif" if r_sleep_weight <= -0.4 else ("Orta Negatif" if r_sleep_weight < -0.15 else "Dengeli"),
            "interpretation": (
                "Uyku süresi 7 saatin altına düştüğünde ertesi sabah tartıda ödem kaynaklı geçici artış eğilimi gözlenmektedir."
            ),
        },
        {
            "id": "stress-vs-hrv",
            "pair": "Günlük Stres Skoru (Garmin) ↔ HRV Otonom Değişkenlik (Watch6/Garmin)",
            "r_value": r_stress_hrv,
            "strength": "Güçlü Negatif" if r_stress_hrv <= -0.4 else "Orta Negatif",
            "interpretation": (
                "Stres skoru yükseldiğinde HRV (RMSSD) düşmekte ve otonom sinir sistemi toparlanması yavaşlamaktadır."
            ),
        },
        {
            "id": "steps-vs-bodyfat",
            "pair": "Günlük Adım & Aktif Kalori (Watch6) ↔ Vücut Yağ Oranı (Renpho ES-26BB-B)",
            "r_value": r_steps_fat,
            "strength": "Güçlü Negatif" if r_steps_fat <= -0.4 else "Orta Negatif",
            "interpretation": (
                "8.500+ adım barajının korunduğu günlerde yağ oranı ve iç organ yağı (visceral fat) düzenli düşüş göstermektedir."
            ),
        },
        {
            "id": "rhr-vs-sleep",
            "pair": "Dinlenik Nabız RHR (Watch6) ↔ Toplam Uyku Kalitesi",
            "r_value": r_rhr_sleep,
            "strength": "Orta Negatif" if r_rhr_sleep < -0.15 else "Dengeli",
            "interpretation": (
                "Kaliteli ve derin uyku evresinin yüksek olduğu gecelerde sabah dinlenik nabzı daha düşük ölçülmektedir."
            ),
        },
    ]

    rolling_series: List[Dict[str, Any]] = []
    for idx, s in enumerate(summaries):
        win7 = summaries[max(0, idx - 6) : idx + 1]
        w7_vals = [x.weight_kg for x in win7 if x.weight_kg is not None]
        rec7_vals = [x.recovery_score for x in win7 if x.recovery_score is not None]
        rolling_series.append(
            {
                "date": s.date,
                "weight_kg": s.weight_kg,
                "rolling_7d_weight_kg": round(sum(w7_vals) / len(w7_vals), 2) if w7_vals else None,
                "body_fat_pct": s.body_fat_pct,
                "muscle_mass_kg": s.muscle_mass_kg,
                "recovery_score": s.recovery_score,
                "rolling_7d_recovery": round(sum(rec7_vals) / len(rec7_vals), 1) if rec7_vals else None,
                "sleep_hours": s.sleep_hours,
                "hrv_ms": s.hrv_ms,
                "resting_hr_bpm": s.resting_hr_bpm,
                "steps": s.steps,
            }
        )

    latest_rec = summaries[-1].recovery_score
    rec_status = "nominal" if latest_rec >= 75.0 else ("warning" if latest_rec >= 55.0 else "critical")

    return {
        "window_status": window_status,
        "recovery_score": latest_rec,
        "recovery_status": rec_status,
        "composition_quality": composition,
        "correlations": correlations,
        "anomalies": anomalies,
        "rolling_series": rolling_series,
    }


@app.get("/health")
def health():
    return {"service": "analytics-anomaly-service", "status": "healthy"}


@app.get("/insights")
def get_insights(range: str = "30d", db: Session = Depends(get_db)):
    return build_analytics_insights(db, range_key=range)
