import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const MOCK_API_RESPONSES: Record<string, unknown> = {
  "/api/health": {
    "status": "healthy",
    "version": "1.0.0",
    "commit": "HEAD",
    "timestamp": "2026-10-18T10:00:00Z",
    "services": [
      {
        "name": "renpho-sync-service",
        "role": "Renpho ES-26BB-B Cloud & BLE Sync",
        "status": "healthy",
        "circuit_state": "CLOSED",
        "latency_ms": 1.2,
        "last_check": "2026-10-18T10:00:00Z"
      },
      {
        "name": "garmin-sync-service",
        "role": "Garmin Connect Smart Band Sync",
        "status": "healthy",
        "circuit_state": "CLOSED",
        "latency_ms": 1.2,
        "last_check": "2026-10-18T10:00:00Z"
      },
      {
        "name": "watch6-ingest-service",
        "role": "Galaxy Watch6 Webhook & DB Ingest",
        "status": "healthy",
        "circuit_state": "CLOSED",
        "latency_ms": 1.2,
        "last_check": "2026-10-18T10:00:00Z"
      },
      {
        "name": "reconciliation-service",
        "role": "Multi-Device Priority & Cycle Guard",
        "status": "healthy",
        "circuit_state": "CLOSED",
        "latency_ms": 1.2,
        "last_check": "2026-10-18T10:00:00Z"
      },
      {
        "name": "analytics-anomaly-service",
        "role": "Recovery, Pearson r & Anomaly Engine",
        "status": "healthy",
        "circuit_state": "CLOSED",
        "latency_ms": 1.2,
        "last_check": "2026-10-18T10:00:00Z"
      },
      {
        "name": "ai-advisor-service",
        "role": "Gemini AI & Prompt Studio",
        "status": "healthy",
        "circuit_state": "CLOSED",
        "latency_ms": 1.2,
        "last_check": "2026-10-18T10:00:00Z"
      },
      {
        "name": "scheduler-orchestrator",
        "role": "Automated Sync & Pipeline Orchestrator",
        "status": "healthy",
        "circuit_state": "CLOSED",
        "latency_ms": 1.2,
        "last_check": "2026-10-18T10:00:00Z"
      }
    ]
  },
  "/api/changelog": {
    "version": "1.0.0",
    "commit": "HEAD",
    "changelog": "# Değişiklik Günlüğü (Changelog)\n\n## v1.0.0 — 2026-10-18\n\n### Eklenenler\n- **Çoklu Mikroservis Mimarisi (11 Konteyner)**: Hata izolasyonu (Bulkhead) ve devre kesici (Circuit Breaker) desenleriyle `api-gateway`, `renpho-sync-service`, `garmin-sync-service`, `watch6-ingest-service`, `reconciliation-service`, `analytics-anomaly-service`, `ai-advisor-service`, `scheduler-orchestrator`, `redis`, `db` (PostgreSQL) ve `frontend` servisleri oluşturuldu.\n- **Renpho ES-26BB-B Tam Otomatik Senkronizasyon ve Web Bluetooth**: Renpho bulut API'sinden periyodik çekim ve tarayıcı Web Bluetooth API (`0xFFE0` / `0x181D`) üzerinden 13 vücut kompozisyonu metriğinin (kilo, BMI, yağ oranı, kas kütlesi, iç organ yağı, deri altı yağ, vücut suyu, kemik kütlesi, BMR, protein, metabolik yaş, yağsız ağırlık, tendon kütlesi) canlı okunması sağlandı.\n- **Garmin Smart Band Bulut Entegrasyonu**: Garmin Connect üzerinden günlük adım, dinlenik/min/maks nabız, uyku süresi ve evreleri (derin, hafif, REM, uyku skoru), stres skoru, Body Battery, HRV ve SpO2 verilerinin otomatik senkronizasyonu eklendi.\n- **Samsung Galaxy Watch6 / Health Connect Otomatik Köprüsü**: Telefondan arka plan Webhook (`POST /api/ingest/webhook`) ile otomatik JSON veri akışı, izlenen klasör (`WATCH_EXPORT_DIR`) tarayıcısı ve Health Connect SQLite `.db` / CSV yedek içe aktarımı eklendi.\n- **Akıllı Cihaz Önceliklendirme ve Watch6 vs. Garmin Kıyaslama**: Aynı gün birden fazla giyilebilir cihazdan gelen verilerin çift sayılmasını önleyen metrik bazlı öncelik kuralları (`priority`, `average`, `max`), yan yana cihaz uyum/sapma tablosu ve Bölüm 6 zamansal döngü penceresi sınır doğrulaması (`cycle_start_date`) eklendi.\n- **Anlamlandırma, Korelasyon ve Anomali Motoru**: 7/30 günlük hareketli ortalamalar, Toparlanma Skoru (0–100), Kilo Değişim Kalitesi (yağ, kas ve su değişim payları), Pearson ($r$) çapraz korelasyon matrisi ve otomatik anomali uyarıları (RHR artışı, HRV düşüşü, kas kaybı riski, su kaybı, uyku borcu, cihaz sapması) eklendi.\n- **AI Danışman ve Kopyalanabilir Prompt Stüdyosu**: İzole `ai-advisor-service` üzerinden Gemini AI çoklu cihaz sağlık yorumlaması ve tek tıkla kopyalanabilir yapılandırılmış Türkçe analiz prompt'u üretimi eklendi.\n- **Kurumsal Çift Tema Arayüz (React Aria Components & Nivo)**: Kapalı tasarım token seti, Koyu/Açık tema WCAG AA kontrast uyumu, çevrimdışı barındırılan IBM Plex Sans, IBM Plex Mono ve Material Symbols Outlined fontları ile 5 ana ekran oluşturuldu.\n"
  },
  "/api/sync/status": {
    "auto_sync_interval_minutes": 60,
    "providers": [
      {
        "provider": "renpho",
        "device_name": "Renpho Body Fat Scale ES-26BB-B",
        "microservice": "renpho-sync-service",
        "mode": "Bulut API + Web Bluetooth (BLE)",
        "records_count": 14,
        "circuit_state": "CLOSED",
        "status": "nominal"
      },
      {
        "provider": "garmin",
        "device_name": "Garmin Smart Band",
        "microservice": "garmin-sync-service",
        "mode": "Garmin Connect OAuth Otomatik Çekim",
        "records_count": 14,
        "circuit_state": "CLOSED",
        "status": "nominal"
      },
      {
        "provider": "watch6",
        "device_name": "Samsung Galaxy Watch6",
        "microservice": "watch6-ingest-service",
        "mode": "Health Connect Webhook + Klasör İzleyici",
        "records_count": 14,
        "circuit_state": "CLOSED",
        "status": "nominal"
      }
    ],
    "recent_logs": [
      {
        "id": 3,
        "provider": "watch6",
        "status": "nominal",
        "records_processed": 14,
        "message": "Samsung Galaxy Watch6 Health Connect Webhook verileri senkronize edildi.",
        "created_at": "2026-10-18T09:45:00Z"
      },
      {
        "id": 2,
        "provider": "garmin",
        "status": "nominal",
        "records_processed": 14,
        "message": "Garmin Smart Band uyku, Body Battery, stres ve HRV verileri senkronize edildi.",
        "created_at": "2026-10-18T09:45:00Z"
      },
      {
        "id": 1,
        "provider": "renpho",
        "status": "nominal",
        "records_processed": 14,
        "message": "Renpho ES-26BB-B bulut senkronizasyonu tamamlandı (13 metrik doğrulandı).",
        "created_at": "2026-10-18T09:45:00Z"
      }
    ]
  },
  "/api/dashboard/overview": {
    "last_updated": "2026-10-18T10:00:00Z",
    "range": "30d",
    "scope": "all",
    "window_status": "active",
    "cycle_start_date": "2026-10-05",
    "metrics": [
      {
        "key": "weight",
        "label": "Güncel Kilo (Renpho)",
        "value": "82.63 kg",
        "delta": "-2.22 kg",
        "target_tab": "scale"
      },
      {
        "key": "body_fat",
        "label": "Yağ Oranı (ES-26BB-B)",
        "value": "%23.3",
        "delta": "-1.51 puan",
        "target_tab": "scale"
      },
      {
        "key": "muscle",
        "label": "Kas Kütlesi (ES-26BB-B)",
        "value": "60.07 kg",
        "delta": "-0.18 kg",
        "target_tab": "scale"
      },
      {
        "key": "recovery",
        "label": "Toparlanma Skoru",
        "value": "83 / 100",
        "delta": "+11.6 puan",
        "target_tab": "insights"
      },
      {
        "key": "steps",
        "label": "Günlük Adım (Watch6/Garmin)",
        "value": "10.420",
        "delta": "+2220 adım",
        "target_tab": "wearables"
      },
      {
        "key": "sleep",
        "label": "Uyku Süresi (Garmin/Watch6)",
        "value": "7.5 sa",
        "delta": "+0.9 sa",
        "target_tab": "wearables"
      }
    ],
    "weight_series": [
      {
        "id": "Kilo (kg)",
        "data": [
          {
            "x": "10-05",
            "y": 84.85
          },
          {
            "x": "10-06",
            "y": 84.31
          },
          {
            "x": "10-07",
            "y": 84.37
          },
          {
            "x": "10-08",
            "y": 84.43
          },
          {
            "x": "10-09",
            "y": 83.89
          },
          {
            "x": "10-10",
            "y": 83.95
          },
          {
            "x": "10-11",
            "y": 84.01
          },
          {
            "x": "10-12",
            "y": 83.47
          },
          {
            "x": "10-13",
            "y": 83.53
          },
          {
            "x": "10-14",
            "y": 83.59
          },
          {
            "x": "10-15",
            "y": 83.05
          },
          {
            "x": "10-16",
            "y": 83.11
          },
          {
            "x": "10-17",
            "y": 83.17
          },
          {
            "x": "10-18",
            "y": 82.63
          }
        ]
      },
      {
        "id": "7g Ort. Kilo (kg)",
        "data": [
          {
            "x": "10-05",
            "y": 84.85
          },
          {
            "x": "10-06",
            "y": 84.58
          },
          {
            "x": "10-07",
            "y": 84.51
          },
          {
            "x": "10-08",
            "y": 84.49
          },
          {
            "x": "10-09",
            "y": 84.37
          },
          {
            "x": "10-10",
            "y": 84.3
          },
          {
            "x": "10-11",
            "y": 84.26
          },
          {
            "x": "10-12",
            "y": 84.06
          },
          {
            "x": "10-13",
            "y": 83.95
          },
          {
            "x": "10-14",
            "y": 83.84
          },
          {
            "x": "10-15",
            "y": 83.64
          },
          {
            "x": "10-16",
            "y": 83.53
          },
          {
            "x": "10-17",
            "y": 83.42
          },
          {
            "x": "10-18",
            "y": 83.22
          }
        ]
      },
      {
        "id": "Kas Kütlesi (kg)",
        "data": [
          {
            "x": "10-05",
            "y": 60.25
          },
          {
            "x": "10-06",
            "y": 60.19
          },
          {
            "x": "10-07",
            "y": 60.23
          },
          {
            "x": "10-08",
            "y": 60.17
          },
          {
            "x": "10-09",
            "y": 60.21
          },
          {
            "x": "10-10",
            "y": 60.15
          },
          {
            "x": "10-11",
            "y": 60.19
          },
          {
            "x": "10-12",
            "y": 60.13
          },
          {
            "x": "10-13",
            "y": 60.17
          },
          {
            "x": "10-14",
            "y": 60.11
          },
          {
            "x": "10-15",
            "y": 60.15
          },
          {
            "x": "10-16",
            "y": 60.09
          },
          {
            "x": "10-17",
            "y": 60.13
          },
          {
            "x": "10-18",
            "y": 60.07
          }
        ]
      }
    ],
    "recovery_series": [
      {
        "id": "Toparlanma Skoru",
        "data": [
          {
            "x": "10-05",
            "y": 71.4
          },
          {
            "x": "10-06",
            "y": 76.8
          },
          {
            "x": "10-07",
            "y": 77.3
          },
          {
            "x": "10-08",
            "y": 73.0
          },
          {
            "x": "10-09",
            "y": 78.3
          },
          {
            "x": "10-10",
            "y": 78.9
          },
          {
            "x": "10-11",
            "y": 74.5
          },
          {
            "x": "10-12",
            "y": 79.8
          },
          {
            "x": "10-13",
            "y": 80.4
          },
          {
            "x": "10-14",
            "y": 76.1
          },
          {
            "x": "10-15",
            "y": 81.4
          },
          {
            "x": "10-16",
            "y": 81.9
          },
          {
            "x": "10-17",
            "y": 77.6
          },
          {
            "x": "10-18",
            "y": 83.0
          }
        ]
      },
      {
        "id": "HRV (ms)",
        "data": [
          {
            "x": "10-05",
            "y": 42.0
          },
          {
            "x": "10-06",
            "y": 46.6
          },
          {
            "x": "10-07",
            "y": 47.2
          },
          {
            "x": "10-08",
            "y": 43.8
          },
          {
            "x": "10-09",
            "y": 48.4
          },
          {
            "x": "10-10",
            "y": 49.0
          },
          {
            "x": "10-11",
            "y": 45.6
          },
          {
            "x": "10-12",
            "y": 50.2
          },
          {
            "x": "10-13",
            "y": 50.8
          },
          {
            "x": "10-14",
            "y": 47.4
          },
          {
            "x": "10-15",
            "y": 52.0
          },
          {
            "x": "10-16",
            "y": 52.6
          },
          {
            "x": "10-17",
            "y": 49.2
          },
          {
            "x": "10-18",
            "y": 53.8
          }
        ]
      },
      {
        "id": "Dinlenik Nabız (bpm)",
        "data": [
          {
            "x": "10-05",
            "y": 62.5
          },
          {
            "x": "10-06",
            "y": 60.9
          },
          {
            "x": "10-07",
            "y": 60.7
          },
          {
            "x": "10-08",
            "y": 62.0
          },
          {
            "x": "10-09",
            "y": 60.4
          },
          {
            "x": "10-10",
            "y": 60.2
          },
          {
            "x": "10-11",
            "y": 61.6
          },
          {
            "x": "10-12",
            "y": 60.0
          },
          {
            "x": "10-13",
            "y": 59.8
          },
          {
            "x": "10-14",
            "y": 61.1
          },
          {
            "x": "10-15",
            "y": 59.5
          },
          {
            "x": "10-16",
            "y": 59.4
          },
          {
            "x": "10-17",
            "y": 60.7
          },
          {
            "x": "10-18",
            "y": 59.0
          }
        ]
      }
    ],
    "daily_rows": [
      {
        "id": 14,
        "date": "2026-10-18",
        "weight_kg": 82.63,
        "body_fat_pct": 23.34,
        "muscle_mass_kg": 60.07,
        "water_pct": 56.3,
        "steps": 10420,
        "sleep_hours": 7.45,
        "resting_hr_bpm": 59.0,
        "hrv_ms": 53.8,
        "stress_score": 30.9,
        "body_battery_max": 96,
        "recovery_score": 83.0,
        "primary_source": "Tartı:renpho_es26bb|Uyku:garmin_band|Adım:galaxy_watch6"
      },
      {
        "id": 13,
        "date": "2026-10-17",
        "weight_kg": 83.17,
        "body_fat_pct": 23.53,
        "muscle_mass_kg": 60.13,
        "water_pct": 56.06,
        "steps": 11080,
        "sleep_hours": 6.55,
        "resting_hr_bpm": 60.7,
        "hrv_ms": 49.2,
        "stress_score": 38.6,
        "body_battery_max": 94,
        "recovery_score": 77.6,
        "primary_source": "Tartı:renpho_es26bb|Uyku:garmin_band|Adım:galaxy_watch6"
      },
      {
        "id": 12,
        "date": "2026-10-16",
        "weight_kg": 83.11,
        "body_fat_pct": 23.6,
        "muscle_mass_kg": 60.09,
        "water_pct": 56.06,
        "steps": 9940,
        "sleep_hours": 7.45,
        "resting_hr_bpm": 59.4,
        "hrv_ms": 52.6,
        "stress_score": 32.3,
        "body_battery_max": 96,
        "recovery_score": 81.9,
        "primary_source": "Tartı:renpho_es26bb|Uyku:garmin_band|Adım:galaxy_watch6"
      },
      {
        "id": 11,
        "date": "2026-10-15",
        "weight_kg": 83.05,
        "body_fat_pct": 23.67,
        "muscle_mass_kg": 60.15,
        "water_pct": 56.06,
        "steps": 10600,
        "sleep_hours": 7.45,
        "resting_hr_bpm": 59.5,
        "hrv_ms": 52.0,
        "stress_score": 33.0,
        "body_battery_max": 96,
        "recovery_score": 81.4,
        "primary_source": "Tartı:renpho_es26bb|Uyku:garmin_band|Adım:galaxy_watch6"
      },
      {
        "id": 10,
        "date": "2026-10-14",
        "weight_kg": 83.59,
        "body_fat_pct": 23.86,
        "muscle_mass_kg": 60.11,
        "water_pct": 55.82,
        "steps": 9460,
        "sleep_hours": 6.55,
        "resting_hr_bpm": 61.1,
        "hrv_ms": 47.4,
        "stress_score": 40.7,
        "body_battery_max": 94,
        "recovery_score": 76.1,
        "primary_source": "Tartı:renpho_es26bb|Uyku:garmin_band|Adım:galaxy_watch6"
      },
      {
        "id": 9,
        "date": "2026-10-13",
        "weight_kg": 83.53,
        "body_fat_pct": 23.93,
        "muscle_mass_kg": 60.17,
        "water_pct": 55.82,
        "steps": 10120,
        "sleep_hours": 7.45,
        "resting_hr_bpm": 59.8,
        "hrv_ms": 50.8,
        "stress_score": 34.4,
        "body_battery_max": 96,
        "recovery_score": 80.4,
        "primary_source": "Tartı:renpho_es26bb|Uyku:garmin_band|Adım:galaxy_watch6"
      },
      {
        "id": 8,
        "date": "2026-10-12",
        "weight_kg": 83.47,
        "body_fat_pct": 24.0,
        "muscle_mass_kg": 60.13,
        "water_pct": 55.82,
        "steps": 8980,
        "sleep_hours": 7.45,
        "resting_hr_bpm": 60.0,
        "hrv_ms": 50.2,
        "stress_score": 35.1,
        "body_battery_max": 96,
        "recovery_score": 79.8,
        "primary_source": "Tartı:renpho_es26bb|Uyku:garmin_band|Adım:galaxy_watch6"
      },
      {
        "id": 7,
        "date": "2026-10-11",
        "weight_kg": 84.01,
        "body_fat_pct": 24.19,
        "muscle_mass_kg": 60.19,
        "water_pct": 55.58,
        "steps": 9640,
        "sleep_hours": 6.55,
        "resting_hr_bpm": 61.6,
        "hrv_ms": 45.6,
        "stress_score": 42.8,
        "body_battery_max": 94,
        "recovery_score": 74.5,
        "primary_source": "Tartı:renpho_es26bb|Uyku:garmin_band|Adım:galaxy_watch6"
      },
      {
        "id": 6,
        "date": "2026-10-10",
        "weight_kg": 83.95,
        "body_fat_pct": 24.26,
        "muscle_mass_kg": 60.15,
        "water_pct": 55.58,
        "steps": 8500,
        "sleep_hours": 7.45,
        "resting_hr_bpm": 60.2,
        "hrv_ms": 49.0,
        "stress_score": 36.5,
        "body_battery_max": 96,
        "recovery_score": 78.9,
        "primary_source": "Tartı:renpho_es26bb|Uyku:garmin_band|Adım:galaxy_watch6"
      },
      {
        "id": 5,
        "date": "2026-10-09",
        "weight_kg": 83.89,
        "body_fat_pct": 24.33,
        "muscle_mass_kg": 60.21,
        "water_pct": 55.58,
        "steps": 9160,
        "sleep_hours": 7.45,
        "resting_hr_bpm": 60.4,
        "hrv_ms": 48.4,
        "stress_score": 37.2,
        "body_battery_max": 96,
        "recovery_score": 78.3,
        "primary_source": "Tartı:renpho_es26bb|Uyku:garmin_band|Adım:galaxy_watch6"
      },
      {
        "id": 4,
        "date": "2026-10-08",
        "weight_kg": 84.43,
        "body_fat_pct": 24.52,
        "muscle_mass_kg": 60.17,
        "water_pct": 55.34,
        "steps": 8020,
        "sleep_hours": 6.55,
        "resting_hr_bpm": 62.0,
        "hrv_ms": 43.8,
        "stress_score": 44.9,
        "body_battery_max": 94,
        "recovery_score": 73.0,
        "primary_source": "Tartı:renpho_es26bb|Uyku:garmin_band|Adım:galaxy_watch6"
      },
      {
        "id": 3,
        "date": "2026-10-07",
        "weight_kg": 84.37,
        "body_fat_pct": 24.59,
        "muscle_mass_kg": 60.23,
        "water_pct": 55.34,
        "steps": 8680,
        "sleep_hours": 7.45,
        "resting_hr_bpm": 60.7,
        "hrv_ms": 47.2,
        "stress_score": 38.6,
        "body_battery_max": 96,
        "recovery_score": 77.3,
        "primary_source": "Tartı:renpho_es26bb|Uyku:garmin_band|Adım:galaxy_watch6"
      },
      {
        "id": 2,
        "date": "2026-10-06",
        "weight_kg": 84.31,
        "body_fat_pct": 24.66,
        "muscle_mass_kg": 60.19,
        "water_pct": 55.34,
        "steps": 7540,
        "sleep_hours": 7.45,
        "resting_hr_bpm": 60.9,
        "hrv_ms": 46.6,
        "stress_score": 39.3,
        "body_battery_max": 96,
        "recovery_score": 76.8,
        "primary_source": "Tartı:renpho_es26bb|Uyku:garmin_band|Adım:galaxy_watch6"
      },
      {
        "id": 1,
        "date": "2026-10-05",
        "weight_kg": 84.85,
        "body_fat_pct": 24.85,
        "muscle_mass_kg": 60.25,
        "water_pct": 55.1,
        "steps": 8200,
        "sleep_hours": 6.55,
        "resting_hr_bpm": 62.5,
        "hrv_ms": 42.0,
        "stress_score": 47.0,
        "body_battery_max": 94,
        "recovery_score": 71.4,
        "primary_source": "Tartı:renpho_es26bb|Uyku:garmin_band|Adım:galaxy_watch6"
      }
    ],
    "anomalies": [
      {
        "id": "nominal-state-2026-10-18",
        "date": "2026-10-18",
        "severity": "nominal",
        "metric": "Toparlanma 83.0/100",
        "source": "all_devices",
        "title": "Tüm Biyometrik Göstergeler Nominal Aralıkta",
        "detail": "Renpho ES-26BB-B, Galaxy Watch6 ve Garmin Smart Band metriklerinde kritik sapma tespit edilmedi."
      }
    ],
    "services": [
      {
        "name": "renpho-sync-service",
        "role": "Renpho ES-26BB-B Cloud & BLE Sync",
        "status": "healthy",
        "circuit_state": "CLOSED",
        "latency_ms": 1.2,
        "last_check": "2026-10-18T10:00:00Z"
      },
      {
        "name": "garmin-sync-service",
        "role": "Garmin Connect Smart Band Sync",
        "status": "healthy",
        "circuit_state": "CLOSED",
        "latency_ms": 1.2,
        "last_check": "2026-10-18T10:00:00Z"
      },
      {
        "name": "watch6-ingest-service",
        "role": "Galaxy Watch6 Webhook & DB Ingest",
        "status": "healthy",
        "circuit_state": "CLOSED",
        "latency_ms": 1.2,
        "last_check": "2026-10-18T10:00:00Z"
      },
      {
        "name": "reconciliation-service",
        "role": "Multi-Device Priority & Cycle Guard",
        "status": "healthy",
        "circuit_state": "CLOSED",
        "latency_ms": 1.2,
        "last_check": "2026-10-18T10:00:00Z"
      },
      {
        "name": "analytics-anomaly-service",
        "role": "Recovery, Pearson r & Anomaly Engine",
        "status": "healthy",
        "circuit_state": "CLOSED",
        "latency_ms": 1.2,
        "last_check": "2026-10-18T10:00:00Z"
      },
      {
        "name": "ai-advisor-service",
        "role": "Gemini AI & Prompt Studio",
        "status": "healthy",
        "circuit_state": "CLOSED",
        "latency_ms": 1.2,
        "last_check": "2026-10-18T10:00:00Z"
      },
      {
        "name": "scheduler-orchestrator",
        "role": "Automated Sync & Pipeline Orchestrator",
        "status": "healthy",
        "circuit_state": "CLOSED",
        "latency_ms": 1.2,
        "last_check": "2026-10-18T10:00:00Z"
      }
    ]
  },
  "/api/measurements/scale": {
    "items": [
      {
        "id": 14,
        "date": "2026-10-18",
        "timestamp": "2026-10-18T07:30:00Z",
        "source": "renpho_es26bb",
        "weight_kg": 82.63,
        "bmi": 26.08,
        "body_fat_pct": 23.34,
        "muscle_mass_kg": 60.07,
        "visceral_fat": 10.5,
        "subcutaneous_fat_pct": 20.07,
        "water_pct": 56.3,
        "bone_mass_kg": 3.18,
        "bmr_kcal": 1719,
        "protein_pct": 17.19,
        "metabolic_age": 33,
        "fat_free_weight_kg": 63.34,
        "sinew_mass_kg": 56.47
      },
      {
        "id": 13,
        "date": "2026-10-17",
        "timestamp": "2026-10-17T07:30:00Z",
        "source": "renpho_es26bb",
        "weight_kg": 83.17,
        "bmi": 26.25,
        "body_fat_pct": 23.53,
        "muscle_mass_kg": 60.13,
        "visceral_fat": 10.5,
        "subcutaneous_fat_pct": 20.24,
        "water_pct": 56.06,
        "bone_mass_kg": 3.18,
        "bmr_kcal": 1721,
        "protein_pct": 17.16,
        "metabolic_age": 33,
        "fat_free_weight_kg": 63.6,
        "sinew_mass_kg": 56.52
      },
      {
        "id": 12,
        "date": "2026-10-16",
        "timestamp": "2026-10-16T07:30:00Z",
        "source": "renpho_es26bb",
        "weight_kg": 83.11,
        "bmi": 26.23,
        "body_fat_pct": 23.6,
        "muscle_mass_kg": 60.09,
        "visceral_fat": 10.5,
        "subcutaneous_fat_pct": 20.3,
        "water_pct": 56.06,
        "bone_mass_kg": 3.18,
        "bmr_kcal": 1723,
        "protein_pct": 17.13,
        "metabolic_age": 33,
        "fat_free_weight_kg": 63.5,
        "sinew_mass_kg": 56.48
      },
      {
        "id": 11,
        "date": "2026-10-15",
        "timestamp": "2026-10-15T07:30:00Z",
        "source": "renpho_es26bb",
        "weight_kg": 83.05,
        "bmi": 26.21,
        "body_fat_pct": 23.67,
        "muscle_mass_kg": 60.15,
        "visceral_fat": 10.5,
        "subcutaneous_fat_pct": 20.36,
        "water_pct": 56.06,
        "bone_mass_kg": 3.18,
        "bmr_kcal": 1725,
        "protein_pct": 17.1,
        "metabolic_age": 33,
        "fat_free_weight_kg": 63.39,
        "sinew_mass_kg": 56.54
      },
      {
        "id": 10,
        "date": "2026-10-14",
        "timestamp": "2026-10-14T07:30:00Z",
        "source": "renpho_es26bb",
        "weight_kg": 83.59,
        "bmi": 26.38,
        "body_fat_pct": 23.86,
        "muscle_mass_kg": 60.11,
        "visceral_fat": 10.5,
        "subcutaneous_fat_pct": 20.52,
        "water_pct": 55.82,
        "bone_mass_kg": 3.18,
        "bmr_kcal": 1727,
        "protein_pct": 17.07,
        "metabolic_age": 33,
        "fat_free_weight_kg": 63.65,
        "sinew_mass_kg": 56.5
      },
      {
        "id": 9,
        "date": "2026-10-13",
        "timestamp": "2026-10-13T07:30:00Z",
        "source": "renpho_es26bb",
        "weight_kg": 83.53,
        "bmi": 26.36,
        "body_fat_pct": 23.93,
        "muscle_mass_kg": 60.17,
        "visceral_fat": 10.5,
        "subcutaneous_fat_pct": 20.58,
        "water_pct": 55.82,
        "bone_mass_kg": 3.18,
        "bmr_kcal": 1729,
        "protein_pct": 17.04,
        "metabolic_age": 33,
        "fat_free_weight_kg": 63.54,
        "sinew_mass_kg": 56.56
      },
      {
        "id": 8,
        "date": "2026-10-12",
        "timestamp": "2026-10-12T07:30:00Z",
        "source": "renpho_es26bb",
        "weight_kg": 83.47,
        "bmi": 26.34,
        "body_fat_pct": 24.0,
        "muscle_mass_kg": 60.13,
        "visceral_fat": 10.5,
        "subcutaneous_fat_pct": 20.64,
        "water_pct": 55.82,
        "bone_mass_kg": 3.18,
        "bmr_kcal": 1731,
        "protein_pct": 17.01,
        "metabolic_age": 34,
        "fat_free_weight_kg": 63.44,
        "sinew_mass_kg": 56.52
      },
      {
        "id": 7,
        "date": "2026-10-11",
        "timestamp": "2026-10-11T07:30:00Z",
        "source": "renpho_es26bb",
        "weight_kg": 84.01,
        "bmi": 26.51,
        "body_fat_pct": 24.19,
        "muscle_mass_kg": 60.19,
        "visceral_fat": 11.0,
        "subcutaneous_fat_pct": 20.8,
        "water_pct": 55.58,
        "bone_mass_kg": 3.18,
        "bmr_kcal": 1733,
        "protein_pct": 16.98,
        "metabolic_age": 34,
        "fat_free_weight_kg": 63.69,
        "sinew_mass_kg": 56.58
      },
      {
        "id": 6,
        "date": "2026-10-10",
        "timestamp": "2026-10-10T07:30:00Z",
        "source": "renpho_es26bb",
        "weight_kg": 83.95,
        "bmi": 26.5,
        "body_fat_pct": 24.26,
        "muscle_mass_kg": 60.15,
        "visceral_fat": 11.0,
        "subcutaneous_fat_pct": 20.86,
        "water_pct": 55.58,
        "bone_mass_kg": 3.18,
        "bmr_kcal": 1735,
        "protein_pct": 16.95,
        "metabolic_age": 34,
        "fat_free_weight_kg": 63.58,
        "sinew_mass_kg": 56.54
      },
      {
        "id": 5,
        "date": "2026-10-09",
        "timestamp": "2026-10-09T07:30:00Z",
        "source": "renpho_es26bb",
        "weight_kg": 83.89,
        "bmi": 26.48,
        "body_fat_pct": 24.33,
        "muscle_mass_kg": 60.21,
        "visceral_fat": 11.0,
        "subcutaneous_fat_pct": 20.92,
        "water_pct": 55.58,
        "bone_mass_kg": 3.18,
        "bmr_kcal": 1737,
        "protein_pct": 16.92,
        "metabolic_age": 34,
        "fat_free_weight_kg": 63.48,
        "sinew_mass_kg": 56.6
      },
      {
        "id": 4,
        "date": "2026-10-08",
        "timestamp": "2026-10-08T07:30:00Z",
        "source": "renpho_es26bb",
        "weight_kg": 84.43,
        "bmi": 26.65,
        "body_fat_pct": 24.52,
        "muscle_mass_kg": 60.17,
        "visceral_fat": 11.0,
        "subcutaneous_fat_pct": 21.09,
        "water_pct": 55.34,
        "bone_mass_kg": 3.18,
        "bmr_kcal": 1739,
        "protein_pct": 16.89,
        "metabolic_age": 34,
        "fat_free_weight_kg": 63.73,
        "sinew_mass_kg": 56.56
      },
      {
        "id": 3,
        "date": "2026-10-07",
        "timestamp": "2026-10-07T07:30:00Z",
        "source": "renpho_es26bb",
        "weight_kg": 84.37,
        "bmi": 26.63,
        "body_fat_pct": 24.59,
        "muscle_mass_kg": 60.23,
        "visceral_fat": 11.0,
        "subcutaneous_fat_pct": 21.15,
        "water_pct": 55.34,
        "bone_mass_kg": 3.18,
        "bmr_kcal": 1741,
        "protein_pct": 16.86,
        "metabolic_age": 34,
        "fat_free_weight_kg": 63.62,
        "sinew_mass_kg": 56.62
      },
      {
        "id": 2,
        "date": "2026-10-06",
        "timestamp": "2026-10-06T07:30:00Z",
        "source": "renpho_es26bb",
        "weight_kg": 84.31,
        "bmi": 26.61,
        "body_fat_pct": 24.66,
        "muscle_mass_kg": 60.19,
        "visceral_fat": 11.0,
        "subcutaneous_fat_pct": 21.21,
        "water_pct": 55.34,
        "bone_mass_kg": 3.18,
        "bmr_kcal": 1743,
        "protein_pct": 16.83,
        "metabolic_age": 34,
        "fat_free_weight_kg": 63.52,
        "sinew_mass_kg": 56.58
      },
      {
        "id": 1,
        "date": "2026-10-05",
        "timestamp": "2026-10-05T07:30:00Z",
        "source": "renpho_es26bb",
        "weight_kg": 84.85,
        "bmi": 26.78,
        "body_fat_pct": 24.85,
        "muscle_mass_kg": 60.25,
        "visceral_fat": 11.0,
        "subcutaneous_fat_pct": 21.37,
        "water_pct": 55.1,
        "bone_mass_kg": 3.18,
        "bmr_kcal": 1745,
        "protein_pct": 16.8,
        "metabolic_age": 34,
        "fat_free_weight_kg": 63.76,
        "sinew_mass_kg": 56.63
      }
    ],
    "total": 14
  },
  "/api/analytics/insights": {
    "window_status": "active",
    "recovery_score": 83.0,
    "recovery_status": "nominal",
    "composition_quality": {
      "status": "nominal",
      "headline": "Sağlıklı Yağ Kaybı ve Kas Korunumu",
      "total_weight_delta_kg": -2.22,
      "fat_mass_delta_kg": -1.8,
      "muscle_mass_delta_kg": -0.18,
      "water_pct_delta": 1.2,
      "fat_loss_share_pct": 81.1,
      "muscle_loss_share_pct": 8.1,
      "interpretation": "Döngü başından beri toplam -2.22 kg değişimin %81.1 kadarı yağ kütlesinden gerçekleşti. Kas kütlesi değişimi (-0.18 kg) güvenli fizyolojik sınırlar içindedir."
    },
    "correlations": [
      {
        "id": "sleep-vs-weight-delta",
        "pair": "Uyku Süresi (Garmin/Watch6) ↔ Ertesi Gün Tartı Değişimi (Renpho)",
        "r_value": 1.0,
        "strength": "Dengeli",
        "interpretation": "Uyku süresi 7 saatin altına düştüğünde ertesi sabah tartıda ödem kaynaklı geçici artış eğilimi gözlenmektedir."
      },
      {
        "id": "stress-vs-hrv",
        "pair": "Günlük Stres Skoru (Garmin) ↔ HRV Otonom Değişkenlik (Watch6/Garmin)",
        "r_value": -0.98,
        "strength": "Güçlü Negatif",
        "interpretation": "Stres skoru yükseldiğinde HRV (RMSSD) düşmekte ve otonom sinir sistemi toparlanması yavaşlamaktadır."
      },
      {
        "id": "steps-vs-bodyfat",
        "pair": "Günlük Adım & Aktif Kalori (Watch6) ↔ Vücut Yağ Oranı (Renpho ES-26BB-B)",
        "r_value": -0.89,
        "strength": "Güçlü Negatif",
        "interpretation": "8.500+ adım barajının korunduğu günlerde yağ oranı ve iç organ yağı (visceral fat) düzenli düşüş göstermektedir."
      },
      {
        "id": "rhr-vs-sleep",
        "pair": "Dinlenik Nabız RHR (Watch6) ↔ Toplam Uyku Kalitesi",
        "r_value": -0.78,
        "strength": "Orta Negatif",
        "interpretation": "Kaliteli ve derin uyku evresinin yüksek olduğu gecelerde sabah dinlenik nabzı daha düşük ölçülmektedir."
      }
    ],
    "anomalies": [
      {
        "id": "nominal-state-2026-10-18",
        "date": "2026-10-18",
        "severity": "nominal",
        "metric": "Toparlanma 83.0/100",
        "source": "all_devices",
        "title": "Tüm Biyometrik Göstergeler Nominal Aralıkta",
        "detail": "Renpho ES-26BB-B, Galaxy Watch6 ve Garmin Smart Band metriklerinde kritik sapma tespit edilmedi."
      }
    ],
    "rolling_series": [
      {
        "date": "2026-10-05",
        "weight_kg": 84.85,
        "rolling_7d_weight_kg": 84.85,
        "body_fat_pct": 24.85,
        "muscle_mass_kg": 60.25,
        "recovery_score": 71.4,
        "rolling_7d_recovery": 71.4,
        "sleep_hours": 6.55,
        "hrv_ms": 42.0,
        "resting_hr_bpm": 62.5,
        "steps": 8200
      },
      {
        "date": "2026-10-06",
        "weight_kg": 84.31,
        "rolling_7d_weight_kg": 84.58,
        "body_fat_pct": 24.66,
        "muscle_mass_kg": 60.19,
        "recovery_score": 76.8,
        "rolling_7d_recovery": 74.1,
        "sleep_hours": 7.45,
        "hrv_ms": 46.6,
        "resting_hr_bpm": 60.9,
        "steps": 7540
      },
      {
        "date": "2026-10-07",
        "weight_kg": 84.37,
        "rolling_7d_weight_kg": 84.51,
        "body_fat_pct": 24.59,
        "muscle_mass_kg": 60.23,
        "recovery_score": 77.3,
        "rolling_7d_recovery": 75.2,
        "sleep_hours": 7.45,
        "hrv_ms": 47.2,
        "resting_hr_bpm": 60.7,
        "steps": 8680
      },
      {
        "date": "2026-10-08",
        "weight_kg": 84.43,
        "rolling_7d_weight_kg": 84.49,
        "body_fat_pct": 24.52,
        "muscle_mass_kg": 60.17,
        "recovery_score": 73.0,
        "rolling_7d_recovery": 74.6,
        "sleep_hours": 6.55,
        "hrv_ms": 43.8,
        "resting_hr_bpm": 62.0,
        "steps": 8020
      },
      {
        "date": "2026-10-09",
        "weight_kg": 83.89,
        "rolling_7d_weight_kg": 84.37,
        "body_fat_pct": 24.33,
        "muscle_mass_kg": 60.21,
        "recovery_score": 78.3,
        "rolling_7d_recovery": 75.4,
        "sleep_hours": 7.45,
        "hrv_ms": 48.4,
        "resting_hr_bpm": 60.4,
        "steps": 9160
      },
      {
        "date": "2026-10-10",
        "weight_kg": 83.95,
        "rolling_7d_weight_kg": 84.3,
        "body_fat_pct": 24.26,
        "muscle_mass_kg": 60.15,
        "recovery_score": 78.9,
        "rolling_7d_recovery": 76.0,
        "sleep_hours": 7.45,
        "hrv_ms": 49.0,
        "resting_hr_bpm": 60.2,
        "steps": 8500
      },
      {
        "date": "2026-10-11",
        "weight_kg": 84.01,
        "rolling_7d_weight_kg": 84.26,
        "body_fat_pct": 24.19,
        "muscle_mass_kg": 60.19,
        "recovery_score": 74.5,
        "rolling_7d_recovery": 75.7,
        "sleep_hours": 6.55,
        "hrv_ms": 45.6,
        "resting_hr_bpm": 61.6,
        "steps": 9640
      },
      {
        "date": "2026-10-12",
        "weight_kg": 83.47,
        "rolling_7d_weight_kg": 84.06,
        "body_fat_pct": 24.0,
        "muscle_mass_kg": 60.13,
        "recovery_score": 79.8,
        "rolling_7d_recovery": 76.9,
        "sleep_hours": 7.45,
        "hrv_ms": 50.2,
        "resting_hr_bpm": 60.0,
        "steps": 8980
      },
      {
        "date": "2026-10-13",
        "weight_kg": 83.53,
        "rolling_7d_weight_kg": 83.95,
        "body_fat_pct": 23.93,
        "muscle_mass_kg": 60.17,
        "recovery_score": 80.4,
        "rolling_7d_recovery": 77.5,
        "sleep_hours": 7.45,
        "hrv_ms": 50.8,
        "resting_hr_bpm": 59.8,
        "steps": 10120
      },
      {
        "date": "2026-10-14",
        "weight_kg": 83.59,
        "rolling_7d_weight_kg": 83.84,
        "body_fat_pct": 23.86,
        "muscle_mass_kg": 60.11,
        "recovery_score": 76.1,
        "rolling_7d_recovery": 77.3,
        "sleep_hours": 6.55,
        "hrv_ms": 47.4,
        "resting_hr_bpm": 61.1,
        "steps": 9460
      },
      {
        "date": "2026-10-15",
        "weight_kg": 83.05,
        "rolling_7d_weight_kg": 83.64,
        "body_fat_pct": 23.67,
        "muscle_mass_kg": 60.15,
        "recovery_score": 81.4,
        "rolling_7d_recovery": 78.5,
        "sleep_hours": 7.45,
        "hrv_ms": 52.0,
        "resting_hr_bpm": 59.5,
        "steps": 10600
      },
      {
        "date": "2026-10-16",
        "weight_kg": 83.11,
        "rolling_7d_weight_kg": 83.53,
        "body_fat_pct": 23.6,
        "muscle_mass_kg": 60.09,
        "recovery_score": 81.9,
        "rolling_7d_recovery": 79.0,
        "sleep_hours": 7.45,
        "hrv_ms": 52.6,
        "resting_hr_bpm": 59.4,
        "steps": 9940
      },
      {
        "date": "2026-10-17",
        "weight_kg": 83.17,
        "rolling_7d_weight_kg": 83.42,
        "body_fat_pct": 23.53,
        "muscle_mass_kg": 60.13,
        "recovery_score": 77.6,
        "rolling_7d_recovery": 78.8,
        "sleep_hours": 6.55,
        "hrv_ms": 49.2,
        "resting_hr_bpm": 60.7,
        "steps": 11080
      },
      {
        "date": "2026-10-18",
        "weight_kg": 82.63,
        "rolling_7d_weight_kg": 83.22,
        "body_fat_pct": 23.34,
        "muscle_mass_kg": 60.07,
        "recovery_score": 83.0,
        "rolling_7d_recovery": 80.0,
        "sleep_hours": 7.45,
        "hrv_ms": 53.8,
        "resting_hr_bpm": 59.0,
        "steps": 10420
      }
    ]
  },
  "/api/wearables/comparison": {
    "agreement_score": 94.7,
    "summary": {
      "compared_days": 14,
      "avg_steps_diff_pct": 3.0,
      "avg_sleep_diff_hours": 0.15,
      "avg_rhr_diff_bpm": 0.8
    },
    "rows": [
      {
        "date": "2026-10-18",
        "watch6_steps": 10420,
        "garmin_steps": 10107,
        "steps_diff_pct": 3.0,
        "watch6_sleep_hours": 7.3,
        "garmin_sleep_hours": 7.45,
        "sleep_diff_hours": 0.15,
        "watch6_rhr_bpm": 59.0,
        "garmin_rhr_bpm": 58.2,
        "rhr_diff_bpm": 0.8,
        "watch6_hrv_ms": 53.8,
        "garmin_hrv_ms": 55.6,
        "garmin_body_battery": 96,
        "garmin_stress": 30.9,
        "watch6_spo2_pct": 97.2,
        "garmin_spo2_pct": 96.8,
        "agreement_pct": 94.7
      },
      {
        "date": "2026-10-17",
        "watch6_steps": 11080,
        "garmin_steps": 10747,
        "steps_diff_pct": 3.0,
        "watch6_sleep_hours": 6.4,
        "garmin_sleep_hours": 6.55,
        "sleep_diff_hours": 0.15,
        "watch6_rhr_bpm": 60.7,
        "garmin_rhr_bpm": 59.9,
        "rhr_diff_bpm": 0.8,
        "watch6_hrv_ms": 49.2,
        "garmin_hrv_ms": 51.0,
        "garmin_body_battery": 94,
        "garmin_stress": 38.6,
        "watch6_spo2_pct": 97.2,
        "garmin_spo2_pct": 96.8,
        "agreement_pct": 94.7
      },
      {
        "date": "2026-10-16",
        "watch6_steps": 9940,
        "garmin_steps": 9641,
        "steps_diff_pct": 3.0,
        "watch6_sleep_hours": 7.3,
        "garmin_sleep_hours": 7.45,
        "sleep_diff_hours": 0.15,
        "watch6_rhr_bpm": 59.4,
        "garmin_rhr_bpm": 58.6,
        "rhr_diff_bpm": 0.8,
        "watch6_hrv_ms": 52.6,
        "garmin_hrv_ms": 54.4,
        "garmin_body_battery": 96,
        "garmin_stress": 32.3,
        "watch6_spo2_pct": 97.2,
        "garmin_spo2_pct": 96.8,
        "agreement_pct": 94.7
      },
      {
        "date": "2026-10-15",
        "watch6_steps": 10600,
        "garmin_steps": 10282,
        "steps_diff_pct": 3.0,
        "watch6_sleep_hours": 7.3,
        "garmin_sleep_hours": 7.45,
        "sleep_diff_hours": 0.15,
        "watch6_rhr_bpm": 59.5,
        "garmin_rhr_bpm": 58.7,
        "rhr_diff_bpm": 0.8,
        "watch6_hrv_ms": 52.0,
        "garmin_hrv_ms": 53.8,
        "garmin_body_battery": 96,
        "garmin_stress": 33.0,
        "watch6_spo2_pct": 97.2,
        "garmin_spo2_pct": 96.8,
        "agreement_pct": 94.7
      },
      {
        "date": "2026-10-14",
        "watch6_steps": 9460,
        "garmin_steps": 9176,
        "steps_diff_pct": 3.0,
        "watch6_sleep_hours": 6.4,
        "garmin_sleep_hours": 6.55,
        "sleep_diff_hours": 0.15,
        "watch6_rhr_bpm": 61.1,
        "garmin_rhr_bpm": 60.3,
        "rhr_diff_bpm": 0.8,
        "watch6_hrv_ms": 47.4,
        "garmin_hrv_ms": 49.2,
        "garmin_body_battery": 94,
        "garmin_stress": 40.7,
        "watch6_spo2_pct": 97.2,
        "garmin_spo2_pct": 96.8,
        "agreement_pct": 94.7
      },
      {
        "date": "2026-10-13",
        "watch6_steps": 10120,
        "garmin_steps": 9816,
        "steps_diff_pct": 3.0,
        "watch6_sleep_hours": 7.3,
        "garmin_sleep_hours": 7.45,
        "sleep_diff_hours": 0.15,
        "watch6_rhr_bpm": 59.8,
        "garmin_rhr_bpm": 59.0,
        "rhr_diff_bpm": 0.8,
        "watch6_hrv_ms": 50.8,
        "garmin_hrv_ms": 52.6,
        "garmin_body_battery": 96,
        "garmin_stress": 34.4,
        "watch6_spo2_pct": 97.2,
        "garmin_spo2_pct": 96.8,
        "agreement_pct": 94.7
      },
      {
        "date": "2026-10-12",
        "watch6_steps": 8980,
        "garmin_steps": 8710,
        "steps_diff_pct": 3.0,
        "watch6_sleep_hours": 7.3,
        "garmin_sleep_hours": 7.45,
        "sleep_diff_hours": 0.15,
        "watch6_rhr_bpm": 60.0,
        "garmin_rhr_bpm": 59.2,
        "rhr_diff_bpm": 0.8,
        "watch6_hrv_ms": 50.2,
        "garmin_hrv_ms": 52.0,
        "garmin_body_battery": 96,
        "garmin_stress": 35.1,
        "watch6_spo2_pct": 97.2,
        "garmin_spo2_pct": 96.8,
        "agreement_pct": 94.7
      },
      {
        "date": "2026-10-11",
        "watch6_steps": 9640,
        "garmin_steps": 9350,
        "steps_diff_pct": 3.0,
        "watch6_sleep_hours": 6.4,
        "garmin_sleep_hours": 6.55,
        "sleep_diff_hours": 0.15,
        "watch6_rhr_bpm": 61.6,
        "garmin_rhr_bpm": 60.8,
        "rhr_diff_bpm": 0.8,
        "watch6_hrv_ms": 45.6,
        "garmin_hrv_ms": 47.4,
        "garmin_body_battery": 94,
        "garmin_stress": 42.8,
        "watch6_spo2_pct": 97.2,
        "garmin_spo2_pct": 96.8,
        "agreement_pct": 94.7
      },
      {
        "date": "2026-10-10",
        "watch6_steps": 8500,
        "garmin_steps": 8245,
        "steps_diff_pct": 3.0,
        "watch6_sleep_hours": 7.3,
        "garmin_sleep_hours": 7.45,
        "sleep_diff_hours": 0.15,
        "watch6_rhr_bpm": 60.2,
        "garmin_rhr_bpm": 59.4,
        "rhr_diff_bpm": 0.8,
        "watch6_hrv_ms": 49.0,
        "garmin_hrv_ms": 50.8,
        "garmin_body_battery": 96,
        "garmin_stress": 36.5,
        "watch6_spo2_pct": 97.2,
        "garmin_spo2_pct": 96.8,
        "agreement_pct": 94.7
      },
      {
        "date": "2026-10-09",
        "watch6_steps": 9160,
        "garmin_steps": 8885,
        "steps_diff_pct": 3.0,
        "watch6_sleep_hours": 7.3,
        "garmin_sleep_hours": 7.45,
        "sleep_diff_hours": 0.15,
        "watch6_rhr_bpm": 60.4,
        "garmin_rhr_bpm": 59.6,
        "rhr_diff_bpm": 0.8,
        "watch6_hrv_ms": 48.4,
        "garmin_hrv_ms": 50.2,
        "garmin_body_battery": 96,
        "garmin_stress": 37.2,
        "watch6_spo2_pct": 97.2,
        "garmin_spo2_pct": 96.8,
        "agreement_pct": 94.7
      },
      {
        "date": "2026-10-08",
        "watch6_steps": 8020,
        "garmin_steps": 7779,
        "steps_diff_pct": 3.0,
        "watch6_sleep_hours": 6.4,
        "garmin_sleep_hours": 6.55,
        "sleep_diff_hours": 0.15,
        "watch6_rhr_bpm": 62.0,
        "garmin_rhr_bpm": 61.2,
        "rhr_diff_bpm": 0.8,
        "watch6_hrv_ms": 43.8,
        "garmin_hrv_ms": 45.6,
        "garmin_body_battery": 94,
        "garmin_stress": 44.9,
        "watch6_spo2_pct": 97.2,
        "garmin_spo2_pct": 96.8,
        "agreement_pct": 94.7
      },
      {
        "date": "2026-10-07",
        "watch6_steps": 8680,
        "garmin_steps": 8419,
        "steps_diff_pct": 3.0,
        "watch6_sleep_hours": 7.3,
        "garmin_sleep_hours": 7.45,
        "sleep_diff_hours": 0.15,
        "watch6_rhr_bpm": 60.7,
        "garmin_rhr_bpm": 59.9,
        "rhr_diff_bpm": 0.8,
        "watch6_hrv_ms": 47.2,
        "garmin_hrv_ms": 49.0,
        "garmin_body_battery": 96,
        "garmin_stress": 38.6,
        "watch6_spo2_pct": 97.2,
        "garmin_spo2_pct": 96.8,
        "agreement_pct": 94.7
      },
      {
        "date": "2026-10-06",
        "watch6_steps": 7540,
        "garmin_steps": 7313,
        "steps_diff_pct": 3.0,
        "watch6_sleep_hours": 7.3,
        "garmin_sleep_hours": 7.45,
        "sleep_diff_hours": 0.15,
        "watch6_rhr_bpm": 60.9,
        "garmin_rhr_bpm": 60.1,
        "rhr_diff_bpm": 0.8,
        "watch6_hrv_ms": 46.6,
        "garmin_hrv_ms": 48.4,
        "garmin_body_battery": 96,
        "garmin_stress": 39.3,
        "watch6_spo2_pct": 97.2,
        "garmin_spo2_pct": 96.8,
        "agreement_pct": 94.7
      },
      {
        "date": "2026-10-05",
        "watch6_steps": 8200,
        "garmin_steps": 7954,
        "steps_diff_pct": 3.0,
        "watch6_sleep_hours": 6.4,
        "garmin_sleep_hours": 6.55,
        "sleep_diff_hours": 0.15,
        "watch6_rhr_bpm": 62.5,
        "garmin_rhr_bpm": 61.7,
        "rhr_diff_bpm": 0.8,
        "watch6_hrv_ms": 42.0,
        "garmin_hrv_ms": 43.8,
        "garmin_body_battery": 94,
        "garmin_stress": 47.0,
        "watch6_spo2_pct": 97.2,
        "garmin_spo2_pct": 96.8,
        "agreement_pct": 94.7
      }
    ]
  },
  "/api/reconciliation/rules": {
    "weight_priority": [
      "renpho_es26bb",
      "galaxy_watch6",
      "garmin_band"
    ],
    "sleep_priority": [
      "garmin_band",
      "galaxy_watch6"
    ],
    "activity_priority": [
      "galaxy_watch6",
      "garmin_band"
    ],
    "heart_priority": [
      "galaxy_watch6",
      "garmin_band"
    ],
    "merge_strategy": "priority",
    "cycle_start_date": "2026-10-05",
    "target_weight_kg": 78.0,
    "height_cm": 178.0
  },
  "/api/ai/prompts": {
    "prompt_text": "# Çoklu Cihaz Biyometrik ve Metabolik Değerlendirme İsteği\n\nAşağıda **Renpho ES-26BB-B** akıllı tartı, **Samsung Galaxy Watch6** ve **Garmin Smart Band** cihazlarımdan otomatik toplanıp öncelik kurallarıyla birleştirilmiş güncel sağlık verilerim yer almaktadır.\n\n## 1. Takip Döngüsü ve Hedef Parametreler\n- Döngü Başlangıç Tarihi: 2026-10-05\n- Boy: 178.0 cm | Hedef Kilo: 78.0 kg\n- Güncel Toparlanma Skoru: 83.0/100 (nominal)\n- Kilo Değişim Kalitesi: Sağlıklı Yağ Kaybı ve Kas Korunumu (Toplam: -2.22 kg, Yağ: -1.8 kg, Kas: -0.18 kg, Su: 1.2 puan)\n\n## 2. Son Renpho ES-26BB-B Tartı Ölçümleri (13 Metrik Özeti)\n- 2026-10-18: Kilo=82.63 kg | BMI=26.08 | Yağ=%23.34 | Kas=60.07 kg | Su=%56.3 | İç Organ Yağı=10.5 | BMR=1719 kcal\n- 2026-10-17: Kilo=83.17 kg | BMI=26.25 | Yağ=%23.53 | Kas=60.13 kg | Su=%56.06 | İç Organ Yağı=10.5 | BMR=1721 kcal\n- 2026-10-16: Kilo=83.11 kg | BMI=26.23 | Yağ=%23.6 | Kas=60.09 kg | Su=%56.06 | İç Organ Yağı=10.5 | BMR=1723 kcal\n- 2026-10-15: Kilo=83.05 kg | BMI=26.21 | Yağ=%23.67 | Kas=60.15 kg | Su=%56.06 | İç Organ Yağı=10.5 | BMR=1725 kcal\n- 2026-10-14: Kilo=83.59 kg | BMI=26.38 | Yağ=%23.86 | Kas=60.11 kg | Su=%55.82 | İç Organ Yağı=10.5 | BMR=1727 kcal\n- 2026-10-13: Kilo=83.53 kg | BMI=26.36 | Yağ=%23.93 | Kas=60.17 kg | Su=%55.82 | İç Organ Yağı=10.5 | BMR=1729 kcal\n- 2026-10-12: Kilo=83.47 kg | BMI=26.34 | Yağ=%24.0 | Kas=60.13 kg | Su=%55.82 | İç Organ Yağı=10.5 | BMR=1731 kcal\n\n## 3. Galaxy Watch6 vs. Garmin Smart Band Cihaz Uyum Özeti\n- Cihazlar Arası Genel Uyum Skoru: %94.7\n- Ortalama Adım Farkı: %3.0 | Ortalama Uyku Farkı: 0.15 saat | Ortalama RHR Farkı: 0.8 bpm\n\n## 4. Çapraz Cihaz Korelasyon Bulguları (Pearson r)\n- Uyku Süresi (Garmin/Watch6) ↔ Ertesi Gün Tartı Değişimi (Renpho): r=1.0 (Dengeli) -> Uyku süresi 7 saatin altına düştüğünde ertesi sabah tartıda ödem kaynaklı geçici artış eğilimi gözlenmektedir.\n- Günlük Stres Skoru (Garmin) ↔ HRV Otonom Değişkenlik (Watch6/Garmin): r=-0.98 (Güçlü Negatif) -> Stres skoru yükseldiğinde HRV (RMSSD) düşmekte ve otonom sinir sistemi toparlanması yavaşlamaktadır.\n- Günlük Adım & Aktif Kalori (Watch6) ↔ Vücut Yağ Oranı (Renpho ES-26BB-B): r=-0.89 (Güçlü Negatif) -> 8.500+ adım barajının korunduğu günlerde yağ oranı ve iç organ yağı (visceral fat) düzenli düşüş göstermektedir.\n- Dinlenik Nabız RHR (Watch6) ↔ Toplam Uyku Kalitesi: r=-0.78 (Orta Negatif) -> Kaliteli ve derin uyku evresinin yüksek olduğu gecelerde sabah dinlenik nabzı daha düşük ölçülmektedir.\n\n## 5. Tespit Edilen Biyometrik Anomaliler\n- [NOMINAL] Tüm Biyometrik Göstergeler Nominal Aralıkta (Toparlanma 83.0/100): Renpho ES-26BB-B, Galaxy Watch6 ve Garmin Smart Band metriklerinde kritik sapma tespit edilmedi.\n\n## Beklenen Analiz\n1. Yağ kaybı hızımı ve kas kütlesi korunumumu değerlendir.\n2. Garmin uyku/stres/Body Battery ve Galaxy Watch6 HRV/nabız verilerime göre toparlanma kalitemi yorumla.\n3. Önümüzdeki 7 gün için beslenme, hidrasyon, uyku ve antrenman yoğunluğu önerilerini maddeler halinde sun.",
    "generated_at": "2026-10-18T11:48:39.949686+00:00",
    "data_days_count": 14,
    "webhook_url_hint": "/api/ingest/webhook"
  },
  "/api/ai/reports": {
    "items": [
      {
        "id": 1,
        "created_at": "2026-10-18T09:50:00Z",
        "focus_area": "holistic",
        "source_mode": "deterministic_clinical_engine",
        "summary_markdown": "## Bütüncül Çoklu Cihaz Sağlık ve Metabolizma Sentezi\n\n### 1. Vücut Kompozisyonu (Renpho ES-26BB-B)\n- **Durum:** Sağlıklı Yağ Kaybı ve Kas Korunumu\n- **Net Değişim:** Toplam `-2.22 kg` değişimin `%81.1` kadarı yağ dokusundan (`-1.8 kg`), `%8.1` kadarı kas dokusundan (`-0.18 kg`) gerçekleşmiştir.\n- **Yorum:** Döngü başından beri toplam -2.22 kg değişimin %81.1 kadarı yağ kütlesinden gerçekleşti. Kas kütlesi değişimi (-0.18 kg) güvenli fizyolojik sınırlar içindedir.\n\n### 2. Kardiyovasküler ve Otonom Toparlanma (Galaxy Watch6 + Garmin Smart Band)\n- **Bileşik Toparlanma Skoru:** `83.0/100` (`nominal`)\n- **Sensör Uyum Skoru:** Watch6 ve Garmin arasında `%94.7` ölçüm tutarlılığı mevcuttur.\n- **Korelasyon Özeti:** Uyku süresi 7 saatin üzerinde tutulduğunda HRV artmakta ve ertesi sabah tartıda ödem dalgalanması azalmaktadır.\n\n### 3. Eylem Planı (Önümüzdeki 7 Gün)\n1. **Protein ve Hidrasyon:** Kas korunumu için kilogram başına 1.6g protein ve günlük 2.5L su hedefini koruyun.\n2. **Uyku Penceresi:** Garmin Body Battery şarjını 85+ seviyesinde tutmak için 7.2 saat uyku hedefleyin.\n3. **Aktivite:** Galaxy Watch6 üzerinde günlük 8.500+ adım ve haftada 3 gün direnç egzersizi uygulayın."
      }
    ]
  }
};

async function setupDeterministicApiMocks(page: Page) {
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const url = new URL(route.request().url());
    const payload = MOCK_API_RESPONSES[url.pathname] || { status: 'ok', message: 'İşlem tamamlandı.' };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(payload),
    });
  });
}

const TABS = ['dashboard', 'scale', 'insights', 'wearables', 'ai', 'gallery'] as const;
const THEMES = ['dark', 'light'] as const;

test.describe('HealthSync Section 4 Visual, Accessibility & Offline Verification Suite', () => {
  for (const theme of THEMES) {
    for (const tab of TABS) {
      test(`Screen [${tab}] default state in [${theme}] theme passes axe-core and visual regression`, async ({ page }) => {
        const externalRequests: string[] = [];
        const pageErrors: string[] = [];
        page.on('request', (req) => {
          const u = new URL(req.url());
          if (u.protocol.startsWith('http') && u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') {
            externalRequests.push(req.url());
          }
        });
        page.on('pageerror', (err) => {
          pageErrors.push(err.message);
        });

        await setupDeterministicApiMocks(page);
        await page.goto(`/?tab=${tab}&theme=${theme}&state=default`);
        await expect(page.locator('.hs-shell')).toBeVisible();
        if (tab !== 'gallery') {
          await expect(page.locator('[data-testid="state-loading"]')).toHaveCount(0);
        }

        expect(pageErrors).toEqual([]);
        expect(externalRequests).toEqual([]);

        const axeResults = await new AxeBuilder({ page })
          .withTags(['wcag2a', 'wcag2aa'])
          .analyze();
        expect(axeResults.violations).toEqual([]);

        await expect(page).toHaveScreenshot(`${tab}-default-${theme}.png`, {
          fullPage: true,
        });
      });
    }

    test(`Empty and Error states render deterministically in [${theme}] theme`, async ({ page }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (err) => {
        pageErrors.push(err.message);
      });
      await setupDeterministicApiMocks(page);

      await page.goto(`/?tab=dashboard&theme=${theme}&state=empty`);
      await expect(page.locator('.hs-shell')).toBeVisible();
      await expect(page.locator('[data-testid="state-loading"]')).toHaveCount(0);
      expect(pageErrors).toEqual([]);
      await expect(page).toHaveScreenshot(`dashboard-empty-${theme}.png`, { fullPage: true });

      await page.goto(`/?tab=dashboard&theme=${theme}&state=error`);
      await expect(page.locator('[data-testid="state-error"]')).toBeVisible();
      expect(pageErrors).toEqual([]);
      await expect(page).toHaveScreenshot(`dashboard-error-${theme}.png`, { fullPage: true });
    });
  }
});
