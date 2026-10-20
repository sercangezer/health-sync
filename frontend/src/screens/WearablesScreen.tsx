import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import {
  DetailTemplate,
  formatDateTR,
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
      title="Saat ve Bileklik Kıyaslama"
      statusLabel={`Uyum: %${comparison.agreement_score}`}
      statusTone={comparison.agreement_score >= 80 ? 'nominal' : 'warning'}
      kvItems={[
        { label: 'Karşılaştırılan Gün', value: `${sum.compared_days ?? 0} gün` },
        { label: 'Adım Farkı', value: `%${sum.avg_steps_diff_pct ?? 0}` },
        { label: 'Uyku Farkı', value: `${sum.avg_sleep_diff_hours ?? 0} saat` },
        { label: 'Nabız Farkı', value: `${sum.avg_rhr_diff_bpm ?? 0} bpm` },
      ]}
    >
      <Toast message={toastMsg} onDismiss={() => setToastMsg(null)} />

      <Table
        title="Günlük Ölçüm Kıyaslaması"
        rowKey="date"
        pageSize={7}
        data={comparison.rows || []}
        emptyMessage="Karşılaştırılacak günlük cihaz kaydı bulunamadı."
        columns={[
          { key: 'date', header: 'Tarih', render: (row) => formatDateTR(row.date) },
          { key: 'watch6_steps', header: 'Watch6 Adım', numeric: true },
          { key: 'garmin_steps', header: 'Garmin Adım', numeric: true },
          { key: 'watch6_sleep_hours', header: 'Watch6 Uyku', numeric: true },
          { key: 'garmin_sleep_hours', header: 'Garmin Uyku', numeric: true },
          { key: 'watch6_rhr_bpm', header: 'Watch6 Nabız', numeric: true },
          { key: 'garmin_rhr_bpm', header: 'Garmin Nabız', numeric: true },
          {
            key: 'agreement_pct',
            header: 'Uyum',
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
        title="Cihaz Önceliği ve Hedefler"
        description="Aynı gün iki cihazdan veri geldiğinde hangi cihazın öncelikli olacağını seçin."
        onSubmit={handleSaveRules}
        onCancel={loadWearables}
        submitLabel="Kaydet"
        cancelLabel="Sıfırla"
      >
        <Select
          label="Birleştirme Yöntemi"
          value={rules.merge_strategy}
          onChange={(val) => setRules({ ...rules, merge_strategy: val })}
          options={[
            { value: 'priority', label: 'Öncelik Sırası (Önerilen)' },
            { value: 'average', label: 'İki Cihazın Ortalaması' },
            { value: 'max', label: 'En Yüksek Ölçüm' },
          ]}
        />

        <Select
          label="Uyku ve Dinlenme Önceliği"
          value={rules.sleep_priority?.[0] || 'garmin_band'}
          onChange={(val) =>
            setRules({
              ...rules,
              sleep_priority: val === 'garmin_band' ? ['garmin_band', 'galaxy_watch6'] : ['galaxy_watch6', 'garmin_band'],
            })
          }
          options={[
            { value: 'garmin_band', label: 'Önce Garmin Bileklik' },
            { value: 'galaxy_watch6', label: 'Önce Galaxy Watch6' },
          ]}
        />

        <Select
          label="Adım ve Kalori Önceliği"
          value={rules.activity_priority?.[0] || 'galaxy_watch6'}
          onChange={(val) =>
            setRules({
              ...rules,
              activity_priority: val === 'galaxy_watch6' ? ['galaxy_watch6', 'garmin_band'] : ['garmin_band', 'galaxy_watch6'],
            })
          }
          options={[
            { value: 'galaxy_watch6', label: 'Önce Galaxy Watch6' },
            { value: 'garmin_band', label: 'Önce Garmin Bileklik' },
          ]}
        />

        <Input
          label={`Takip Başlangıç Tarihi (${formatDateTR(rules.cycle_start_date)})`}
          value={String(rules.cycle_start_date || '')}
          onChange={(val) => setRules({ ...rules, cycle_start_date: val })}
          error={cycleDateError}
        />
      </FormTemplate>
    </DetailTemplate>
  );
}
