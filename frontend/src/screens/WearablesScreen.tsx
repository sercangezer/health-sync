import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import {
  DetailTemplate,
  FormTemplate,
  Input,
  Select,
  StateBlock,
  Table,
  Tag,
  Toast,
} from '../ui';

export function WearablesScreen({
  forcedState,
}: {
  forcedState?: 'default' | 'empty' | 'error';
}) {
  const [comparison, setComparison] = useState<any>(null);
  const [rules, setRules] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [cycleDateError, setCycleDateError] = useState<string | undefined>(undefined);

  const loadWearables = useCallback(async () => {
    if (forcedState === 'error') {
      setLoading(false);
      setError('Birleştirme (reconciliation) mikroservisine ulaşılamadı (Test Hata Durumu).');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [comp, rl] = await Promise.all([
        apiClient.getWearablesComparison({ days: 30 }),
        apiClient.getReconciliationRules(),
      ]);
      setComparison(forcedState === 'empty' ? { ...comp, rows: [] } : comp);
      setRules(rl);
    } catch (err: any) {
      setError(err?.message || 'Cihaz karşılaştırma verileri alınamadı.');
    } finally {
      setLoading(false);
    }
  }, [forcedState]);

  useEffect(() => {
    loadWearables();
  }, [loadWearables]);

  const handleSaveRules = async () => {
    if (!rules) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rules.cycle_start_date || '')) {
      setCycleDateError('Tarih YYYY-AA-GG formatında olmalıdır.');
      return;
    }
    setCycleDateError(undefined);
    try {
      const updated = await apiClient.updateReconciliationRules({
        weight_priority: rules.weight_priority,
        sleep_priority: rules.sleep_priority,
        activity_priority: rules.activity_priority,
        heart_priority: rules.heart_priority,
        merge_strategy: rules.merge_strategy,
        cycle_start_date: rules.cycle_start_date,
        target_weight_kg: Number(rules.target_weight_kg),
        height_cm: Number(rules.height_cm),
      });
      setRules(updated);
      setToastMsg('Cihaz öncelik kuralları ve döngü penceresi güncellendi.');
      await loadWearables();
    } catch (err: any) {
      setToastMsg(err?.message || 'Kurallar güncellenemedi.');
    }
  };

  if (loading) {
    return (
      <StateBlock
        state="loading"
        title="Samsung Galaxy Watch6 ve Garmin Smart Band verileri karşılaştırılıyor"
        description="Günlük adım, uyku, dinlenik nabız ve HRV sapmaları hesaplanıyor..."
      />
    );
  }

  if (error || !comparison || !rules) {
    return (
      <StateBlock
        state="error"
        title="Giyilebilir cihaz verileri yüklenemedi"
        description={error || 'Bilinmeyen hata'}
        onRetry={loadWearables}
      />
    );
  }

  const sum = comparison.summary || {};

  return (
    <DetailTemplate
      title="Samsung Galaxy Watch6 vs. Garmin Smart Band Yan Yana Kıyaslama"
      statusLabel={`Sensör Uyum Skoru: %${comparison.agreement_score}`}
      statusTone={comparison.agreement_score >= 80 ? 'nominal' : 'warning'}
      kvItems={[
        { label: 'Karşılaştırılan Gün', value: `${sum.compared_days ?? 0} gün` },
        { label: 'Ortalama Adım Farkı', value: `%${sum.avg_steps_diff_pct ?? 0}` },
        { label: 'Ortalama Uyku Farkı', value: `${sum.avg_sleep_diff_hours ?? 0} saat` },
        { label: 'Ortalama RHR Farkı', value: `${sum.avg_rhr_diff_bpm ?? 0} bpm` },
        { label: 'Birleştirme Modu', value: rules.merge_strategy },
        { label: 'Aktif Döngü Başlangıcı', value: rules.cycle_start_date },
      ]}
    >
      <Toast message={toastMsg} onDismiss={() => setToastMsg(null)} />

      <Table
        title="Günlük Sensör Kıyaslama Tablosu (Watch6 vs. Garmin)"
        rowKey="date"
        data={comparison.rows || []}
        emptyMessage="Karşılaştırılacak günlük giyilebilir cihaz kaydı bulunamadı."
        columns={[
          { key: 'date', header: 'Tarih' },
          { key: 'watch6_steps', header: 'Watch6 Adım', numeric: true },
          { key: 'garmin_steps', header: 'Garmin Adım', numeric: true },
          { key: 'steps_diff_pct', header: 'Adım Fark (%)', numeric: true },
          { key: 'watch6_sleep_hours', header: 'Watch6 Uyku (sa)', numeric: true },
          { key: 'garmin_sleep_hours', header: 'Garmin Uyku (sa)', numeric: true },
          { key: 'watch6_rhr_bpm', header: 'Watch6 RHR', numeric: true },
          { key: 'garmin_rhr_bpm', header: 'Garmin RHR', numeric: true },
          { key: 'watch6_hrv_ms', header: 'Watch6 HRV', numeric: true },
          { key: 'garmin_hrv_ms', header: 'Garmin HRV', numeric: true },
          { key: 'garmin_body_battery', header: 'Body Battery', numeric: true },
          {
            key: 'agreement_pct',
            header: 'Uyum (%)',
            numeric: true,
            render: (row) => (
              <Tag
                tone={row.agreement_pct >= 85 ? 'nominal' : row.agreement_pct >= 70 ? 'warning' : 'critical'}
                label={`%${row.agreement_pct}`}
              />
            ),
          },
        ]}
      />

      <FormTemplate
        title="Cihaz Önceliklendirme Kuralları ve Takip Döngüsü Penceresi (Bölüm 6)"
        description="Aynı gün hem Galaxy Watch6 hem Garmin Smart Band veri ürettiğinde Günlük Öz tablosunda hangi cihazın baz alınacağını belirleyin."
        onSubmit={handleSaveRules}
        onCancel={loadWearables}
        submitLabel="Kuralları Uygula ve Birleştir"
        cancelLabel="Varsayılana Dön"
      >
        <Select
          label="Çakışan Metrik Birleştirme Stratejisi"
          value={rules.merge_strategy}
          onChange={(val) => setRules({ ...rules, merge_strategy: val })}
          options={[
            { value: 'priority', label: 'Cihaz Öncelik Sırası (Önerilen)' },
            { value: 'average', label: 'İki Cihazın Ortalaması' },
            { value: 'max', label: 'En Yüksek Ölçüm Değeri' },
          ]}
        />

        <Select
          label="Uyku, Stres ve Toparlanma Öncelikli Cihaz"
          value={rules.sleep_priority?.[0] || 'garmin_band'}
          onChange={(val) =>
            setRules({
              ...rules,
              sleep_priority: val === 'garmin_band' ? ['garmin_band', 'galaxy_watch6'] : ['galaxy_watch6', 'garmin_band'],
            })
          }
          options={[
            { value: 'garmin_band', label: '1. Garmin Smart Band -> 2. Samsung Galaxy Watch6' },
            { value: 'galaxy_watch6', label: '1. Samsung Galaxy Watch6 -> 2. Garmin Smart Band' },
          ]}
        />

        <Select
          label="Adım, Aktif Kalori ve SpO2 Öncelikli Cihaz"
          value={rules.activity_priority?.[0] || 'galaxy_watch6'}
          onChange={(val) =>
            setRules({
              ...rules,
              activity_priority: val === 'galaxy_watch6' ? ['galaxy_watch6', 'garmin_band'] : ['garmin_band', 'galaxy_watch6'],
            })
          }
          options={[
            { value: 'galaxy_watch6', label: '1. Samsung Galaxy Watch6 -> 2. Garmin Smart Band' },
            { value: 'garmin_band', label: '1. Garmin Smart Band -> 2. Samsung Galaxy Watch6' },
          ]}
        />

        <Input
          label="Aktif Takip Döngüsü Başlangıç Tarihi (YYYY-AA-GG)"
          value={String(rules.cycle_start_date || '')}
          onChange={(val) => setRules({ ...rules, cycle_start_date: val })}
          error={cycleDateError}
        />

        <Input
          label="Hedef Kilo (kg)"
          value={String(rules.target_weight_kg || '')}
          onChange={(val) => setRules({ ...rules, target_weight_kg: val })}
        />

        <Input
          label="Boy (cm)"
          value={String(rules.height_cm || '')}
          onChange={(val) => setRules({ ...rules, height_cm: val })}
        />
      </FormTemplate>
    </DetailTemplate>
  );
}
