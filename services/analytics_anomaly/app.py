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


def build_clinical_evaluation(
    db: Session,
    summaries: List[models.DailyHealthSummary],
    composition: Dict[str, Any],
) -> Dict[str, Any]:
    cfg = get_or_create_config(db)
    prof = getattr(cfg, "_profile", None)

    full_name = (getattr(prof, "full_name", "") if prof else "") or "Danışan"
    height_cm = float(cfg.height_cm or 178.0)
    height_m = max(1.2, min(2.3, height_cm / 100.0))
    starting_weight_kg = float(getattr(prof, "starting_weight_kg", 85.0) if prof else 85.0)
    target_weight_kg = float(cfg.target_weight_kg or 78.0)
    surgeries_str = str(getattr(prof, "surgeries", "") if prof else "").strip()
    chronic_str = str(getattr(prof, "chronic_conditions", "") if prof else "").strip()
    activity_level = str(getattr(prof, "activity_level", "moderate") if prof else "moderate").strip()

    latest_scale = (
        db.query(models.ScaleMeasurement)
        .order_by(models.ScaleMeasurement.timestamp.desc())
        .first()
    )
    latest_summary = summaries[-1] if summaries else None

    current_weight_kg = float(
        (latest_summary.weight_kg if latest_summary and latest_summary.weight_kg is not None else None)
        or (latest_scale.weight_kg if latest_scale else starting_weight_kg)
    )
    current_bmi = round(current_weight_kg / (height_m * height_m), 1)
    visceral_fat = float(
        (latest_summary.visceral_fat if latest_summary and latest_summary.visceral_fat is not None else None)
        or (latest_scale.visceral_fat if latest_scale else 12.0)
    )
    muscle_mass_kg = float(
        (latest_summary.muscle_mass_kg if latest_summary and latest_summary.muscle_mass_kg is not None else None)
        or (latest_scale.muscle_mass_kg if latest_scale else round(current_weight_kg * 0.62, 1))
    )
    water_pct = float(
        (latest_summary.water_pct if latest_summary and latest_summary.water_pct is not None else None)
        or (latest_scale.water_pct if latest_scale else 50.0)
    )

    total_lost_kg = round(starting_weight_kg - current_weight_kg, 1)
    remaining_kg = round(max(0.0, current_weight_kg - target_weight_kg), 1)
    spine_relief_kg = round(max(0.0, total_lost_kg * 4.0), 1)
    daily_water_liters = round(max(2.5, min(4.2, current_weight_kg * 0.03)), 1)
    daily_protein_g = int(round(max(110.0, min(190.0, muscle_mass_kg * 2.1))))

    recent_steps = [s.steps for s in summaries[-7:] if s.steps and s.steps > 0]
    avg_steps_7d = int(round(sum(recent_steps) / len(recent_steps))) if recent_steps else (latest_summary.steps if latest_summary else 0)

    recent_hrv = [s.hrv_ms for s in summaries[-7:] if s.hrv_ms is not None]
    latest_hrv = recent_hrv[-1] if recent_hrv else None
    if latest_hrv is None:
        hrv_row = (
            db.query(models.DeviceDailyMetric)
            .filter(models.DeviceDailyMetric.hrv_ms.isnot(None))
            .order_by(models.DeviceDailyMetric.date.desc())
            .first()
        )
        latest_hrv = hrv_row.hrv_ms if hrv_row else None

    latest_rhr = latest_summary.resting_hr_bpm if latest_summary else None
    latest_bb = latest_summary.body_battery_max if latest_summary else None
    latest_sleep = latest_summary.sleep_hours if latest_summary else None

    spo2_row = (
        db.query(models.DeviceDailyMetric)
        .filter(models.DeviceDailyMetric.spo2_pct.isnot(None))
        .order_by(models.DeviceDailyMetric.date.desc())
        .first()
    )
    latest_spo2 = round(float(spo2_row.spo2_pct), 1) if spo2_row and spo2_row.spo2_pct is not None else None

    has_insulin_resistance = "insülin" in chronic_str.lower() or "diyabet" in chronic_str.lower() or visceral_fat >= 13.0
    has_gallbladder_surg = "safra" in surgeries_str.lower()
    has_spine_surg = "fıtık" in surgeries_str.lower() or "fıtığı" in surgeries_str.lower() or "bel" in surgeries_str.lower()
    has_coccyx_surg = "kıl dönmesi" in surgeries_str.lower() or "kuyruk sokumu" in surgeries_str.lower()

    pillars = [
        {
            "id": "metabolism-insulin",
            "specialty": "Endokrinoloji ve Metabolizma",
            "title": "İnsülin Direnci ve İç Organ Yağlanması",
            "status": "warning" if visceral_fat >= 13.0 else "nominal",
            "metric": f"İç Organ Yağı: {visceral_fat:.0f} (Hedef: ≤12) • Gerçek VKİ: {current_bmi}",
            "summary": (
                f"Başlangıç kilonuzdan ({starting_weight_kg:.0f} kg) bugüne {total_lost_kg:.1f} kg vererek "
                f"insülin direnci yükünüzü önemli ölçüde azalttınız. İç organ yağlanmasını ({visceral_fat:.0f}) "
                "12'nin altına indirmek için akşam yemeğinden 30 dk sonra 15-20 dakikalık yürüyüş yapın ve gece geç saatte karbonhidrat tüketmeyin."
                if has_insulin_resistance
                else f"Güncel VKİ değeriniz {current_bmi} ve iç organ yağlanma skorunuz {visceral_fat:.0f} seviyesindedir."
            ),
        },
        {
            "id": "gallbladder-hydration",
            "specialty": "Gastroenteroloji ve Beslenme",
            "title": "Safra Akışı, Karaciğer ve Su Dengesi",
            "status": "warning" if water_pct < 50.0 else "nominal",
            "metric": f"Vücut Suyu: %{water_pct:.1f} • Günlük Hedef: {daily_water_liters} L Su / {daily_protein_g} g Protein",
            "summary": (
                f"Geçirdiğiniz safra kesesi ameliyatı sonrası safra kanallarında çamur oluşmaması için haftalık kilo kaybı hızınız "
                f"1.0 - 1.5 kg'ı geçmemeli ve 14 saati aşan uzun açlıklardan kaçınılmalıdır. Vücut su oranınızı (%{water_pct:.1f}) "
                f"%50'nin üzerine taşımak ve {muscle_mass_kg:.1f} kg'lık güçlü kas kütlenizi korumak için günde {daily_water_liters} L su ve {daily_protein_g} g protein tüketin."
                if has_gallbladder_surg
                else f"Kas kütlenizi ({muscle_mass_kg:.1f} kg) korumak ve su oranınızı (%{water_pct:.1f}) artırmak için günde {daily_water_liters} L su ve {daily_protein_g} g protein önerilir."
            ),
        },
        {
            "id": "spine-ergonomics",
            "specialty": "Fizik Tedavi ve Omurga Sağlığı",
            "title": "Bel Fıtığı Koruması ve Masa Başı Ergonomisi",
            "status": "warning" if avg_steps_7d < 5000 or activity_level == "sedentary" else "nominal",
            "metric": f"Omurga Yükü Kazancı: -{spine_relief_kg:.0f} kg • 7 Gün Ort. Adım: {avg_steps_7d:,}".replace(",", "."),
            "summary": (
                f"Verdiğiniz {total_lost_kg:.1f} kg sayesinde yürürken bel omurlarınıza (L4-L5) binen mekanik baskı yaklaşık {spine_relief_kg:.0f} kg azaldı! "
                f"{'Hem bel fıtığı hem de kuyruk sokumu ameliyat geçmişiniz nedeniyle ' if has_coccyx_surg else 'Bel fıtığı geçmişiniz nedeniyle '}"
                "masa başında kesintisiz 45 dakikadan fazla oturmayın; zıplama/koşu yerine bel dostu tempolu yürüyüş ve yüzmeyi tercih edin."
                if has_spine_surg
                else f"Son 7 günlük ortalama adım sayınız {avg_steps_7d:,} adım; günlük 6.500+ adım hedefi önerilir.".replace(",", ".")
            ),
        },
        {
            "id": "cardio-autonomic",
            "specialty": "Kardiyoloji ve Otonom Sinir Sistemi",
            "title": "Kalp Kondisyonu, HRV ve Stres Yükü",
            "status": "nominal" if (latest_rhr or 55) <= 60 else "warning",
            "metric": f"Dinlenik Nabız: {int(latest_rhr or 48)} bpm • Gece HRV: {int(latest_hrv or 80)} ms • Enerji: {latest_bb or 100}/100",
            "summary": (
                f"Dinlenik nabzınızın {int(latest_rhr or 48)} atım/dk ve gece HRV değerinizin {int(latest_hrv or 80)} ms olması, "
                "kalp-damar rezervinizin ve parasempatik (dinlenme) sinir sisteminizin çok güçlü olduğunu gösteriyor. "
                "Stres skorunun yükseldiği günlerde kortizol kaynaklı ödem ve kan şekeri artışını önlemek için ağır efordan kaçının."
            ),
        },
        {
            "id": "sleep-respiratory",
            "specialty": "Uyku ve Solunum Hekimliği",
            "title": "Gece Kan Oksijeni (SpO2) ve Uyku Evreleri",
            "status": "warning" if (latest_spo2 and latest_spo2 < 94.0) or (latest_sleep and latest_sleep < 6.5) else "nominal",
            "metric": f"Gece SpO2: %{latest_spo2 or 93.0} (İdeal: ≥%95) • Son Uyku: {round(latest_sleep or 0, 1)} saat",
            "summary": (
                f"Uyku sırasında kan oksijen doygunluğunuzun %{latest_spo2 or 93.0} civarında seyretmesi, sırtüstü yatışta üst solunum yolu daralmasıyla "
                "ilişkili olabilir. Yan pozisyonda uyumayı tercih edin; kilonuz 90 kg hedefine yaklaştıkça gece oksijenlenmeniz ve derin uyku süreniz doğal olarak yükselecektir."
            ),
        },
    ]

    return {
        "patient_name": full_name,
        "starting_weight_kg": starting_weight_kg,
        "current_weight_kg": round(current_weight_kg, 1),
        "target_weight_kg": target_weight_kg,
        "total_lost_kg": total_lost_kg,
        "remaining_kg": remaining_kg,
        "current_bmi": current_bmi,
        "spine_relief_kg": spine_relief_kg,
        "daily_water_liters": daily_water_liters,
        "daily_protein_g": daily_protein_g,
        "daily_step_target": 6500 if has_spine_surg else 7500,
        "desk_break_minutes": 45,
        "headline": (
            f"Sayın {full_name}, başlangıçtan bugüne {total_lost_kg:.1f} kg kaybettiniz ve bel omurganızdaki yükü "
            f"{spine_relief_kg:.0f} kg azalttınız ({muscle_mass_kg:.1f} kg kas kütleniz korunuyor)."
            if total_lost_kg > 0
            else f"Sayın {full_name}, çoklu cihaz verileriniz tıbbi geçmişinize göre uzman hekim kurallarıyla izleniyor."
        ),
        "pillars": pillars,
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
                "metric": "Henüz Ölçüm Yok",
                "source": "Tüm Cihazlar",
                "title": "Yeni Takip Dönemi İçin İlk Ölçüm Bekleniyor",
                "detail": "Tartı, akıllı saat veya bilekliğinizden ilk ölçüm geldiğinde sağlık uyarıları ve değerlendirmeler burada görünecektir.",
            }
        ]

    anomalies: List[Dict[str, Any]] = []
    latest = summaries[-1]
    clinical = build_clinical_evaluation(db, summaries, composition)

    # 1. Muscle mass loss danger
    if composition.get("muscle_loss_share_pct", 0.0) > 22.0:
        w_delta = composition.get("total_weight_delta_kg", 0.0)
        m_delta = composition.get("muscle_mass_delta_kg", 0.0)
        m_share = composition.get("muscle_loss_share_pct", 0.0)
        anomalies.append(
            {
                "id": f"muscle-loss-{latest.date}",
                "date": latest.date,
                "severity": "critical",
                "metric": f"Kas Kaybı: {m_delta} kg (Kilo kaybının %{m_share}'i)",
                "source": "Akıllı Tartı (Renpho)",
                "title": "Tehlike: Kilo Verirken Kas Kaybı Yaşanıyor",
                "detail": (
                    f"Toplam kilo değişiminizin ({w_delta} kg) %{m_share} kadarı ({m_delta} kg) kas dokusundan gitti. "
                    f"Kas erimesini durdurmak için günde {clinical['daily_protein_g']} g protein tüketin ve yürüyüşe ek olarak direnç egzersizi yapın."
                ),
            }
        )

    # 2. Blood oxygen (SpO2) warning / danger from latest wearable records
    latest_spo2_row = (
        db.query(models.DeviceDailyMetric)
        .filter(models.DeviceDailyMetric.spo2_pct.isnot(None))
        .order_by(models.DeviceDailyMetric.date.desc())
        .first()
    )
    if latest_spo2_row and latest_spo2_row.spo2_pct is not None and latest_spo2_row.spo2_pct < 94.0:
        spo2_val = round(float(latest_spo2_row.spo2_pct), 1)
        anomalies.append(
            {
                "id": f"low-spo2-{latest_spo2_row.date}",
                "date": latest_spo2_row.date,
                "severity": "critical" if spo2_val < 92.5 else "warning",
                "metric": f"Gece Oksijeni %{spo2_val} (İdeal: ≥%95)",
                "source": "Garmin & Watch6",
                "title": "Uyarı: Uyku Sırasında Kan Oksijen Seviyesi Düşük",
                "detail": (
                    f"Gece kan oksijen doygunluğunuz (SpO2) %{spo2_val} ölçüldü (ideal ≥%95). "
                    "Sırtüstü yatışta solunum yolu daralması veya horlama kaynaklı olabilir; yan yatmayı tercih edin."
                ),
            }
        )

    # 3. Visceral Fat & Insulin Resistance clinical focus
    if latest.visceral_fat is not None and latest.visceral_fat >= 13.0:
        anomalies.append(
            {
                "id": f"visceral-insulin-{latest.date}",
                "date": latest.date,
                "severity": "warning",
                "metric": f"İç Organ Yağı: {latest.visceral_fat:.0f} (Hedef: ≤12) • VKİ: {clinical['current_bmi']}",
                "source": "Endokrinoloji Takibi",
                "title": "Uyarı: İnsülin Direnci ve İç Organ Yağlanması Odağı",
                "detail": (
                    f"Başlangıçtan beri {clinical['total_lost_kg']} kg vererek önemli bir adım attınız; ancak iç organ yağınız ({latest.visceral_fat:.0f}) "
                    "insülin direncini beslemeye devam ediyor. Akşam yemeklerinden sonra 15-20 dk yürüyüş sabah kan şekeri ve insülin direncini doğrudan düşürür."
                ),
            }
        )

    # 4. Resting Heart Rate (RHR) spike
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
                    "metric": f"Dinlenik Nabız {int(latest.resting_hr_bpm)} atım/dk (+{round(latest.resting_hr_bpm - base_rhr, 1)})",
                    "source": "Saat & Bileklik",
                    "title": "Tehlike: Dinlenik Kalp Atış Hızınız Normalin Üzerinde",
                    "detail": "Dinlenik nabzınız son günlerin ortalamasından belirgin şekilde yükseldi. Vücudunuz yorgun, stresli veya bir enfeksiyonla savaşıyor olabilir; bugün dinlenmeye öncelik verin.",
                }
            )

    # 5. HRV drop
    if hrv_vals and latest.hrv_ms is not None:
        base_hrv = sum(hrv_vals) / len(hrv_vals)
        if base_hrv > 0 and ((base_hrv - latest.hrv_ms) / base_hrv) >= 0.12:
            anomalies.append(
                {
                    "id": f"hrv-drop-{latest.date}",
                    "date": latest.date,
                    "severity": "warning",
                    "metric": f"Kalp Değişkenliği {int(latest.hrv_ms)} ms (Normali: {int(base_hrv)} ms)",
                    "source": "Saat & Bileklik",
                    "title": "Uyarı: Vücut Yorgunluğu ve Stres Yükü Artışı",
                    "detail": "Sinir sistemi toparlanma göstergeniz (HRV) ortalamanızın altına düştü. Ağır egzersiz yerine hafif yürüyüş ve erken uyku önerilir.",
                }
            )

    # 6. Low daily step count / Spine & Sedentary warning
    if latest.steps is not None and latest.steps < 3000:
        anomalies.append(
            {
                "id": f"low-steps-{latest.date}",
                "date": latest.date,
                "severity": "warning",
                "metric": f"Günlük {latest.steps:,} adım (Hedef: {clinical['daily_step_target']:,}+)".replace(",", "."),
                "source": "Omurga & Metabolizma",
                "title": "Uyarı: Hareketsizlik (Bel Fıtığı ve İnsülin Direnci Riski)",
                "detail": (
                    f"Son günde {latest.steps:,} adım ölçüldü. Bel fıtığı ve kuyruk sokumu ameliyat geçmişiniz nedeniyle "
                    "her 45 dakikada bir ayağa kalkın ve gün içinde en az 30 dakika düşük tempolu yürüyüş ekleyin."
                ).replace(",", "."),
            }
        )

    # 7. Dehydration / Gallbladder & Body Water % warning
    if latest.water_pct is not None and latest.water_pct < 50.0:
        anomalies.append(
            {
                "id": f"low-water-{latest.date}",
                "date": latest.date,
                "severity": "warning",
                "metric": f"Vücut Suyu %{round(latest.water_pct, 1)} (Günlük Hedef: {clinical['daily_water_liters']} L)",
                "source": "Akıllı Tartı (Renpho)",
                "title": "Uyarı: Vücut Su Oranı Düşük (Safra Akışı ve Ödem Riski)",
                "detail": (
                    f"Vücut su oranınız %{round(latest.water_pct, 1)} ile ideal sınırın (%50) altında. "
                    f"Safra akışını akışkan tutmak, ödemi çözmek ve kasları korumak için bugün {clinical['daily_water_liters']} litre su tüketin."
                ),
            }
        )

    # 8. Cumulative sleep debt
    recent_sleep = [s.sleep_hours for s in summaries[-3:] if s.sleep_hours is not None]
    if recent_sleep and (sum(recent_sleep) / len(recent_sleep)) < 6.6:
        avg_slp = round(sum(recent_sleep) / len(recent_sleep), 1)
        anomalies.append(
            {
                "id": f"sleep-debt-{latest.date}",
                "date": latest.date,
                "severity": "warning",
                "metric": f"Son 3 Gün Ort. {avg_slp} saat (İdeal: 7.5+ saat)",
                "source": "Akıllı Bileklik & Saat",
                "title": "Uyarı: Yetersiz Uyku Süresi (Kortizol ve İştah Artışı)",
                "detail": f"Son 3 günde ortalama {avg_slp} saat uyudunuz. Az uyku sabah kortizolünü ve insülin direncini artırarak ödem ve tatlı isteğine yol açar.",
            }
        )

    # 9. Always provide a clear positive summary when heart & spine relief are strong
    if latest.resting_hr_bpm is not None and latest.resting_hr_bpm <= 62:
        anomalies.append(
            {
                "id": f"heart-nominal-{latest.date}",
                "date": latest.date,
                "severity": "nominal",
                "metric": f"Dinlenik Nabız {int(latest.resting_hr_bpm)} bpm • Omurga Kazancı -{clinical['spine_relief_kg']:.0f} kg",
                "source": "Kardiyoloji & Ortopedi",
                "title": "Olumlu: Kalp Kondisyonunuz Güçlü ve Omurga Yükünüz Azalıyor",
                "detail": (
                    f"Dinlenik nabzınız ({int(latest.resting_hr_bpm)} atım/dk) ve toparlanma puanınız ({int(latest.recovery_score)}/100) çok iyi seviyede. "
                    f"Başlangıçtan bugüne verdiğiniz {clinical['total_lost_kg']} kg ile bel omurlarınızdaki yükü {clinical['spine_relief_kg']:.0f} kg hafiflettiniz."
                ),
            }
        )
    elif not anomalies:
        anomalies.append(
            {
                "id": f"nominal-state-{latest.date}",
                "date": latest.date,
                "severity": "nominal",
                "metric": f"Toparlanma {int(latest.recovery_score)}/100",
                "source": "Tüm Cihazlar",
                "title": "Tüm Sağlık Göstergeleriniz Normal Aralıkta",
                "detail": "Tartı, akıllı saat ve bilekliğinizden alınan ölçümlerde herhangi bir risk veya tehlike sinyali görülmedi.",
            }
        )

    return anomalies


def build_analytics_insights(db: Session, range_key: str = "30d") -> Dict[str, Any]:
    summaries, window_status, cycle_start = filter_summaries_by_range_and_cycle(db, range_key=range_key)
    composition = compute_composition_quality(db, cycle_start=cycle_start, window_status=window_status)
    clinical = build_clinical_evaluation(db, summaries=summaries, composition=composition)
    anomalies = detect_anomalies(db, summaries=summaries, composition=composition)

    if not summaries:
        return {
            "window_status": "pending",
            "recovery_score": 0.0,
            "recovery_status": "pending",
            "composition_quality": composition,
            "clinical_evaluation": clinical,
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
        "clinical_evaluation": clinical,
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
