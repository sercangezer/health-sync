import { test, expect, Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

const MOCK_API_RESPONSES: Record<string, unknown> = {
  '/api/health': {
    status: 'healthy',
    service: 'api-gateway',
    version: '1.0.0',
    commit: '71d55b8',
    timestamp: '2026-10-18T10:00:00Z',
    services: [
      { name: 'renpho-sync', status: 'healthy', circuit_state: 'CLOSED', latency_ms: 4.2, url: 'http://renpho-sync:8001' },
      { name: 'garmin-sync', status: 'healthy', circuit_state: 'CLOSED', latency_ms: 5.1, url: 'http://garmin-sync:8002' },
      { name: 'watch6-ingest', status: 'healthy', circuit_state: 'CLOSED', latency_ms: 3.8, url: 'http://watch6-ingest:8003' },
      { name: 'reconciliation', status: 'healthy', circuit_state: 'CLOSED', latency_ms: 4.9, url: 'http://reconciliation:8004' },
      { name: 'analytics-anomaly', status: 'healthy', circuit_state: 'CLOSED', latency_ms: 6.4, url: 'http://analytics-anomaly:8005' },
      { name: 'ai-advisor', status: 'healthy', circuit_state: 'CLOSED', latency_ms: 7.0, url: 'http://ai-advisor:8006' },
      { name: 'scheduler', status: 'healthy', circuit_state: 'CLOSED', latency_ms: 3.5, url: 'http://scheduler:8007' },
    ],
  },
  '/api/changelog': {
    version: '1.0.0',
    commit: '71d55b8',
    changelog: '# Değişiklik Günlüğü\n\n## v1.0.0\n- Renpho ES-26BB-B, Galaxy Watch6 ve Garmin Smart Band mikroservis mimarisi.',
  },
  '/api/sync/status': {
    overall_status: 'nominal',
    next_scheduled_run: '2026-10-18T10:15:00Z',
    providers: [
      {
        provider: 'renpho_es26bb',
        mode: 'cloud_and_ble',
        status: 'success',
        last_sync_at: '2026-10-18T09:45:00Z',
        records_synced: 30,
        circuit_state: 'CLOSED',
        message: 'Renpho ES-26BB-B 13 biyometrik metrik senkronize edildi.',
      },
      {
        provider: 'galaxy_watch6',
        mode: 'webhook_and_sqlite',
        status: 'success',
        last_sync_at: '2026-10-18T09:50:00Z',
        records_synced: 30,
        circuit_state: 'CLOSED',
        message: 'Samsung Galaxy Watch6 Health Connect senkronizasyonu tamamlandı.',
      },
      {
        provider: 'garmin_band',
        mode: 'garmin_connect_auto',
        status: 'success',
        last_sync_at: '2026-10-18T09:52:00Z',
        records_synced: 30,
        circuit_state: 'CLOSED',
        message: 'Garmin Smart Band Body Battery, HRV ve stres verileri aktarıldı.',
      },
    ],
  },
  '/api/dashboard/overview': {
    range: '30d',
    window_status: 'active',
    cycle_start_date: '2026-09-18',
    metrics: [
      { id: 'weight', label: 'Güncel Ağırlık (Renpho)', value: '81.6 kg', delta: '-1.9 kg (30g)', status: 'nominal', source: 'Renpho ES-26BB-B' },
      { id: 'fat_muscle', label: 'Vücut Yağı / İskelet Kası', value: '%20.4 / %39.8', delta: 'Kas korundu', status: 'nominal', source: 'Renpho BIA (13 Metrik)' },
      { id: 'recovery', label: 'Otonom Toparlanma Skoru', value: '84 / 100', delta: 'HRV 54 ms | RHR 57 bpm', status: 'nominal', source: 'Watch6 + Garmin Uzlaşım' },
      { id: 'steps', label: 'Birleştirilmiş Günlük Adım', value: '10,840 adım', delta: '7.5 sa uyku', status: 'nominal', source: 'Birleştirilmiş Öz' },
    ],
    weight_series: [
      { date: '2026-10-14', weight_kg: 82.4, rolling_7d_kg: 82.6, body_fat_pct: 20.9, skeletal_muscle_pct: 39.4 },
      { date: '2026-10-15', weight_kg: 82.2, rolling_7d_kg: 82.4, body_fat_pct: 20.7, skeletal_muscle_pct: 39.5 },
      { date: '2026-10-16', weight_kg: 81.9, rolling_7d_kg: 82.2, body_fat_pct: 20.6, skeletal_muscle_pct: 39.6 },
      { date: '2026-10-17', weight_kg: 81.8, rolling_7d_kg: 82.0, body_fat_pct: 20.5, skeletal_muscle_pct: 39.7 },
      { date: '2026-10-18', weight_kg: 81.6, rolling_7d_kg: 81.9, body_fat_pct: 20.4, skeletal_muscle_pct: 39.8 },
    ],
    recovery_series: [
      { date: '2026-10-14', recovery_score: 78, sleep_hours: 7.1, resting_hr_bpm: 59, hrv_ms: 49, steps: 9600 },
      { date: '2026-10-15', recovery_score: 80, sleep_hours: 7.3, resting_hr_bpm: 58, hrv_ms: 51, steps: 10200 },
      { date: '2026-10-16', recovery_score: 82, sleep_hours: 7.4, resting_hr_bpm: 58, hrv_ms: 52, steps: 10450 },
      { date: '2026-10-17', recovery_score: 83, sleep_hours: 7.5, resting_hr_bpm: 57, hrv_ms: 53, steps: 10680 },
      { date: '2026-10-18', recovery_score: 84, sleep_hours: 7.5, resting_hr_bpm: 57, hrv_ms: 54, steps: 10840 },
    ],
    daily_rows: [
      {
        date: '2026-10-18',
        weight_kg: 81.6,
        body_fat_pct: 20.4,
        skeletal_muscle_pct: 39.8,
        steps: 10840,
        sleep_hours: 7.5,
        resting_hr_bpm: 57,
        hrv_ms: 54,
        stress_score: 28,
        body_battery: 82,
        recovery_score: 84,
        winning_sources: { weight: 'renpho_es26bb', sleep: 'galaxy_watch6', activity: 'average', heart: 'garmin_band' },
      },
      {
        date: '2026-10-17',
        weight_kg: 81.8,
        body_fat_pct: 20.5,
        skeletal_muscle_pct: 39.7,
        steps: 10680,
        sleep_hours: 7.4,
        resting_hr_bpm: 57.5,
        hrv_ms: 53,
        stress_score: 30,
        body_battery: 79,
        recovery_score: 83,
        winning_sources: { weight: 'renpho_es26bb', sleep: 'galaxy_watch6', activity: 'average', heart: 'garmin_band' },
      },
    ],
    anomalies: [
      {
        id: 'nom-1',
        date: '2026-10-18',
        severity: 'nominal',
        metric: 'Kardiyometabolik Denge',
        title: 'Tüm biyometrik göstergeler nominal aralıkta',
        description: 'Dinlenik nabız, HRV ve kas oranı hedeflenen referans bantları içinde.',
        device_source: 'reconciliation-service',
      },
    ],
    services: [
      { name: 'renpho-sync', status: 'healthy', circuit_state: 'CLOSED', latency_ms: 4.2, url: 'http://renpho-sync:8001' },
      { name: 'garmin-sync', status: 'healthy', circuit_state: 'CLOSED', latency_ms: 5.1, url: 'http://garmin-sync:8002' },
      { name: 'watch6-ingest', status: 'healthy', circuit_state: 'CLOSED', latency_ms: 3.8, url: 'http://watch6-ingest:8003' },
      { name: 'reconciliation', status: 'healthy', circuit_state: 'CLOSED', latency_ms: 4.9, url: 'http://reconciliation:8004' },
    ],
  },
  '/api/measurements/scale': {
    total: 2,
    items: [
      {
        id: 101,
        measured_at: '2026-10-18T07:30:00Z',
        date: '2026-10-18',
        source: 'renpho_ble',
        weight_kg: 81.6,
        bmi: 25.19,
        body_fat_pct: 20.4,
        subcutaneous_fat_pct: 17.7,
        visceral_fat_index: 9.0,
        body_water_pct: 56.8,
        skeletal_muscle_pct: 39.8,
        muscle_mass_kg: 61.5,
        bone_mass_kg: 3.24,
        protein_pct: 17.9,
        bmr_kcal: 1775,
        metabolic_age: 33,
        fat_free_Weight_kg: 64.95,
      },
      {
        id: 100,
        measured_at: '2026-10-17T07:30:00Z',
        date: '2026-10-17',
        source: 'renpho_cloud',
        weight_kg: 81.8,
        bmi: 25.25,
        body_fat_pct: 20.5,
        subcutaneous_fat_pct: 17.8,
        visceral_fat_index: 9.0,
        body_water_pct: 56.7,
        skeletal_muscle_pct: 39.7,
        muscle_mass_kg: 61.4,
        bone_mass_kg: 3.24,
        protein_pct: 17.8,
        bmr_kcal: 1778,
        metabolic_age: 33,
        fat_free_Weight_kg: 65.03,
      },
    ],
  },
  '/api/analytics/insights': {
    range: '30d',
    window_status: 'active',
    recovery_score: 84,
    recovery_status: 'nominal',
    composition_quality: {
      total_weight_delta_kg: -1.9,
      fat_mass_delta_kg: -1.65,
      muscle_mass_delta_kg: 0.22,
      hydration_delta_pct: 0.85,
      quality_verdict: 'Yüksek Kaliteli Yağ Kaybı (Kas Kütlesi Korundu)',
      quality_tone: 'nominal',
    },
    correlations: [
      {
        id: 'sleep_vs_weight',
        pair_label: 'Uyku Süresi (Watch6/Garmin) ↔ Ertesi Gün Tartı Değişimi (Renpho)',
        pearson_r: -0.46,
        strength: 'Orta',
        direction: 'negative',
        interpretation: '7.5 saat üzeri uyku uyunan gecelerin ertesi sabahında ödem ve tartı dalgalanması azalmaktadır.',
        sample_size: 28,
      },
      {
        id: 'steps_vs_rhr',
        pair_label: 'Günlük Adım ↔ Dinlenik Nabız (RHR)',
        pearson_r: -0.52,
        strength: 'Güçlü',
        direction: 'negative',
        interpretation: 'Düzenli adım hacmi arttıkça kardiyovasküler dinlenik nabız düşmektedir.',
        sample_size: 28,
      },
    ],
    anomalies: [
      {
        id: 'nom-1',
        date: '2026-10-18',
        severity: 'nominal',
        metric: 'Kardiyometabolik Denge',
        title: 'Tüm biyometrik göstergeler nominal aralıkta',
        description: 'Dinlenik nabız, HRV ve kas oranı hedeflenen referans bantları içinde.',
        device_source: 'analytics-anomaly-service',
      },
    ],
    rolling_series: [
      { date: '2026-10-16', weight_kg: 81.9, weight_7d_avg: 82.2, weight_30d_avg: 82.7, body_fat_pct: 20.6, sleep_hours: 7.4, recovery_score: 82 },
      { date: '2026-10-17', weight_kg: 81.8, weight_7d_avg: 82.0, weight_30d_avg: 82.6, body_fat_pct: 20.5, sleep_hours: 7.5, recovery_score: 83 },
      { date: '2026-10-18', weight_kg: 81.6, weight_7d_avg: 81.9, weight_30d_avg: 82.5, body_fat_pct: 20.4, sleep_hours: 7.5, recovery_score: 84 },
    ],
  },
  '/api/wearables/comparison': {
    summary: {
      avg_step_diff_pct: 4.1,
      avg_hr_diff_bpm: 1.2,
      avg_sleep_diff_hours: 0.25,
      overall_agreement_score: 94.2,
    },
    rows: [
      {
        date: '2026-10-18',
        watch6_steps: 10620,
        garmin_steps: 11060,
        reconciled_steps: 10840,
        step_diff_pct: 4.0,
        watch6_sleep_hours: 7.5,
        garmin_sleep_hours: 7.25,
        reconciled_sleep_hours: 7.5,
        watch6_resting_hr: 58,
        garmin_resting_hr: 57,
        reconciled_resting_hr: 57,
        watch6_hrv_ms: 53,
        garmin_hrv_ms: 54,
        garmin_body_battery: 82,
        garmin_stress: 28,
      },
    ],
  },
  '/api/reconciliation/rules': {
    weight_priority: 'renpho_es26bb',
    sleep_priority: 'galaxy_watch6',
    activity_priority: 'average',
    heart_priority: 'garmin_band',
    merge_strategy: 'priority',
    cycle_start_date: '2026-09-18',
    target_weight_kg: 78.0,
    height_cm: 180.0,
  },
  '/api/ai/prompts': {
    title: 'Çoklu Cihaz Biyometrik Anlamlandırma Prompt Şablonu',
    generated_at: '2026-10-18T10:00:00Z',
    prompt_text: 'Sen klinik düzeyde biyometrik veri analisti ve spor fizyoloğusun.\nCihazlar: Renpho ES-26BB-B, Samsung Galaxy Watch6, Garmin Smart Band.',
    context_summary: {
      days_analyzed: 30,
      latest_weight_kg: 81.6,
      latest_body_fat_pct: 20.4,
      avg_steps: 10420,
      avg_sleep_hours: 7.4,
    },
  },
  '/api/ai/reports': {
    items: [
      {
        id: 1,
        created_at: '2026-10-18T09:30:00Z',
        model_used: 'gemini-2.5-flash',
        focus_area: 'holistic',
        summary: 'Son 30 günde 1.9 kg ağırlık düşüşünün %86 oranı yağ dokusundan gerçekleşti; HRV ve RHR dengeli.',
        recommendations: [
          'Garmin RHR 57 bpm ve HRV 54 ms ile otonom sinir sistemi toparlanması yüksek.',
          'Watch6 derin uyku süresini korumak için akşam antrenmanlarını 20:30 öncesinde tamamlayın.',
        ],
        raw_markdown: '### Bütüncül Değerlendirme\n- Renpho ES-26BB-B yağ oranı %20.4 seviyesine geriledi.',
      },
    ],
  },
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
        page.on('request', (req) => {
          const u = new URL(req.url());
          if (u.protocol.startsWith('http') && u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') {
            externalRequests.push(req.url());
          }
        });

        await setupDeterministicApiMocks(page);
        await page.goto(`/?tab=${tab}&theme=${theme}&state=default`);
        await page.waitForSelector('.hs-shell');

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
      await setupDeterministicApiMocks(page);

      await page.goto(`/?tab=dashboard&theme=${theme}&state=empty`);
      await page.waitForSelector('.hs-shell');
      await expect(page).toHaveScreenshot(`dashboard-empty-${theme}.png`, { fullPage: true });

      await page.goto(`/?tab=dashboard&theme=${theme}&state=error`);
      await page.waitForSelector('.hs-state-block');
      await expect(page).toHaveScreenshot(`dashboard-error-${theme}.png`, { fullPage: true });
    });
  }
});
