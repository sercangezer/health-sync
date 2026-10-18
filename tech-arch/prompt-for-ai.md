# HealthSync — Yapay Zekâ Ajanları İçin Sistem Yeniden İnşa ve Geliştirme Kılavuzu (`prompt-for-ai.md`)

Bu belge, başka bir yapay zekâ mühendislik ajanının **HealthSync** çoklu cihaz biyometrik veri toplama ve anlamlandırma platformunu sıfırdan aynı standartlarla yeniden inşa edebilmesi veya genişletebilmesi için gereken tüm mimari, sözleşme ve doğrulama kurallarını içerir.

---

## 1. Hedef Cihazlar ve Veri Toplama Kanalları

1. **Renpho Body Fat Scale ES-26BB-B**:
   - **Web Bluetooth (`BLE`)**: Tarayıcıdan doğrudan tartıya bağlanarak veya empedans/kilo paketini (`POST /api/ingest/ble-scale`) göndererek 13 BIA metriği üretir (`weight_kg`, `bmi`, `body_fat_pct`, `subcutaneous_fat_pct`, `visceral_fat_index`, `body_water_pct`, `skeletal_muscle_pct`, `muscle_mass_kg`, `bone_mass_kg`, `protein_pct`, `bmr_kcal`, `metabolic_age`, `fat_free_weight_kg`).
   - **Bulut Senkronizasyonu**: `renpho-sync-service` (`:8001`) üzerinden periyodik olarak bulut ölçümlerini çeker.
2. **Samsung Galaxy Watch6**:
   - **Health Connect Webhook**: Mobil otomasyon uygulamasından `POST /api/ingest/webhook` uç noktasına JSON olarak günlük adım, uyku, nabız, HRV ve SpO2 verilerini gönderir.
   - **Dosya & Klasör İçe Aktarımı**: `POST /api/ingest/import-file` ile SQLite `.db` veya `.csv` dosyalarını ayrıştırır; ayrıca `WATCH_EXPORT_DIR` klasörünü otomatik izler.
3. **Garmin Smart Band**:
   - **Garmin Connect Senkronizasyonu**: `garmin-sync-service` (`:8002`) üzerinden adım, dinlenik/min/maks nabız, uyku skoru ve evreleri, stres skoru, Body Battery, HRV ve SpO2 metriklerini otomatik senkronize eder.

---

## 2. Mikroservis Mimarisi ve Port Haritası

Tüm backend servisleri Python 3.12 + FastAPI + SQLAlchemy 2.0 ile yazılmıştır ve `services/` altında yer alır:
- `services/renpho_sync/app.py` (`:8001`)
- `services/garmin_sync/app.py` (`:8002`)
- `services/watch6_ingest/app.py` (`:8003`)
- `services/reconciliation/app.py` (`:8004`)
- `services/analytics_anomaly/app.py` (`:8005`)
- `services/ai_advisor/app.py` (`:8006`)
- `services/scheduler/app.py` (`:8007`)
- `services/api_gateway/app.py` (`:8000`, Host: `8996`)
- `frontend/` (Nginx `:80`, Host: `8997`)

Her mikroservis çağrısı `services/common/resilience.py` içindeki `CircuitBreaker` (`CLOSED -> OPEN -> HALF_OPEN -> CLOSED`) ile korunur.

---

## 3. Sözleşme Öncelikli (Contract-First) Geliştirme Kuralları

1. **Tek Doğruluk Kaynağı**: `api/openapi.yaml` dosyası tüm dış uç noktaların tek kaynağıdır.
2. **Kod Üretimi**: `python3 scripts/generate_client.py` (`make gen-api`) çalıştırıldığında:
   - `frontend/src/api/client.ts`
   - `tech-arch/api-envanteri.md`
   otomatik üretilir. Elle düzenlenmez.
3. **Sözleşme Kapısı**: `python3 scripts/contract_check.py` (`make contract-check`) 4 kapıyı ve Pre-Commit Parity Report tablosunu doğrular.

---

## 4. Ön Yüz (Frontend) Tasarım Sistemi ve Doğrulama Kapıları

- **Tasarım Jetonları (`frontend/src/styles/tokens.css`)**: Koyu (`:root`, `[data-theme="dark"]`) ve Açık (`[data-theme="light"]`) temalar için tüm renk, boşluk (`8px` tabanlı), tipografi (`IBM Plex Sans` ve `IBM Plex Mono`, yerel `.woff2`) ve sınır jetonlarını tanımlar.
- **Bileşenlerde Ham Değer Yasağı**: `frontend/src/ui/` ve `frontend/src/screens/` altında ham hex/rgb renk veya piksel değeri kullanılamaz (`npm run lint:css` / Stylelint ile denetlenir).
- **Tam Çevrimdışı (Zero External CDN) Çalışma**: Tüm fontlar `frontend/public/assets/fonts/` altındadır. `python3 scripts/check_external_assets.py` hem dış URL bulunmadığını hem de WCAG AA (`>= 4.5:1`) kontrast oranlarını doğrular.
- **Playwright Görsel ve Erişilebilirlik Testleri**: `frontend/tests/ui.spec.ts` tüm ekranları (`dashboard`, `scale`, `insights`, `wearables`, `ai`, `gallery`) her iki temada (`dark`, `light`) ve durumlarda (`default`, `empty`, `error`) `@axe-core/playwright` ve `toHaveScreenshot` ile test eder.

---

## 5. Komutlar (`Makefile`)

- `make gen-api`: OpenAPI sözleşmesinden TypeScript istemcisini ve API envanterini üretir.
- `make lint`: Backend ve frontend statik analizlerini (Ruff/Flake8, ESLint, Stylelint) çalıştırır.
- `make contract-check`: Bölüm 7 OpenAPI parite kapısını çalıştırır.
- `make ui-check`: Çevrimdışı varlık/kontrast denetimini ve Playwright testlerini çalıştırır.
- `make test`: Pytest mikroservis test süitini çalıştırır.
- `make check`: `lint`, `contract-check`, `ui-check` ve `test` hedeflerinin tamamını sırayla çalıştırır.
- `make deploy`: `./esitle.sh` aracılığıyla `linuxadmin@h-diyet` sunucusuna rsync ve Docker Compose dağıtımı yapar.
