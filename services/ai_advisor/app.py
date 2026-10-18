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
    prof = getattr(cfg, "_profile", None)
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
    clinical = insights.get("clinical_evaluation", {})
    comp_sum = comparison.get("summary", {})

    gender_label = "Erkek" if (getattr(prof, "gender", "male") if prof else "male") == "male" else "Kadın"
    birth_date = getattr(prof, "birth_date", "1990-01-01") if prof else "1990-01-01"
    surgeries = (getattr(prof, "surgeries", "") if prof else "") or "Belirtilmedi"
    chronic = (getattr(prof, "chronic_conditions", "") if prof else "") or "Belirtilmedi"
    meds = (getattr(prof, "medications", "") if prof else "") or "Belirtilmedi"
    allergies = (getattr(prof, "allergies_and_notes", "") if prof else "") or "Belirtilmedi"
    start_w = getattr(prof, "starting_weight_kg", 85.0) if prof else 85.0

    pillar_lines = [
        f"- [{p.get('specialty')}] {p.get('title')} ({p.get('metric')}): {p.get('summary')}"
        for p in clinical.get("pillars", [])
    ]
    pillar_block = "\n".join(pillar_lines) if pillar_lines else "- Klinik değerlendirme hazırlanıyor."

    prompt_text = (
        "# Uzman Doktor Heyeti — Çoklu Cihaz Biyometrik ve Tıbbi Takip İsteği\n\n"
        "Sen Endokrinoloji, Kardiyoloji, Gastroenteroloji, Fizik Tedavi ve Uyku Hekimliği uzmanlarından oluşan "
        "bir klinik danışman heyetisin. Aşağıda **Renpho ES-26BB-B** akıllı tartı, **Samsung Galaxy Watch6** ve "
        "**Garmin Smart Band** cihazlarımdan otomatik toplanan güncel sağlık verilerim ve tıbbi geçmişim yer almaktadır.\n\n"
        f"## 1. Kişisel Profil, Tıbbi Geçmiş ve Hedefler\n"
        f"- Doğum Tarihi: {birth_date} | Cinsiyet: {gender_label}\n"
        f"- Boy: {cfg.height_cm} cm | Başlangıç Kilosu: {start_w} kg | Güncel Kilo: {clinical.get('current_weight_kg', start_w)} kg | Hedef Kilo: {cfg.target_weight_kg} kg\n"
        f"- Başlangıçtan Bugüne Verilen Kilo: {clinical.get('total_lost_kg', 0)} kg | Bel Omurgası Yük Azalımı: -{clinical.get('spine_relief_kg', 0)} kg\n"
        f"- Geçirilen Ameliyatlar: {surgeries}\n"
        f"- Kronik Rahatsızlıklar: {chronic}\n"
        f"- İlaç ve Takviyeler: {meds}\n"
        f"- Beslenme Notları / Alerjiler: {allergies}\n"
        f"- Kişiselleştirilmiş Günlük Hedefler: {clinical.get('daily_water_liters', 3.0)} L Su | {clinical.get('daily_protein_g', 150)} g Protein | {clinical.get('daily_step_target', 6500)}+ Adım\n"
        f"- Güncel Toparlanma Skoru: {insights.get('recovery_score', 0)}/100 ({insights.get('recovery_status')})\n"
        f"- Kilo Değişim Kalitesi: {comp_q.get('headline')} "
        f"(Toplam: {comp_q.get('total_weight_delta_kg')} kg, Yağ: {comp_q.get('fat_mass_delta_kg')} kg, "
        f"Kas: {comp_q.get('muscle_mass_delta_kg')} kg, Su: {comp_q.get('water_pct_delta')} puan)\n\n"
        f"## 2. Uzman Branş Bulguları\n"
        f"{pillar_block}\n\n"
        f"## 3. Son Renpho ES-26BB-B Tartı Ölçümleri (13 Metrik Özeti)\n"
        f"{scale_block}\n\n"
        f"## 4. Galaxy Watch6 vs. Garmin Smart Band Cihaz Uyum Özeti\n"
        f"- Cihazlar Arası Genel Uyum Skoru: %{comparison.get('agreement_score', 0)}\n"
        f"- Ortalama Adım Farkı: %{comp_sum.get('avg_steps_diff_pct', 0)} | "
        f"Ortalama Uyku Farkı: {comp_sum.get('avg_sleep_diff_hours', 0)} saat | "
        f"Ortalama RHR Farkı: {comp_sum.get('avg_rhr_diff_bpm', 0)} bpm\n\n"
        f"## 5. Çapraz Cihaz Korelasyon Bulguları (Pearson r)\n"
        f"{corr_block}\n\n"
        f"## 6. Tespit Edilen Biyometrik Uyarılar\n"
        f"{anom_block}\n\n"
        "## Beklenen Uzman Hekim Analizi\n"
        "1. İnsülin direnci, iç organ yağlanması, safra kesesi ameliyatı ve bel fıtığı/kuyruk sokumu geçmişimi dikkate alarak mevcut kilo kaybımı ve kas korunumumu değerlendir.\n"
        "2. Garmin gece HRV/uyku/Body Battery ve Galaxy Watch6 SpO2/nabız/adım verilerime göre kalp-damar, solunum ve sinir sistemi toparlanmamı yorumla.\n"
        "3. Önümüzdeki 7 gün için uygulanabilir, net ve maddeler halinde doktor reçetesi niteliğinde beslenme, su, uyku ve bel dostu hareket planı sun."
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
    clinical = insights.get("clinical_evaluation", {})
    rec_score = insights.get("recovery_score", 0.0)
    agreement = comparison.get("agreement_score", 0.0)

    int_cfg = db.query(models.IntegrationSettings).filter(models.IntegrationSettings.id == 1).first()
    api_key = (int_cfg.gemini_api_key if int_cfg and int_cfg.gemini_api_key else os.getenv("GEMINI_API_KEY", "")).strip()
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
            "holistic": "Uzman Hekim Heyeti — Bütüncül Sağlık ve Metabolizma Konsültasyonu",
            "body_composition": "Endokrinoloji & Beslenme — İnsülin Direnci, İç Organ Yağı ve Kas Korunumu",
            "recovery_sleep": "Kardiyoloji & Uyku Hekimliği — Gece HRV, SpO2 ve Otonom Toparlanma",
            "wearable_calibration": "Cihaz Uyum ve Biyometrik Güvenilirlik Değerlendirmesi",
        }
        pillars_md = "\n".join(
            f"- **{p.get('specialty')} ({p.get('title')}):** {p.get('summary')} *({p.get('metric')})*"
            for p in clinical.get("pillars", [])
        )
        markdown_text = (
            f"## {focus_titles[focus]}\n\n"
            f"### 1. Genel Klinik Değerlendirme ve Vücut Kompozisyonu\n"
            f"- **Özet:** {clinical.get('headline', comp_q.get('headline'))}\n"
            f"- **Dönemlik Kompozisyon Değişimi:** Toplam `{comp_q.get('total_weight_delta_kg')} kg` değişimin "
            f"`%{comp_q.get('fat_loss_share_pct')}` kadarı yağ dokusundan (`{comp_q.get('fat_mass_delta_kg')} kg`), "
            f"`%{comp_q.get('muscle_loss_share_pct')}` kadarı kas dokusundan (`{comp_q.get('muscle_mass_delta_kg')} kg`) gerçekleşmiştir.\n\n"
            f"### 2. Branş Bazlı Uzman Hekim Notları\n"
            f"{pillars_md}\n\n"
            f"### 3. Kardiyovasküler ve Sensör Özeti\n"
            f"- **Bileşik Toparlanma Skoru:** `{rec_score}/100` (`{insights.get('recovery_status')}`)\n"
            f"- **Sensör Uyum Skoru:** Watch6 ve Garmin arasında `%{agreement}` ölçüm tutarlılığı mevcuttur.\n\n"
            f"### 4. Önümüzdeki 7 Gün İçin Doktor Reçetesi\n"
            f"1. **Safra ve Kas Korumalı Beslenme:** Günlük **{clinical.get('daily_protein_g', 150)} g protein** ve **{clinical.get('daily_water_liters', 3.5)} L su** hedefini koruyun; safra çamurunu önlemek için 14 saati aşan açlıklardan kaçının.\n"
            f"2. **İnsülin Direnci İçin Akşam Yürüyüşü:** Akşam yemeğinden 30 dakika sonra 15-20 dakikalık yürüyüş yaparak sabah kan şekeri ve iç organ yağlanmasını düşürün.\n"
            f"3. **Bel Fıtığı ve Masa Başı Ergonomisi:** Kesintisiz **{clinical.get('desk_break_minutes', 45)} dakikadan fazla oturmayın**; günlük **{clinical.get('daily_step_target', 6500)}+ adım** hedefini bel dostu düz yürüyüşle tamamlayın.\n"
            f"4. **Gece Oksijeni (SpO2) ve Uyku:** Gece SpO2 değerini %95'e yaklaştırmak için yan yatış pozisyonunu tercih edin ve 7.5 saat uyku hedefleyin."
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
