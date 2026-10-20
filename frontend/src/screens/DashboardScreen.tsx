import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import {
  Button,
  DashboardTemplate,
  formatDateTR,
  formatDateTimeTR,
  Icon,
  LineChart,
  Panel,
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
  const scope = 'all';
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

  const syncHours = Math.round(((syncStatus?.auto_sync_interval_minutes || 360) / 60) * 10) / 10;
  const alerts = overview.anomalies || [];
  const clinical = overview.clinical_evaluation;

  return (
    <DashboardTemplate
      title="Sağlık Özeti"
      lastUpdated={`${formatDateTimeTR(overview.last_updated)} • ${syncHours >= 1 ? `${syncHours} saatte bir` : `${syncStatus?.auto_sync_interval_minutes || 60} dk'da bir`} otomatik senkron`}
      metrics={overview.metrics || []}
      onSelectMetricTarget={onNavigateTab}
      filterBar={
        <>
          <Select
            label="Dönem"
            value={range}
            onChange={setRange}
            options={[
              { value: '7d', label: 'Son 7 gün' },
              { value: '30d', label: 'Son 30 gün' },
              { value: '90d', label: 'Son 90 gün' },
              { value: 'cycle', label: 'Aktif döngü' },
            ]}
          />
          <Button variant="default" onPress={handleBleQuickRead}>
            <Icon name="bluetooth" />
            <span>Tartı Oku</span>
          </Button>
          <Button variant="primary" onPress={handleTriggerSync}>
            <Icon name="sync" />
            <span>Güncelle</span>
          </Button>
        </>
      }
    >
      <Toast message={toastMsg} onDismiss={() => setToastMsg(null)} />

      {clinical?.pillars?.length > 0 && forcedState !== 'empty' ? (
        <Panel
          title="Uzman Hekim Günlük Değerlendirmesi"
          actions={
            <Tag
              tone="nominal"
              label={`Günlük Hedef: ${clinical.daily_water_liters} L Su • ${clinical.daily_protein_g} g Protein • ${clinical.daily_step_target}+ Adım`}
            />
          }
        >
          <p className="hs-page-subtitle">{clinical.headline}</p>
          <div className="hs-alerts-grid">
            {clinical.pillars.map((p: any) => (
              <article
                key={p.id}
                className={`hs-alert-card hs-alert-card-${p.status === 'warning' ? 'warning' : 'nominal'}`}
              >
                <div className="hs-alert-header">
                  <Tag
                    tone={p.status === 'warning' ? 'warning' : 'nominal'}
                    label={p.specialty}
                  />
                  <span className="hs-alert-metric">{p.metric}</span>
                </div>
                <h2 className="hs-alert-title">{p.title}</h2>
                <p className="hs-alert-detail">{p.summary}</p>
              </article>
            ))}
          </div>
        </Panel>
      ) : null}

      {alerts.length > 0 ? (
        <section aria-label="Önemli sağlık uyarıları">
          <div className="hs-alerts-grid">
            {alerts.map((a: any) => {
              const tone =
                a.severity === 'critical'
                  ? 'critical'
                  : a.severity === 'warning'
                    ? 'warning'
                    : 'nominal';
              const badgeLabel =
                a.severity === 'critical'
                  ? 'TEHLİKE'
                  : a.severity === 'warning'
                    ? 'UYARI'
                    : 'İYİ DURUMDA';
              return (
                <article
                  key={a.id}
                  className={`hs-alert-card hs-alert-card-${tone}`}
                >
                  <div className="hs-alert-header">
                    <Tag tone={tone} label={badgeLabel} />
                    <span className="hs-alert-metric">{a.metric}</span>
                  </div>
                  <h2 className="hs-alert-title">{a.title}</h2>
                  <p className="hs-alert-detail">{a.detail}</p>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      <div className="hs-grid-2">
        <LineChart
          title="Kilo ve Kas Kütlesi Değişimi"
          xAxisLabel="Tarih"
          yAxisLabel="kg"
          series={overview.weight_series || []}
          onInspect={() => onNavigateTab('scale')}
        />
        <LineChart
          title="Dinlenme Puanı ve Kalp Hızı"
          xAxisLabel="Tarih"
          yAxisLabel="Puan / Nabız"
          series={overview.recovery_series || []}
          onInspect={() => onNavigateTab('insights')}
        />
      </div>

      <Table
        title="Son Günlerin Özeti"
        rowKey="date"
        pageSize={6}
        data={overview.daily_rows || []}
        emptyMessage="Seçili dönemde henüz günlük kayıt bulunmuyor."
        columns={[
          { key: 'date', header: 'Tarih', render: (row) => formatDateTR(row.date) },
          { key: 'weight_kg', header: 'Kilo (kg)', numeric: true },
          { key: 'body_fat_pct', header: 'Yağ (%)', numeric: true },
          { key: 'muscle_mass_kg', header: 'Kas (kg)', numeric: true },
          { key: 'steps', header: 'Adım', numeric: true },
          { key: 'sleep_hours', header: 'Uyku (sa)', numeric: true },
          {
            key: 'recovery_score',
            header: 'Durum',
            render: (row) => (
              <Tag
                tone={row.recovery_score >= 75 ? 'nominal' : row.recovery_score >= 55 ? 'warning' : 'critical'}
                label={
                  row.recovery_score >= 75
                    ? `İyi (${row.recovery_score})`
                    : row.recovery_score >= 55
                      ? `Orta (${row.recovery_score})`
                      : `Yorgun (${row.recovery_score})`
                }
              />
            ),
          },
        ]}
      />
    </DashboardTemplate>
  );
}
