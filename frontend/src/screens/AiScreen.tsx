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
      title="Yapay Zeka Danışmanı"
      statusLabel="Hazır"
      statusTone="nominal"
      actionBar={
        <>
          <Select
            label="Odak"
            value={focusArea}
            onChange={setFocusArea}
            options={[
              { value: 'holistic', label: 'Genel Sağlık Özeti' },
              { value: 'body_composition', label: 'Kilo, Yağ ve Kas' },
              { value: 'recovery_sleep', label: 'Uyku ve Dinlenme' },
              { value: 'wearable_calibration', label: 'Cihaz Uyumu' },
            ]}
          />
          <Button variant="default" onPress={handleSimulateWatch6Webhook}>
            <Icon name="webhook" />
            <span>Saati Güncelle</span>
          </Button>
          <Button variant="primary" onPress={handleGenerateReport}>
            <Icon name="auto_awesome" />
            <span>Rapor Üret</span>
          </Button>
        </>
      }
      kvItems={[
        { label: 'Veri Günü', value: `${promptData.data_days_count} gün` },
        { label: 'Kayıtlı Rapor', value: `${reports.length} rapor` },
        { label: 'Otomatik Çekim', value: `${syncStatus?.auto_sync_interval_minutes || 60} dk` },
      ]}
    >
      <Toast message={toastMsg} onDismiss={() => setToastMsg(null)} />

      <Tabs
        ariaLabel="Yapay zeka sekmeleri"
        selectedKey={subTab}
        onSelectionChange={setSubTab}
        items={[
          {
            id: 'reports',
            label: 'AI Raporları',
            content: (
              <div className="hs-template">
                {latestReport ? (
                  <Panel
                    title={`Güncel Değerlendirme (#${latestReport.id})`}
                  >
                    <CodeBlock content={latestReport.summary_markdown} />
                  </Panel>
                ) : (
                  <Table
                    title="Değerlendirme Raporları"
                    rowKey="id"
                    data={reports}
                    emptyMessage="Henüz üretilmiş yapay zeka raporu bulunmuyor."
                    columns={[
                      { key: 'id', header: 'No', numeric: true },
                      { key: 'created_at', header: 'Tarih' },
                      { key: 'focus_area', header: 'Konu' },
                    ]}
                  />
                )}
              </div>
            ),
          },
          {
            id: 'prompt',
            label: 'Hazır Prompt',
            content: (
              <Panel
                title="Kopyalanabilir Yapay Zeka Metni"
                actions={
                  <Button variant="primary" onPress={handleCopyPrompt}>
                    <Icon name="content_copy" />
                    <span>Kopyala</span>
                  </Button>
                }
              >
                <CodeBlock content={promptData.prompt_text} />
              </Panel>
            ),
          },
          {
            id: 'automation',
            label: 'Senkronizasyon',
            content: (
              <div className="hs-template">
                <Table
                  title="Son Senkronizasyon İşlemleri"
                  rowKey="id"
                  pageSize={6}
                  data={syncStatus?.recent_logs || []}
                  columns={[
                    { key: 'created_at', header: 'Zaman' },
                    { key: 'provider', header: 'Cihaz' },
                    {
                      key: 'status',
                      header: 'Durum',
                      render: (row) => (
                        <Tag tone={row.status === 'nominal' ? 'nominal' : 'warning'} label={row.status === 'nominal' ? 'Başarılı' : 'Uyarı'} />
                      ),
                    },
                    { key: 'records_processed', header: 'Kayıt', numeric: true },
                    { key: 'message', header: 'Bilgi' },
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
