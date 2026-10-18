import os
from datetime import datetime, timezone
from typing import Any, Dict
from fastapi import Depends, FastAPI, HTTPException
from sqlalchemy.orm import Session
from services.analytics_anomaly.app import build_analytics_insights
from services.common import models
from services.common.database import get_db
from services.common.logger import attach_standard_middleware_and_handlers
from services.reconciliation.app import build_wearables_comparison, get_or_create_config

app = FastAPI(title="Gemini AI Advisor & Prompt Studio Microservice", version="1.0.0")
logger = attach_standard_middleware_and_handlers(app, "ai-advisor-service")

VALID_FOCUS_AREAS = {"holistic", "body_composition", "recovery_sleep", "wearable_calibration"}


def build_multi_device_prompt(db: Session) -> Dict[str, Any]:
    cfg = get_or_create_config(db)
    insights = build_analytics_insights(db, range_key="30d")
    comparison = build_wearables_comparison(db, days=14)
    scale_rows = (
        db.query(models.ScaleMeasurement)
        .filter(models.ScaleMeasurement.date >= cfg.cycle_start_date)
        .order_by(models.ScaleMeasurement.timestamp.desc())
        .limit(7)
        .all()
    )

    scale_lines = []
    for s in scale_rows:
        scale_lines.append(
            f"- {s.date}: Kilo={s.weight_kg} kg | BMI={s.bmi} | Yağ=%{s.body_fat_pct} | "
            f"Kas={s.muscle_mass_kg} kg | Su=%{s.water_pct} | İç Organ Yağı={s.visceral_fat} | BMR={s.bmr_kcal} kcal"
        )
    scale_block = "\n".join(scale_lines) if scale_lines else "- Aktif döngü penceresinde henüz tartı verisi yok."

    corr_lines = [
        f"- {c['pair']}: r={c['r_value']} ({c['strength']}) -> {c['interpretation']}"
        for c in insights.get("correlations", [])
    ]
    corr_block = "\n".join(corr_lines) if corr_lines else "- Yeterli korelasyon penceresi oluşmadı."

    anom_lines = [
        f"- [{a['severity'].upper()}] {a['title']} ({a['metric']}): {a['detail']}"
        for a in insights.get("anomalies", [])
    ]
    anom_block = "\n".join(anom_lines) if anom_lines else "- Aktif anomali yok."

    comp_q = insights.get("composition_quality", {})
    comp_sum = comparison.get("summary", {})

    prompt_text = (
        "# Çoklu Cihaz Biyometrik ve Metabolik Değerlendirme İsteği\n\n"
        "Aşağıda **Renpho ES-26BB-B** akıllı tartı, **Samsung Galaxy Watch6** ve **Garmin Smart Band** "
        "cihazlarımdan otomatik toplanıp öncelik kurallarıyla birleştirilmiş güncel sağlık verilerim yer almaktadır.\n\n"
        f"## 1. Takip Döngüsü ve Hedef Parametreler\n"
        f"- Döngü Başlangıç Tarihi: {cfg.cycle_start_date}\n"
        f"- Boy: {cfg.height_cm} cm | Hedef Kilo: {cfg.target_weight_kg} kg\n"
        f"- Güncel Toparlanma Skoru: {insights.get('recovery_score', 0)}/100 ({insights.get('recovery_status')})\n"
        f"- Kilo Değişim Kalitesi: {comp_q.get('headline')} "
        f"(Toplam: {comp_q.get('total_weight_delta_kg')} kg, Yağ: {comp_q.get('fat_mass_delta_kg')} kg, "
        f"Kas: {comp_q.get('muscle_mass_delta_kg')} kg, Su: {comp_q.get('water_pct_delta')} puan)\n\n"
        f"## 2. Son Renpho ES-26BB-B Tartı Ölçümleri (13 Metrik Özeti)\n"
        f"{scale_block}\n\n"
        f"## 3. Galaxy Watch6 vs. Garmin Smart Band Cihaz Uyum Özeti\n"
        f"- Cihazlar Arası Genel Uyum Skoru: %{comparison.get('agreement_score', 0)}\n"
        f"- Ortalama Adım Farkı: %{comp_sum.get('avg_steps_diff_pct', 0)} | "
        f"Ortalama Uyku Farkı: {comp_sum.get('avg_sleep_diff_hours', 0)} saat | "
        f"Ortalama RHR Farkı: {comp_sum.get('avg_rhr_diff_bpm', 0)} bpm\n\n"
        f"## 4. Çapraz Cihaz Korelasyon Bulguları (Pearson r)\n"
        f"{corr_block}\n\n"
        f"## 5. Tespit Edilen Biyometrik Anomaliler\n"
        f"{anom_block}\n\n"
        "## Beklenen Analiz\n"
        "1. Yağ kaybı hızımı ve kas kütlesi korunumumu değerlendir.\n"
        "2. Garmin uyku/stres/Body Battery ve Galaxy Watch6 HRV/nabız verilerime göre toparlanma kalitemi yorumla.\n"
        "3. Önümüzdeki 7 gün için beslenme, hidrasyon, uyku ve antrenman yoğunluğu önerilerini maddeler halinde sun."
    )

    return {
        "prompt_text": prompt_text,
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "data_days_count": len(insights.get("rolling_series", [])),
        "webhook_url_hint": "/api/ingest/webhook",
    }


def generate_ai_report(db: Session, focus_area: str = "holistic") -> Dict[str, Any]:
    focus = str(focus_area or "holistic").strip()
    if focus not in VALID_FOCUS_AREAS:
        raise HTTPException(
            status_code=400,
            detail=f"Geçersiz analiz odak alanı: '{focus}'. Geçerli değerler: holistic, body_composition, recovery_sleep, wearable_calibration.",
        )

    insights = build_analytics_insights(db, range_key="30d")
    comparison = build_wearables_comparison(db, days=14)
    comp_q = insights.get("composition_quality", {})
    rec_score = insights.get("recovery_score", 0.0)
    agreement = comparison.get("agreement_score", 0.0)

    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    source_mode = "deterministic_clinical_engine"
    markdown_text = ""

    if api_key:
        try:
            from google import genai  # type: ignore

            prompt_bundle = build_multi_device_prompt(db)
            client = genai.Client(api_key=api_key)
            resp = client.models.generate_content(
                model=os.getenv("GEMINI_MODEL", "gemini-2.5-flash"),
                contents=prompt_bundle["prompt_text"],
            )
            if resp and getattr(resp, "text", None):
                markdown_text = resp.text.strip()
                source_mode = "gemini_api"
        except Exception as exc:
            logger.warning(f"Gemini API fallback to deterministic clinical engine: {exc}")

    if not markdown_text:
        focus_titles = {
            "holistic": "Bütüncül Çoklu Cihaz Sağlık ve Metabolizma Sentezi",
            "body_composition": "Renpho ES-26BB-B Vücut Kompozisyonu ve Yağ/Kas Kalitesi Analizi",
            "recovery_sleep": "Garmin & Galaxy Watch6 Otonom Toparlanma, HRV ve Uyku Analizi",
            "wearable_calibration": "Galaxy Watch6 vs. Garmin Smart Band Sensör Uyum ve Öncelik Değerlendirmesi",
        }
        markdown_text = (
            f"## {focus_titles[focus]}\n\n"
            f"### 1. Vücut Kompozisyonu (Renpho ES-26BB-B)\n"
            f"- **Durum:** {comp_q.get('headline')}\n"
            f"- **Net Değişim:** Toplam `{comp_q.get('total_weight_delta_kg')} kg` değişimin "
            f"`%{comp_q.get('fat_loss_share_pct')}` kadarı yağ dokusundan (`{comp_q.get('fat_mass_delta_kg')} kg`), "
            f"`%{comp_q.get('muscle_loss_share_pct')}` kadarı kas dokusundan (`{comp_q.get('muscle_mass_delta_kg')} kg`) gerçekleşmiştir.\n"
            f"- **Yorum:** {comp_q.get('interpretation')}\n\n"
            f"### 2. Kardiyovasküler ve Otonom Toparlanma (Galaxy Watch6 + Garmin Smart Band)\n"
            f"- **Bileşik Toparlanma Skoru:** `{rec_score}/100` (`{insights.get('recovery_status')}`)\n"
            f"- **Sensör Uyum Skoru:** Watch6 ve Garmin arasında `%{agreement}` ölçüm tutarlılığı mevcuttur.\n"
            f"- **Korelasyon Özeti:** Uyku süresi 7 saatin üzerinde tutulduğunda HRV artmakta ve ertesi sabah tartıda ödem dalgalanması azalmaktadır.\n\n"
            f"### 3. Eylem Planı (Önümüzdeki 7 Gün)\n"
            f"1. **Protein ve Hidrasyon:** Kas korunumu için kilogram başına 1.6g protein ve günlük 2.5L su hedefini koruyun.\n"
            f"2. **Uyku Penceresi:** Garmin Body Battery şarjını 85+ seviyesinde tutmak için 7.2 saat uyku hedefleyin.\n"
            f"3. **Aktivite:** Galaxy Watch6 üzerinde günlük 8.500+ adım ve haftada 3 gün direnç egzersizi uygulayın."
        )

    report = models.AIInsightReport(
        focus_area=focus,
        source_mode=source_mode,
        summary_markdown=markdown_text,
    )
    db.add(report)
    db.commit()
    db.refresh(report)

    return {
        "id": report.id,
        "created_at": report.created_at.isoformat(),
        "focus_area": report.focus_area,
        "source_mode": report.source_mode,
        "summary_markdown": report.summary_markdown,
    }


def list_ai_reports_data(db: Session) -> Dict[str, Any]:
    rows = (
        db.query(models.AIInsightReport)
        .order_by(models.AIInsightReport.created_at.desc())
        .limit(25)
        .all()
    )
    if not rows:
        first = generate_ai_report(db, focus_area="holistic")
        return {"items": [first]}

    return {
        "items": [
            {
                "id": r.id,
                "created_at": r.created_at.isoformat(),
                "focus_area": r.focus_area,
                "source_mode": r.source_mode,
                "summary_markdown": r.summary_markdown,
            }
            for r in rows
        ]
    }


@app.get("/health")
def health():
    return {"service": "ai-advisor-service", "status": "healthy"}


@app.get("/prompts")
def get_prompts(db: Session = Depends(get_db)):
    return build_multi_device_prompt(db)


@app.post("/analyze")
def post_analyze(payload: Dict[str, Any], db: Session = Depends(get_db)):
    return generate_ai_report(db, focus_area=str(payload.get("focus_area") or "holistic"))


@app.get("/reports")
def get_reports(db: Session = Depends(get_db)):
    return list_ai_reports_data(db)
