# Değişiklik Günlüğü (Changelog)

## v1.0.0 — 2026-10-18

### Eklenenler
- **Çoklu Mikroservis Mimarisi (11 Konteyner)**: Hata izolasyonu (Bulkhead) ve devre kesici (Circuit Breaker) desenleriyle `api-gateway`, `renpho-sync-service`, `garmin-sync-service`, `watch6-ingest-service`, `reconciliation-service`, `analytics-anomaly-service`, `ai-advisor-service`, `scheduler-orchestrator`, `redis`, `db` (PostgreSQL) ve `frontend` servisleri oluşturuldu.
- **Renpho ES-26BB-B Tam Otomatik Senkronizasyon ve Web Bluetooth**: Renpho bulut API'sinden periyodik çekim ve tarayıcı Web Bluetooth API (`0xFFE0` / `0x181D`) üzerinden 13 vücut kompozisyonu metriğinin (kilo, BMI, yağ oranı, kas kütlesi, iç organ yağı, deri altı yağ, vücut suyu, kemik kütlesi, BMR, protein, metabolik yaş, yağsız ağırlık, tendon kütlesi) canlı okunması sağlandı.
- **Garmin Smart Band Bulut Entegrasyonu**: Garmin Connect üzerinden günlük adım, dinlenik/min/maks nabız, uyku süresi ve evreleri (derin, hafif, REM, uyku skoru), stres skoru, Body Battery, HRV ve SpO2 verilerinin otomatik senkronizasyonu eklendi.
- **Samsung Galaxy Watch6 / Health Connect Otomatik Köprüsü**: Telefondan arka plan Webhook (`POST /api/ingest/webhook`) ile otomatik JSON veri akışı, izlenen klasör (`WATCH_EXPORT_DIR`) tarayıcısı ve Health Connect SQLite `.db` / CSV yedek içe aktarımı eklendi.
- **Akıllı Cihaz Önceliklendirme ve Watch6 vs. Garmin Kıyaslama**: Aynı gün birden fazla giyilebilir cihazdan gelen verilerin çift sayılmasını önleyen metrik bazlı öncelik kuralları (`priority`, `average`, `max`), yan yana cihaz uyum/sapma tablosu ve Bölüm 6 zamansal döngü penceresi sınır doğrulaması (`cycle_start_date`) eklendi.
- **Anlamlandırma, Korelasyon ve Anomali Motoru**: 7/30 günlük hareketli ortalamalar, Toparlanma Skoru (0–100), Kilo Değişim Kalitesi (yağ, kas ve su değişim payları), Pearson ($r$) çapraz korelasyon matrisi ve otomatik anomali uyarıları (RHR artışı, HRV düşüşü, kas kaybı riski, su kaybı, uyku borcu, cihaz sapması) eklendi.
- **AI Danışman ve Kopyalanabilir Prompt Stüdyosu**: İzole `ai-advisor-service` üzerinden Gemini AI çoklu cihaz sağlık yorumlaması ve tek tıkla kopyalanabilir yapılandırılmış Türkçe analiz prompt'u üretimi eklendi.
- **Ayarlar ve Canlı Webhook Heartbeat İzleyici**: Cihaz kimlik bilgilerinin (Renpho, Garmin, Gemini AI, Webhook Secret) doğrudan arayüzden veritabanına kaydedilmesi ve Samsung Galaxy Watch6 / Health Connect / Garmin / Renpho webhook sinyallerinin canlılık (heartbeat) takibi eklendi.
- **Kurumsal Çift Tema Arayüz (React Aria Components & Nivo)**: Kapalı tasarım token seti, Koyu/Açık tema WCAG AA kontrast uyumu, çevrimdışı barındırılan IBM Plex Sans, IBM Plex Mono ve Material Symbols Outlined fontları ile 6 ana ekran oluşturuldu.

