import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import {
  BarChart,
  DetailTemplate,
  formatDateTR,
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
  const clinical = insights.clinical_evaluation;
  const barData = (insights.rolling_series || []).slice(-10).map((r: any) => ({
    date: r.date.slice(5),
    'Uyku (sa)': r.sleep_hours || 0,
    'Yağ (%)': r.body_fat_pct || 0,
  }));

  return (
    <DetailTemplate
      title="Vücut Analizi"
      statusLabel={
        insights.window_status === 'pending'
          ? 'Veri Bekleniyor'
          : `Dinlenme Puanı: ${insights.recovery_score} / 100`
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
      }
      kvItems={[
        { label: 'Kilo Değişimi', value: `${comp.total_weight_delta_kg ?? 0} kg` },
        { label: 'Yağ Kaybı', value: `${comp.fat_mass_delta_kg ?? 0} kg (%${comp.fat_loss_share_pct ?? 0})` },
        { label: 'Kas Değişimi', value: `${comp.muscle_mass_delta_kg ?? 0} kg` },
        { label: 'Su Değişimi', value: `${comp.water_pct_delta ?? 0} puan` },
      ]}
    >
      {clinical?.pillars?.length > 0 && forcedState !== 'empty' ? (
        <Panel title="Uzman Hekim Branş Değerlendirmesi">
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

      <div className="hs-grid-2">
        <Panel title="Vücut Kompozisyonu Özeti">
          <p className="hs-page-subtitle">{comp.interpretation || 'Veri bekleniyor.'}</p>
        </Panel>

        <BarChart
          title="Uyku Süresi ve Yağ Oranı"
          indexBy="date"
          keys={['Uyku (sa)', 'Yağ (%)']}
          xAxisLabel="Tarih"
          yAxisLabel="Değer"
          data={barData}
        />
      </div>

      <Tabs
        ariaLabel="Analiz sekmeleri"
        selectedKey={activeSubTab}
        onSelectionChange={setActiveSubTab}
        items={[
          {
            id: 'correlations',
            label: 'Veri İlişkileri',
            content: (
              <Table
                title="Uyku, Hareket ve Kilo Arasındaki Bağlantılar"
                rowKey="id"
                data={insights.correlations || []}
                emptyMessage="İlişki analizi için en az 3 günlük veri gereklidir."
                columns={[
                  { key: 'pair', header: 'Karşılaştırılan Veriler' },
                  {
                    key: 'strength',
                    header: 'Bağlantı',
                    render: (row) => (
                      <Tag
                        tone={Math.abs(row.r_value) >= 0.4 ? 'nominal' : 'neutral'}
                        label={row.strength}
                      />
                    ),
                  },
                  { key: 'interpretation', header: 'Ne Anlama Geliyor?' },
                ]}
              />
            ),
          },
          {
            id: 'anomalies',
            label: 'Uyarılar',
            content: (
              <Table
                title="Tespit Edilen Uyarılar"
                rowKey="id"
                data={insights.anomalies || []}
                emptyMessage="Uyarı kaydı bulunamadı."
                columns={[
                  { key: 'date', header: 'Tarih', render: (row) => formatDateTR(row.date) },
                  {
                    key: 'severity',
                    header: 'Durum',
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
                            ? 'TEHLİKE'
                            : row.severity === 'warning'
                              ? 'UYARI'
                              : 'İYİ'
                        }
                      />
                    ),
                  },
                  { key: 'title', header: 'Başlık' },
                  { key: 'metric', header: 'Ölçüm' },
                  { key: 'detail', header: 'Açıklama' },
                ]}
              />
            ),
          },
        ]}
      />
    </DetailTemplate>
  );
}
