import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import {
  BarChart,
  DetailTemplate,
  Panel,
  Select,
  StateBlock,
  Table,
  Tabs,
  Tag,
} from '../ui';

export function InsightsScreen({
  forcedState,
}: {
  forcedState?: 'default' | 'empty' | 'error';
}) {
  const [range, setRange] = useState('30d');
  const [activeSubTab, setActiveSubTab] = useState('correlations');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<any>(null);

  const loadInsights = useCallback(async () => {
    if (forcedState === 'error') {
      setLoading(false);
      setError('Analitik ve korelasyon mikroservisine ulaşılamadı (Test Hata Durumu).');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.getAnalyticsInsights({ range });
      if (forcedState === 'empty') {
        setInsights({
          ...res,
          window_status: 'pending',
          recovery_score: 0,
          recovery_status: 'pending',
          correlations: [],
          anomalies: [],
          rolling_series: [],
        });
      } else {
        setInsights(res);
      }
    } catch (err: any) {
      setError(err?.message || 'Anlamlandırma verileri alınamadı.');
    } finally {
      setLoading(false);
    }
  }, [forcedState, range]);

  useEffect(() => {
    loadInsights();
  }, [loadInsights]);

  if (loading) {
    return (
      <StateBlock
        state="loading"
        title="Anlamlandırma ve korelasyon motoru çalışıyor"
        description="Pearson r katsayıları, yağ/kas kaybı kalitesi ve otonom toparlanma skorları hesaplanıyor..."
      />
    );
  }

  if (error || !insights) {
    return (
      <StateBlock
        state="error"
        title="Anlamlandırma verileri yüklenemedi"
        description={error || 'Bilinmeyen hata'}
        onRetry={loadInsights}
      />
    );
  }

  const comp = insights.composition_quality || {};
  const barData = (insights.rolling_series || []).slice(-10).map((r: any) => ({
    date: r.date.slice(5),
    'Uyku (sa)': r.sleep_hours || 0,
    'Yağ (%)': r.body_fat_pct || 0,
  }));

  return (
    <DetailTemplate
      title="Biyometrik Anlamlandırma, Korelasyon ve Anomali Motoru"
      statusLabel={
        insights.window_status === 'pending'
          ? 'Döngü Penceresi Beklemede'
          : `Toparlanma: ${insights.recovery_score} / 100`
      }
      statusTone={
        insights.recovery_status === 'nominal'
          ? 'nominal'
          : insights.recovery_status === 'warning'
            ? 'warning'
            : 'neutral'
      }
      actionBar={
        <Select
          label="Analiz penceresi"
          value={range}
          onChange={setRange}
          options={[
            { value: '7d', label: 'Son 7 gün' },
            { value: '30d', label: 'Son 30 gün' },
            { value: '90d', label: 'Son 90 gün' },
            { value: 'cycle', label: 'Aktif döngü penceresi' },
          ]}
        />
      }
      kvItems={[
        { label: 'Kilo Değişim Kalitesi', value: comp.headline || '-' },
        { label: 'Net Ağırlık Değişimi', value: `${comp.total_weight_delta_kg ?? 0} kg` },
        { label: 'Yağ Kaybı Payı', value: `%${comp.fat_loss_share_pct ?? 0} (${comp.fat_mass_delta_kg ?? 0} kg)` },
        { label: 'Kas Değişim Payı', value: `%${comp.muscle_loss_share_pct ?? 0} (${comp.muscle_mass_delta_kg ?? 0} kg)` },
        { label: 'Vücut Suyu Değişimi', value: `${comp.water_pct_delta ?? 0} puan` },
        { label: 'Döngü Pencere Durumu', value: insights.window_status === 'active' ? 'Aktif Pencere' : 'Beklemede (Bölüm 6)' },
      ]}
    >
      <div className="hs-grid-2">
        <Panel title="Klinik Kompozisyon Yorumu (Renpho ES-26BB-B)">
          <p className="hs-page-subtitle">{comp.interpretation || 'Veri bekleniyor.'}</p>
        </Panel>

        <BarChart
          title="Uyku Süresi ve Vücut Yağ Oranı Kıyaslaması"
          indexBy="date"
          keys={['Uyku (sa)', 'Yağ (%)']}
          xAxisLabel="Tarih"
          yAxisLabel="Değer"
          data={barData}
        />
      </div>

      <Tabs
        ariaLabel="Anlamlandırma alt sekmeleri"
        selectedKey={activeSubTab}
        onSelectionChange={setActiveSubTab}
        items={[
          {
            id: 'correlations',
            label: 'Pearson (r) Çapraz Cihaz Korelasyonları',
            content: (
              <Table
                title="Cihazlar Arası Matematiksel Korelasyon Matrisi"
                rowKey="id"
                data={insights.correlations || []}
                emptyMessage="Korelasyon hesabı için aktif döngü penceresinde en az 3 günlük veri gereklidir."
                columns={[
                  { key: 'pair', header: 'Metrik Çifti (Cihaz Kaynakları)' },
                  { key: 'r_value', header: 'Pearson r', numeric: true },
                  {
                    key: 'strength',
                    header: 'İlişki Gücü',
                    render: (row) => (
                      <Tag
                        tone={Math.abs(row.r_value) >= 0.4 ? 'nominal' : 'neutral'}
                        label={row.strength}
                      />
                    ),
                  },
                  { key: 'interpretation', header: 'Fizyolojik Anlamlandırma' },
                ]}
              />
            ),
          },
          {
            id: 'anomalies',
            label: 'Anomali ve Hedef Uyarı Geçmişi',
            content: (
              <Table
                title="Otomatik Tespit Edilen Biyometrik Sapmalar"
                rowKey="id"
                data={insights.anomalies || []}
                emptyMessage="Anomali kaydı bulunamadı."
                columns={[
                  { key: 'date', header: 'Tarih' },
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
                        label={row.severity}
                      />
                    ),
                  },
                  { key: 'title', header: 'Başlık' },
                  { key: 'metric', header: 'Ölçülen Değer' },
                  { key: 'source', header: 'Kaynak Cihaz' },
                  { key: 'detail', header: 'Klinik Değerlendirme' },
                ]}
              />
            ),
          },
        ]}
      />
    </DetailTemplate>
  );
}
