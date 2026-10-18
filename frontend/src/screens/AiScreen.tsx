import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import {
  Button,
  CodeBlock,
  DetailTemplate,
  Icon,
  Panel,
  Select,
  StateBlock,
  Table,
  Tabs,
  Tag,
  Toast,
} from '../ui';

export function AiScreen({
  forcedState,
}: {
  forcedState?: 'default' | 'empty' | 'error';
}) {
  const [focusArea, setFocusArea] = useState('holistic');
  const [subTab, setSubTab] = useState('reports');
  const [promptData, setPromptData] = useState<any>(null);
  const [reports, setReports] = useState<any[]>([]);
  const [syncStatus, setSyncStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const loadAiBundle = useCallback(async () => {
    if (forcedState === 'error') {
      setLoading(false);
      setError('AI Danışman mikroservisi yanıt vermiyor (Test Hata Durumu).');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [pr, rp, st] = await Promise.all([
        apiClient.getAiPrompts(),
        apiClient.listAiReports(),
        apiClient.getSyncStatus(),
      ]);
      setPromptData(pr);
      setReports(forcedState === 'empty' ? [] : rp.items || []);
      setSyncStatus(st);
    } catch (err: any) {
      setError(err?.message || 'AI danışman verileri alınamadı.');
    } finally {
      setLoading(false);
    }
  }, [forcedState]);

  useEffect(() => {
    loadAiBundle();
  }, [loadAiBundle]);

  const handleGenerateReport = async () => {
    try {
      const created = await apiClient.createAiAnalysis({ focus_area: focusArea });
      setReports((prev) => [created, ...prev]);
      setToastMsg('Yeni çoklu cihaz AI anlamlandırma raporu üretildi.');
    } catch (err: any) {
      setToastMsg(err?.message || 'AI raporu üretilemedi.');
    }
  };

  const handleCopyPrompt = async () => {
    if (!promptData?.prompt_text) return;
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(promptData.prompt_text);
      }
      setToastMsg('Çoklu cihaz AI prompt metni panoya kopyalandı.');
    } catch {
      setToastMsg('Prompt metni seçildi.');
    }
  };

  const handleSimulateWatch6Webhook = async () => {
    try {
      const res = await apiClient.triggerSync({
        provider: 'watch6',
      });
      setToastMsg(res.message);
      await loadAiBundle();
    } catch (err: any) {
      setToastMsg(err?.message || 'Watch6 senkronizasyon kontrolü başarısız oldu.');
    }
  };

  if (loading) {
    return (
      <StateBlock
        state="loading"
        title="AI Danışman ve Otomasyon Merkezi yükleniyor"
        description="Çoklu cihaz anlamlandırma raporları ve prompt şablonu hazırlanıyor..."
      />
    );
  }

  if (error || !promptData) {
    return (
      <StateBlock
        state="error"
        title="AI Danışman yüklenemedi"
        description={error || 'Bilinmeyen hata'}
        onRetry={loadAiBundle}
      />
    );
  }

  const latestReport = reports[0];

  return (
    <DetailTemplate
      title="AI Danışman, Prompt Stüdyosu ve Tam Otomatik Senkronizasyon Merkezi"
      statusLabel="ai-advisor-service Aktif"
      statusTone="nominal"
      actionBar={
        <>
          <Select
            label="Analiz odağı"
            value={focusArea}
            onChange={setFocusArea}
            options={[
              { value: 'holistic', label: 'Bütüncül Çoklu Cihaz Analizi' },
              { value: 'body_composition', label: 'Renpho ES-26BB-B Yağ/Kas Kalitesi' },
              { value: 'recovery_sleep', label: 'Garmin & Watch6 Toparlanma ve Uyku' },
              { value: 'wearable_calibration', label: 'Watch6 vs. Garmin Sensör Kalibrasyonu' },
            ]}
          />
          <Button variant="default" onPress={handleSimulateWatch6Webhook}>
            <Icon name="webhook" />
            <span>Watch6 Webhook doğrula</span>
          </Button>
          <Button variant="primary" onPress={handleGenerateReport}>
            <Icon name="auto_awesome" />
            <span>Yeni AI raporu üret</span>
          </Button>
        </>
      }
      kvItems={[
        { label: 'Aktif Veri Günü', value: `${promptData.data_days_count} gün` },
        { label: 'Kayıtlı AI Raporu', value: `${reports.length} rapor` },
        { label: 'Watch6 Webhook Ucu', value: promptData.webhook_url_hint },
        { label: 'Otomatik Çekim Periyodu', value: `${syncStatus?.auto_sync_interval_minutes || 60} dakika` },
      ]}
    >
      <Toast message={toastMsg} onDismiss={() => setToastMsg(null)} />

      <Tabs
        ariaLabel="AI ve otomasyon sekmeleri"
        selectedKey={subTab}
        onSelectionChange={setSubTab}
        items={[
          {
            id: 'reports',
            label: 'Üretilen AI Anlamlandırma Raporları',
            content: (
              <div className="hs-template">
                {latestReport ? (
                  <Panel
                    title={`Son Rapor (#${latestReport.id}) — Odak: ${latestReport.focus_area} (${latestReport.source_mode})`}
                  >
                    <CodeBlock content={latestReport.summary_markdown} />
                  </Panel>
                ) : null}

                <Table
                  title="Geçmiş AI Yorumlama Raporları"
                  rowKey="id"
                  data={reports}
                  emptyMessage="Henüz üretilmiş AI anlamlandırma raporu bulunmuyor."
                  columns={[
                    { key: 'id', header: 'Rapor No', numeric: true },
                    { key: 'created_at', header: 'Üretim Zamanı' },
                    { key: 'focus_area', header: 'Odak Alanı' },
                    { key: 'source_mode', header: 'Motor' },
                    { key: 'summary_markdown', header: 'Rapor Özeti' },
                  ]}
                />
              </div>
            ),
          },
          {
            id: 'prompt',
            label: 'Kopyalanabilir AI Prompt Stüdyosu',
            content: (
              <Panel
                title="Güncel Çoklu Cihaz Verileriyle Doldurulmuş Hazır AI Prompt'u"
                actions={
                  <Button variant="primary" onPress={handleCopyPrompt}>
                    <Icon name="content_copy" />
                    <span>Prompt metnini kopyala</span>
                  </Button>
                }
              >
                <CodeBlock content={promptData.prompt_text} />
              </Panel>
            ),
          },
          {
            id: 'automation',
            label: 'Cihaz Senkronizasyon Durumu ve Otomasyon Günlüğü',
            content: (
              <div className="hs-template">
                <Table
                  title="Cihaz Mikroservisleri Durumu"
                  rowKey="provider"
                  data={syncStatus?.providers || []}
                  columns={[
                    { key: 'device_name', header: 'Donanım' },
                    { key: 'microservice', header: 'Mikroservis' },
                    { key: 'mode', header: 'Otomasyon Yöntemi' },
                    { key: 'records_count', header: 'Kayıt Sayısı', numeric: true },
                    {
                      key: 'circuit_state',
                      header: 'Devre Kesici',
                      render: (row) => (
                        <Tag
                          tone={row.circuit_state === 'CLOSED' ? 'nominal' : 'warning'}
                          label={row.circuit_state}
                        />
                      ),
                    },
                  ]}
                />

                <Table
                  title="Son Otomatik Senkronizasyon Kayıtları (SyncLog)"
                  rowKey="id"
                  data={syncStatus?.recent_logs || []}
                  columns={[
                    { key: 'created_at', header: 'Zaman' },
                    { key: 'provider', header: 'Sağlayıcı' },
                    {
                      key: 'status',
                      header: 'Durum',
                      render: (row) => (
                        <Tag tone={row.status === 'nominal' ? 'nominal' : 'warning'} label={row.status} />
                      ),
                    },
                    { key: 'records_processed', header: 'İşlenen Kayıt', numeric: true },
                    { key: 'message', header: 'Açıklama' },
                  ]}
                />
              </div>
            ),
          },
        ]}
      />
    </DetailTemplate>
  );
}
