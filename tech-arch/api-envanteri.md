# API Envanteri ve Tam Yığın Sözleşme Parite Tablosu

Bu belge `api/openapi.yaml` sözleşmesinden `make gen-api` komutuyla otomatik üretilir.

| Uç Nokta (Endpoint) | İşlem Kimliği (`operationId`) | Mikroservis İşleyicisi (Backend Handler) | Backend Testi | Arayüz Tüketicisi (Frontend Consumer) |
| :--- | :--- | :--- | :--- | :--- |
| `GET /api/health` | `getHealth` | `services/api_gateway/app.py::get_health` | `test_health_and_changelog_endpoints` | `Shell.tsx, DashboardScreen.tsx` |
| `GET /api/changelog` | `getChangelog` | `services/api_gateway/app.py::get_changelog` | `test_health_and_changelog_endpoints` | `Shell.tsx` |
| `GET /api/sync/status` | `getSyncStatus` | `services/scheduler/app.py::get_sync_status_bundle` | `test_circuit_breaker_isolation_and_recovery` | `DashboardScreen.tsx, AiScreen.tsx` |
| `POST /api/sync/trigger` | `triggerSync` | `services/scheduler/app.py::trigger_orchestrated_sync` | `test_circuit_breaker_isolation_and_recovery` | `DashboardScreen.tsx, ScaleScreen.tsx` |
| `POST /api/ingest/webhook` | `ingestWebhook` | `services/watch6_ingest/app.py::upsert_watch6_daily_records` | `test_watch6_and_garmin_webhook_and_comparison` | `AiScreen.tsx` |
| `POST /api/ingest/ble-scale` | `ingestBleScale` | `services/renpho_sync/app.py::upsert_scale_measurement` | `test_renpho_ble_scale_ingest_and_13_metrics` | `DashboardScreen.tsx, ScaleScreen.tsx` |
| `POST /api/ingest/import-file` | `importHealthFile` | `services/watch6_ingest/app.py::import_health_file_payload` | `test_health_connect_sqlite_db_and_csv_import` | `ScaleScreen.tsx` |
| `GET /api/reconciliation/rules` | `getReconciliationRules` | `services/reconciliation/app.py::get_or_create_config` | `test_reconciliation_rules_and_section6_temporal_window_guard` | `ProfileScreen.tsx, WearablesScreen.tsx` |
| `PUT /api/reconciliation/rules` | `updateReconciliationRules` | `services/reconciliation/app.py::update_config` | `test_reconciliation_rules_and_section6_temporal_window_guard` | `ProfileScreen.tsx, WearablesScreen.tsx` |
| `GET /api/dashboard/overview` | `getDashboardOverview` | `services/api_gateway/app.py::get_dashboard_overview` | `test_reconciliation_rules_and_section6_temporal_window_guard` | `DashboardScreen.tsx` |
| `GET /api/measurements/scale` | `listScaleMeasurements` | `services/renpho_sync/app.py::list_scale_records` | `test_renpho_ble_scale_ingest_and_13_metrics` | `ScaleScreen.tsx` |
| `POST /api/measurements/scale/bulk-delete` | `bulkDeleteScaleMeasurements` | `services/renpho_sync/app.py::bulk_delete_scale_records` | `test_scale_bulk_delete_and_validation` | `ScaleScreen.tsx` |
| `GET /api/wearables/comparison` | `getWearablesComparison` | `services/reconciliation/app.py::build_wearables_comparison` | `test_watch6_and_garmin_webhook_and_comparison` | `WearablesScreen.tsx` |
| `GET /api/analytics/insights` | `getAnalyticsInsights` | `services/analytics_anomaly/app.py::build_analytics_insights` | `test_analytics_insights_and_ai_advisor_endpoints` | `InsightsScreen.tsx` |
| `GET /api/ai/prompts` | `getAiPrompts` | `services/ai_advisor/app.py::build_multi_device_prompt` | `test_analytics_insights_and_ai_advisor_endpoints` | `AiScreen.tsx` |
| `POST /api/ai/analyze` | `createAiAnalysis` | `services/ai_advisor/app.py::generate_ai_report` | `test_analytics_insights_and_ai_advisor_endpoints` | `AiScreen.tsx` |
| `GET /api/ai/reports` | `listAiReports` | `services/ai_advisor/app.py::list_ai_reports_data` | `test_analytics_insights_and_ai_advisor_endpoints` | `AiScreen.tsx` |
| `GET /api/settings` | `getIntegrationSettings` | `services/watch6_ingest/app.py::get_or_create_integration_settings` | `test_integration_settings_and_webhook_heartbeat_monitor` | `SettingsScreen.tsx` |
| `PUT /api/settings` | `updateIntegrationSettings` | `services/watch6_ingest/app.py::update_integration_settings` | `test_integration_settings_and_webhook_heartbeat_monitor` | `SettingsScreen.tsx` |
| `GET /api/webhook/heartbeat` | `getWebhookHeartbeat` | `services/watch6_ingest/app.py::get_webhook_heartbeat_monitor` | `test_integration_settings_and_webhook_heartbeat_monitor` | `SettingsScreen.tsx` |
| `POST /api/webhook/heartbeat` | `sendWebhookHeartbeat` | `services/watch6_ingest/app.py::record_webhook_heartbeat` | `test_integration_settings_and_webhook_heartbeat_monitor` | `SettingsScreen.tsx` |
