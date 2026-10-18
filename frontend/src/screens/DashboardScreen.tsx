import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import {
  Button,
  DashboardTemplate,
  Icon,
  LineChart,
  Select,
  StateBlock,
  Table,
  Tag,
  Toast,
} from '../ui';

export function DashboardScreen({
  onNavigateTab,
  forcedState,
}: {
  onNavigateTab: (tab: string) => void;
  forcedState?: 'default' | 'empty' | 'error';
}) {
  const [range, setRange] = useState('30d');
  const [scope, setScope] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [overview, setOverview] = useState<any>(null);
  const [syncStatus, setSyncStatus] = useState<any>(null);

  const loadData = useCallback(async () => {
    if (forcedState === 'error') {
      setLoading(false);
      setError('Mikroservis ağ geçidi bağlantısı kurulamadı (Test Hata Durumu).');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [ov, st, hl] = await Promise.all([
        apiClient.getDashboardOverview({ range: forcedState === 'empty' ? 'cycle' : range, scope }),
        apiClient.getSyncStatus(),
        apiClient.getHealth(),
      ]);
      if (forcedState === 'empty') {
        setOverview({
          ...ov,
          window_status: 'pending',
          metrics: ov.metrics.map((m: any) => ({ ...m, value: 'Bekleniyor', delta: 'Yeni döngü' })),
          weight_series: [],
          recovery_series: [],
          daily_rows: [],
          anomalies: [],
          services: hl.services || ov.services,
        });
      } else {
        setOverview({ ...ov, services: hl.services || ov.services });
      }
      setSyncStatus(st);
    } catch (err: any) {
      setError(err?.message || 'Gösterge paneli verileri alınamadı.');
    } finally {
      setLoading(false);
    }
  }, [forcedState, range, scope]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleTriggerSync = async () => {
    try {
      const res = await apiClient.triggerSync({ provider: scope === 'all' ? 'all' : scope });
      setToastMsg(res.message || 'Tüm cihaz mikroservisleri senkronize edildi.');
      await loadData();
    } catch (err: any) {
      setToastMsg(err?.message || 'Senkronizasyon sırasında hata oluştu.');
    }
  };

  const handleBleQuickRead = async () => {
    try {
      const navAny = navigator as any;
      if (!navAny || !navAny.bluetooth) {
        onNavigateTab('scale');
        return;
      }
      const device = await navAny.bluetooth.requestDevice({
        filters: [{ namePrefix: 'RENPHO' }, { namePrefix: 'ES-' }, { namePrefix: 'QN-' }],
        optionalServices: ['0000ffe0-0000-1000-8000-00805f9b34fb', '0000181d-0000-1000-8000-00805f9b34fb'],
      });
      if (!device?.gatt) {
        setToastMsg('Bluetooth GATT sunucusuna bağlanılamadı.');
        return;
      }
      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('0000181d-0000-1000-8000-00805f9b34fb');
      const char = await service.getCharacteristic('00002a9d-0000-1000-8000-00805f9b34fb');
      const val = await char.readValue();
      const rawWeight = val.getUint16(1, true) * 0.005;
      if (rawWeight > 20 && rawWeight < 300) {
        const res = await apiClient.ingestBleScale({
          weight_kg: Number(rawWeight.toFixed(2)),
        });
        setToastMsg(res.message);
        await loadData();
      }
    } catch {
      setToastMsg('Aktif Bluetooth tartı okuması tamamlanmadı. Tartı sekmesinden ölçüm ekleyebilir veya buluttan çekebilirsiniz.');
    }
  };

  if (loading) {
    return (
      <StateBlock
        state="loading"
        title="Gösterge paneli yükleniyor"
        description="Renpho ES-26BB-B, Galaxy Watch6 ve Garmin Smart Band verileri birleştiriliyor..."
      />
    );
  }

  if (error || !overview) {
    return (
      <StateBlock
        state="error"
        title="Gösterge paneli yüklenemedi"
        description={error || 'Bilinmeyen hata'}
        onRetry={loadData}
      />
    );
  }

  const latestRow = (overview.daily_rows || [])[0] || null;
  const comp = overview.composition_quality || {};

  const userGuidanceRows = latestRow
    ? [
        {
          id: 'guide-weight',
          area: 'Kilo, Yağ ve Kas Dengesi',
          current: `${latestRow.weight_kg ?? '-'} kg | Yağ: %${latestRow.body_fat_pct ?? '-'} | Kas: ${latestRow.muscle_mass_kg ?? '-'} kg`,
          status:
            (comp.muscle_loss_share_pct ?? 0) > 22
              ? 'critical'
              : (comp.total_weight_delta_kg ?? 0) < 0
                ? 'nominal'
                : 'warning',
          statusLabel:
            (comp.muscle_loss_share_pct ?? 0) > 22
              ? 'Kas Kaybı Tehlikesi'
              : (comp.total_weight_delta_kg ?? 0) < 0
                ? 'Sağlıklı Kilo Kaybı'
                : 'Dengeli Seyir',
          advice:
            comp.interpretation ||
            'Kilo verirken kas kütlenizi korumak için yeterli protein tüketin ve düzenli yürüyüş/egzersiz yapın.',
        },
        {
          id: 'guide-heart',
          area: 'Kalp Hızı ve Dinlenme Durumu',
          current: `Dinlenik Nabız: ${latestRow.resting_hr_bpm ? `${Math.round(latestRow.resting_hr_bpm)} atım/dk` : '-'} | Stres: ${latestRow.stress_score ? Math.round(latestRow.stress_score) : '-'}`,
          status: (latestRow.resting_hr_bpm ?? 55) <= 65 ? 'nominal' : 'warning',
          statusLabel: (latestRow.resting_hr_bpm ?? 55) <= 65 ? 'Kalp Kondisyonu Güçlü' : 'Yorgunluk Belirtisi',
          advice:
            (latestRow.resting_hr_bpm ?? 55) <= 65
              ? 'Dinlenik kalp atış hızınız ideal aralıkta; kalp-damar kondisyonunuz ve dinlenme kapasiteniz gayet iyi.'
              : 'Dinlenik nabzınız yüksek seyrediyor; bugün aşırı efordan kaçınıp dinlenmeye vakit ayırın.',
        },
        {
          id: 'guide-sleep',
          area: 'Uyku Süresi ve Vücut Şarjı',
          current: `Uyku: ${latestRow.sleep_hours ?? '-'} saat | Vücut Enerjisi: %${latestRow.body_battery_max ?? 85}`,
          status: (latestRow.sleep_hours ?? 0) >= 7.0 ? 'nominal' : 'warning',
          statusLabel: (latestRow.sleep_hours ?? 0) >= 7.0 ? 'İyi Dinlenmiş' : 'Uyku Süresi Kısa',
          advice:
            (latestRow.sleep_hours ?? 0) >= 7.0
              ? 'Uyku süreniz vücudun yenilenmesi ve hormon dengesi için yeterli seviyede.'
              : '7 saatin altındaki uyku ödem tutulumuna ve tatlı/karbonhidrat isteğine yol açabilir; bu gece erken uyuyun.',
        },
        {
          id: 'guide-activity',
          area: 'Günlük Hareket ve Vücut Suyu',
          current: `Adım: ${(latestRow.steps ?? 0).toLocaleString('tr-TR')} | Vücut Suyu: %${latestRow.water_pct ?? '-'}`,
          status:
            (latestRow.steps ?? 0) >= 6000 && (latestRow.water_pct ?? 50) >= 50
              ? 'nominal'
              : (latestRow.steps ?? 0) < 2500
                ? 'critical'
                : 'warning',
          statusLabel:
            (latestRow.steps ?? 0) >= 6000 && (latestRow.water_pct ?? 50) >= 50
              ? 'Aktif ve Dengeli'
              : 'Hareket / Su Artırılmalı',
          advice:
            (latestRow.steps ?? 0) < 5000 || (latestRow.water_pct ?? 50) < 50
              ? 'Yağ yakımını hızlandırmak ve ödemi atmak için bugün en az 7.500 adım yürüyün ve 2.5 - 3 litre su için.'
              : 'Günlük adım ve vücut su oranınız sağlıklı hedeflerle uyumlu ilerliyor.',
        },
      ]
    : [];

  const syncHours = Math.round(((syncStatus?.auto_sync_interval_minutes || 360) / 60) * 10) / 10;

  return (
    <DashboardTemplate
      title="Kişisel Sağlık Özeti, Uyarılar ve Günlük Rehber"
      lastUpdated={`Son Güncelleme: ${overview.last_updated?.slice(0, 16).replace('T', ' ')} | Otomatik Kontrol: ${syncHours >= 1 ? `${syncHours} saatte bir` : `${syncStatus?.auto_sync_interval_minutes || 60} dakikada bir`}`}
      metrics={overview.metrics || []}
      onSelectMetricTarget={onNavigateTab}
      filterBar={
        <>
          <Select
            label="Zaman aralığı"
            value={range}
            onChange={setRange}
            options={[
              { value: '7d', label: 'Son 7 gün' },
              { value: '30d', label: 'Son 30 gün' },
              { value: '90d', label: 'Son 90 gün' },
              { value: 'cycle', label: 'Aktif döngü penceresi' },
            ]}
          />
          <Select
            label="Cihaz kapsamı"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'all', label: 'Tüm Cihazlarım (Tartı + Saat + Bileklik)' },
              { value: 'renpho', label: 'Akıllı Tartı (Renpho)' },
              { value: 'watch6', label: 'Akıllı Saat (Galaxy Watch6)' },
              { value: 'garmin', label: 'Akıllı Bileklik (Garmin)' },
            ]}
          />
          <Button variant="default" onPress={handleBleQuickRead}>
            <Icon name="bluetooth" />
            <span>Tartıdan Ölçüm Al</span>
          </Button>
          <Button variant="primary" onPress={handleTriggerSync}>
            <Icon name="sync" />
            <span>Şimdi Senkronize Et</span>
          </Button>
        </>
      }
    >
      <Toast message={toastMsg} onDismiss={() => setToastMsg(null)} />

      <Table
        title="Önemli Sağlık Uyarıları, Tehlikeler ve Tespitler (Lütfen İnceleyin)"
        rowKey="id"
        data={overview.anomalies || []}
        emptyMessage="Şu an için herhangi bir sağlık uyarısı veya tehlike sinyali bulunmuyor."
        columns={[
          {
            key: 'severity',
            header: 'Önem Derecesi',
            render: (row) => (
              <Tag
                tone={
                  row.severity === 'critical'
                    ? 'critical'
                    : row.severity === 'warning'
                      ? 'warning'
                      : 'nominal'
                }
                label={
                  row.severity === 'critical'
                    ? 'TEHLİKE / KRİTİK'
                    : row.severity === 'warning'
                      ? 'DİKKAT / UYARI'
                      : 'İYİ DURUMDA'
                }
              />
            ),
          },
          { key: 'title', header: 'Tespit Edilen Durum' },
          { key: 'metric', header: 'Ölçülen Değer' },
          { key: 'source', header: 'Cihaz' },
          { key: 'detail', header: 'Ne Anlama Geliyor & Ne Yapmalısınız?' },
        ]}
      />

      <Table
        title="Verileriniz Ne Anlama Geliyor? (Cihazlarınızdan Alınan Ölçümlerin Özeti)"
        rowKey="id"
        data={userGuidanceRows}
        emptyMessage="Henüz yorumlanacak günlük sağlık verisi bulunmuyor."
        columns={[
          { key: 'area', header: 'Sağlık Alanı' },
          { key: 'current', header: 'Son Ölçümleriniz' },
          {
            key: 'statusLabel',
            header: 'Değerlendirme',
            render: (row) => <Tag tone={row.status as any} label={row.statusLabel} />,
          },
          { key: 'advice', header: 'Sizin İçin Öneri ve Açıklama' },
        ]}
      />

      <div className="hs-grid-2">
        <LineChart
          title="Kilo, 7 Günlük Ortalama ve Kas Kütlesi Değişimi"
          xAxisLabel="Tarih"
          yAxisLabel="Kütle (kg)"
          series={overview.weight_series || []}
          onInspect={() => onNavigateTab('scale')}
        />
        <LineChart
          title="Vücut Dinlenme Puanı ve Kalp Hızı Seyri"
          xAxisLabel="Tarih"
          yAxisLabel="Puan / Nabız"
          series={overview.recovery_series || []}
          onInspect={() => onNavigateTab('insights')}
        />
      </div>

      <Table
        title="Günlük Sağlık Karnesi (Gün Gün Tüm Ölçümleriniz)"
        rowKey="date"
        data={overview.daily_rows || []}
        emptyMessage="Seçili tarih aralığında henüz günlük kayıt bulunmuyor."
        columns={[
          { key: 'date', header: 'Tarih' },
          { key: 'weight_kg', header: 'Kilo (kg)', numeric: true },
          { key: 'body_fat_pct', header: 'Yağ (%)', numeric: true },
          { key: 'muscle_mass_kg', header: 'Kas (kg)', numeric: true },
          { key: 'water_pct', header: 'Su (%)', numeric: true },
          { key: 'steps', header: 'Adım', numeric: true },
          { key: 'sleep_hours', header: 'Uyku (saat)', numeric: true },
          { key: 'resting_hr_bpm', header: 'Dinlenik Nabız', numeric: true },
          { key: 'body_battery_max', header: 'Vücut Enerjisi (%)', numeric: true },
          {
            key: 'recovery_score',
            header: 'Dinlenme Puanı',
            numeric: true,
            render: (row) => (
              <Tag
                tone={row.recovery_score >= 75 ? 'nominal' : row.recovery_score >= 55 ? 'warning' : 'critical'}
                label={
                  row.recovery_score >= 75
                    ? `Çok İyi (${row.recovery_score})`
                    : row.recovery_score >= 55
                      ? `Orta (${row.recovery_score})`
                      : `Yorgun (${row.recovery_score})`
                }
              />
            ),
          },
          { key: 'primary_source', header: 'Günlük Özet Yorum' },
        ]}
      />
    </DashboardTemplate>
  );
}
