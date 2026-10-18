import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import {
  Button,
  CodeBlock,
  DetailTemplate,
  Icon,
  Input,
  Panel,
  StateBlock,
  Table,
  Tag,
  Toast,
} from '../ui';

export function SettingsScreen({
  forcedState,
}: {
  forcedState?: 'default' | 'empty' | 'error';
}) {
  const [settings, setSettings] = useState<any>(null);
  const [heartbeat, setHeartbeat] = useState<any>(null);
  const [formState, setFormState] = useState({
    renpho_email: '',
    renpho_password: '',
    garmin_email: '',
    garmin_password: '',
    gemini_api_key: '',
    webhook_secret: '',
    watch_export_dir: '/data/watch_exports',
    auto_sync_interval_minutes: '60',
    webhook_expected_interval_minutes: '60',
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [intervalError, setIntervalError] = useState<string | undefined>(undefined);
  const [probing, setProbing] = useState(false);

  const loadSettingsAndHeartbeat = useCallback(async () => {
    if (forcedState === 'error') {
      setLoading(false);
      setError('Ayarlar ve Webhook Heartbeat mikroservisine ulaşılamadı (Test Hata Durumu).');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [cfg, hb] = await Promise.all([
        apiClient.getIntegrationSettings(),
        apiClient.getWebhookHeartbeat(),
      ]);
      setSettings(cfg);
      setHeartbeat(
        forcedState === 'empty'
          ? { ...hb, recent_heartbeats: [], total_heartbeats_24h: 0 }
          : hb,
      );
      setFormState({
        renpho_email: cfg.renpho_email || '',
        renpho_password: '',
        garmin_email: cfg.garmin_email || '',
        garmin_password: '',
        gemini_api_key: '',
        webhook_secret: '',
        watch_export_dir: cfg.watch_export_dir || '/data/watch_exports',
        auto_sync_interval_minutes: String(cfg.auto_sync_interval_minutes ?? 60),
        webhook_expected_interval_minutes: String(cfg.webhook_expected_interval_minutes ?? 60),
      });
    } catch (err: any) {
      setError(err?.message || 'Bağlantı ayarları ve heartbeat durumu alınamadı.');
    } finally {
      setLoading(false);
    }
  }, [forcedState]);

  useEffect(() => {
    loadSettingsAndHeartbeat();
  }, [loadSettingsAndHeartbeat]);

  const handleSaveSettings = async () => {
    const autoMin = Number(formState.auto_sync_interval_minutes);
    const hbMin = Number(formState.webhook_expected_interval_minutes);
    if (Number.isNaN(autoMin) || autoMin < 5 || autoMin > 1440 || Number.isNaN(hbMin) || hbMin < 5 || hbMin > 1440) {
      setIntervalError('Senkronizasyon ve heartbeat aralıkları 5 ile 1440 dakika arasında olmalıdır.');
      return;
    }
    setIntervalError(undefined);
    try {
      const updated = await apiClient.updateIntegrationSettings({
        renpho_email: formState.renpho_email.trim(),
        renpho_password: formState.renpho_password.trim() || undefined,
        garmin_email: formState.garmin_email.trim(),
        garmin_password: formState.garmin_password.trim() || undefined,
        gemini_api_key: formState.gemini_api_key.trim() || undefined,
        webhook_secret: formState.webhook_secret.trim() || undefined,
        watch_export_dir: formState.watch_export_dir.trim() || '/data/watch_exports',
        auto_sync_interval_minutes: autoMin,
        webhook_expected_interval_minutes: hbMin,
      });
      setSettings(updated);
      setFormState((prev) => ({
        ...prev,
        renpho_password: '',
        garmin_password: '',
        gemini_api_key: '',
        webhook_secret: '',
      }));
      setToastMsg('Cihaz kimlik bilgileri ve webhook heartbeat ayarları kaydedildi.');
      const freshHb = await apiClient.getWebhookHeartbeat();
      setHeartbeat(freshHb);
    } catch (err: any) {
      setToastMsg(err?.message || 'Ayarlar güncellenemedi.');
    }
  };

  const handleSendHeartbeatProbe = async () => {
    setProbing(true);
    try {
      const updatedHb = await apiClient.sendWebhookHeartbeat({
        source: 'galaxy_watch6',
        device_label: 'Samsung Galaxy Watch6 (Canlı Heartbeat Yoklaması)',
        event_type: 'heartbeat',
        records_received: 1,
        latency_ms: 1.2,
        payload_summary: 'Ayarlar sekmesinden manuel canlılık (heartbeat) doğrulaması gönderildi.',
      });
      setHeartbeat(updatedHb);
      setToastMsg('Webhook canlılık (heartbeat) sinyali başarıyla doğrulandı.');
    } catch (err: any) {
      setToastMsg(err?.message || 'Heartbeat sinyali gönderilemedi.');
    } finally {
      setProbing(false);
    }
  };

  if (loading) {
    return (
      <StateBlock
        state="loading"
        title="Cihaz bağlantı ayarları ve Webhook Heartbeat durumu yükleniyor"
        description="Renpho, Garmin, Galaxy Watch6 kimlik durumları ve son sinyaller kontrol ediliyor..."
      />
    );
  }

  if (error || !settings || !heartbeat) {
    return (
      <StateBlock
        state="error"
        title="Ayarlar ve Webhook Heartbeat bilgileri alınamadı"
        description={error || 'Bilinmeyen hata'}
        onRetry={loadSettingsAndHeartbeat}
      />
    );
  }

  const isHealthy = heartbeat.overall_status === 'healthy';
  const statusTone = isHealthy ? 'nominal' : heartbeat.overall_status === 'stale' ? 'warning' : 'neutral';
  const statusText = isHealthy
    ? 'Webhook Heartbeat: CANLI'
    : heartbeat.overall_status === 'stale'
      ? 'Webhook Heartbeat: GECİKMELİ'
      : 'Webhook Heartbeat: BEKLENİYOR';

  const curlSnippet = `curl -X POST ${window.location.origin}/api/webhook/heartbeat \\
  -H "Content-Type: application/json" \\
  -d '{"source":"galaxy_watch6","device_label":"Samsung Galaxy Watch6","event_type":"heartbeat","records_received":1,"payload_summary":"Health Connect arka plan sinyali"}'`;

  return (
    <DetailTemplate
      title="Cihaz Bağlantı Ayarları ve Webhook Heartbeat İzleyici"
      statusLabel={statusText}
      statusTone={statusTone}
      actionBar={
        <>
          <Button
            variant="primary"
            onPress={handleSendHeartbeatProbe}
            disabled={probing}
            testId="send-heartbeat-btn"
          >
            <Icon name="monitor_heart" />
            <span>{probing ? 'Test Gönderiliyor...' : 'Canlı Heartbeat Testi Gönder'}</span>
          </Button>
          <Button variant="default" onPress={loadSettingsAndHeartbeat} testId="refresh-heartbeat-btn">
            <Icon name="refresh" />
            <span>Durumu Yenile</span>
          </Button>
        </>
      }
      kvItems={[
        { label: 'Webhook Veri Uç Noktası', value: heartbeat.webhook_ingest_url },
        { label: 'Heartbeat Uç Noktası', value: heartbeat.webhook_heartbeat_url },
        {
          label: 'Son Sinyal Yaşı',
          value: `${heartbeat.seconds_since_last_heartbeat} sn önce (Eşik: ${heartbeat.expected_interval_minutes} dk)`,
        },
        {
          label: 'Son 24s Heartbeat / Kayıt',
          value: `${heartbeat.total_heartbeats_24h} sinyal / ${heartbeat.total_records_ingested_24h} kayıt`,
        },
        {
          label: 'Renpho ES-26BB-B Bulut',
          value: settings.has_renpho_password ? `Aktif (${settings.renpho_email || 'Tanımlı'})` : 'BLE / Yerel Mod',
        },
        {
          label: 'Garmin Connect Bulut',
          value: settings.has_garmin_password ? `Aktif (${settings.garmin_email || 'Tanımlı'})` : 'Köprü / Yerel Mod',
        },
      ]}
    >
      <Toast message={toastMsg} onDismiss={() => setToastMsg(null)} />

      <div className="hs-grid-2">
        <Panel
          title="1. Renpho ES-26BB-B Akıllı Tartı"
          actions={
            <Tag
              tone={settings.has_renpho_password ? 'nominal' : 'neutral'}
              label={settings.has_renpho_password ? 'Bulut Hesabı Bağlı' : 'BLE / Hesap Bekleniyor'}
            />
          }
        >
          <p className="hs-page-subtitle">
            Renpho Health mobil uygulama hesabınızı girin. 13 vücut kompozisyonu metriği buluttan otomatik çekilir.
          </p>
          <Input
            label="Renpho E-posta Adresi"
            value={formState.renpho_email}
            placeholder="ornek@eposta.com"
            onChange={(val) => setFormState({ ...formState, renpho_email: val })}
            testId="input-renpho-email"
          />
          <Input
            label={`Renpho Parolası (Durum: ${settings.renpho_password_masked})`}
            type="password"
            value={formState.renpho_password}
            placeholder="Yeni parola girin veya korumak için boş bırakın"
            onChange={(val) => setFormState({ ...formState, renpho_password: val })}
            testId="input-renpho-password"
          />
          <div className="hs-filter-bar">
            <Button variant="primary" onPress={handleSaveSettings} testId="save-renpho-btn">
              <Icon name="save" />
              <span>Renpho Ayarlarını Kaydet</span>
            </Button>
          </div>
        </Panel>

        <Panel
          title="2. Garmin Smart Band (Garmin Connect)"
          actions={
            <Tag
              tone={settings.has_garmin_password ? 'nominal' : 'neutral'}
              label={settings.has_garmin_password ? 'Bulut Hesabı Bağlı' : 'Hesap Bekleniyor'}
            />
          }
        >
          <p className="hs-page-subtitle">
            Garmin Connect hesabınızı girin. Uyku evreleri, Body Battery, stres, dinlenik nabız ve HRV otomatik çekilir.
          </p>
          <Input
            label="Garmin Connect E-posta Adresi"
            value={formState.garmin_email}
            placeholder="ornek@eposta.com"
            onChange={(val) => setFormState({ ...formState, garmin_email: val })}
            testId="input-garmin-email"
          />
          <Input
            label={`Garmin Connect Parolası (Durum: ${settings.garmin_password_masked})`}
            type="password"
            value={formState.garmin_password}
            placeholder="Yeni parola girin veya korumak için boş bırakın"
            onChange={(val) => setFormState({ ...formState, garmin_password: val })}
            testId="input-garmin-password"
          />
          <div className="hs-filter-bar">
            <Button variant="primary" onPress={handleSaveSettings} testId="save-garmin-btn">
              <Icon name="save" />
              <span>Garmin Ayarlarını Kaydet</span>
            </Button>
          </div>
        </Panel>

        <Panel
          title="3. Samsung Galaxy Watch6 (Health Connect)"
          actions={
            <Tag
              tone={isHealthy ? 'nominal' : 'neutral'}
              label={isHealthy ? 'Webhook Canlı' : 'Sinyal Bekleniyor'}
            />
          }
        >
          <p className="hs-page-subtitle">
            Telefonunuzdan gelen Health Connect Webhook doğrulama anahtarı, dışa aktarım klasörü ve heartbeat eşiği.
          </p>
          <Input
            label="Watch6 Yedek Klasörü (WATCH_EXPORT_DIR)"
            value={formState.watch_export_dir}
            onChange={(val) => setFormState({ ...formState, watch_export_dir: val })}
            testId="input-watch-export-dir"
          />
          <Input
            label={`Webhook Güvenlik Anahtarı / Token (Durum: ${settings.webhook_secret_masked})`}
            type="password"
            value={formState.webhook_secret}
            placeholder="Opsiyonel paylaşımlı webhook anahtarı"
            onChange={(val) => setFormState({ ...formState, webhook_secret: val })}
            testId="input-webhook-secret"
          />
          <Input
            label="Beklenen Webhook Heartbeat Eşiği (Dakika)"
            value={formState.webhook_expected_interval_minutes}
            onChange={(val) => setFormState({ ...formState, webhook_expected_interval_minutes: val })}
            error={intervalError}
            testId="input-heartbeat-interval"
          />
          <div className="hs-filter-bar">
            <Button variant="primary" onPress={handleSaveSettings} testId="save-watch6-btn">
              <Icon name="save" />
              <span>Watch6 Ayarlarını Kaydet</span>
            </Button>
          </div>
        </Panel>

        <Panel
          title="4. Gemini AI Danışman ve Otomasyon Periyodu"
          actions={
            <Tag
              tone={settings.has_gemini_api_key ? 'nominal' : 'neutral'}
              label={settings.has_gemini_api_key ? 'Gemini API Aktif' : 'Klinik Motor Modu'}
            />
          }
        >
          <p className="hs-page-subtitle">
            Çoklu cihaz yapay zekâ analizi için Gemini API anahtarı ve arka plan otomatik senkronizasyon sıklığı.
          </p>
          <Input
            label={`Gemini AI API Anahtarı (Durum: ${settings.gemini_api_key_masked})`}
            type="password"
            value={formState.gemini_api_key}
            placeholder="AIza... (Boş bırakılırsa deterministik klinik motor çalışır)"
            onChange={(val) => setFormState({ ...formState, gemini_api_key: val })}
            testId="input-gemini-key"
          />
          <Input
            label="Otomatik Bulut Senkronizasyon Sıklığı (Dakika)"
            value={formState.auto_sync_interval_minutes}
            onChange={(val) => setFormState({ ...formState, auto_sync_interval_minutes: val })}
            error={intervalError}
            testId="input-auto-sync-interval"
          />
          <div className="hs-filter-bar">
            <Button variant="primary" onPress={handleSaveSettings} testId="save-ai-btn">
              <Icon name="save" />
              <span>AI ve Otomasyon Ayarlarını Kaydet</span>
            </Button>
            <Button variant="default" onPress={loadSettingsAndHeartbeat}>
              <span>Değişiklikleri Geri Al</span>
            </Button>
          </div>
        </Panel>
      </div>

      <Table
        title="Cihaz Bazlı Webhook ve Köprü Canlılık (Heartbeat) Durumu"
        rowKey="source"
        data={heartbeat.sources || []}
        emptyMessage="Henüz kayıtlı cihaz kaynağı bulunamadı."
        columns={[
          { key: 'source', header: 'Kaynak Kodu' },
          { key: 'device_label', header: 'Cihaz / Köprü Adı' },
          {
            key: 'status',
            header: 'Heartbeat Durumu',
            render: (row) => (
              <Tag
                tone={row.status === 'healthy' ? 'nominal' : row.status === 'stale' ? 'warning' : 'neutral'}
                label={row.status === 'healthy' ? 'CANLI' : row.status === 'stale' ? 'GECİKMELİ' : 'BEKLENİYOR'}
              />
            ),
          },
          { key: 'last_seen_at', header: 'Son Sinyal Zamanı (UTC)' },
          { key: 'last_latency_ms', header: 'Gecikme (ms)', numeric: true },
          { key: 'event_count', header: 'Sinyal Sayısı', numeric: true },
          { key: 'last_payload_summary', header: 'Son Sinyal Özeti' },
        ]}
      />

      <Table
        title="Son Webhook ve Heartbeat Sinyal Geçmişi"
        rowKey="id"
        data={heartbeat.recent_heartbeats || []}
        emptyMessage="Henüz kaydedilmiş webhook heartbeat olayı bulunmuyor."
        columns={[
          { key: 'created_at', header: 'Zaman (UTC)' },
          { key: 'source', header: 'Kaynak' },
          { key: 'device_label', header: 'Cihaz' },
          { key: 'event_type', header: 'Olay Türü' },
          { key: 'records_received', header: 'Kayıt', numeric: true },
          { key: 'latency_ms', header: 'Gecikme (ms)', numeric: true },
          {
            key: 'status',
            header: 'Durum',
            render: (row) => (
              <Tag
                tone={row.status === 'healthy' ? 'nominal' : 'warning'}
                label={row.status === 'healthy' ? 'SAĞLIKLI' : 'UYARI'}
              />
            ),
          },
          { key: 'payload_summary', header: 'Yük / Sinyal Özeti' },
        ]}
      />

      <Panel title="Telefon Otomasyonu (Health Connect / Tasker / MacroDroid) Heartbeat Örneği">
        <CodeBlock content={curlSnippet} />
      </Panel>
    </DetailTemplate>
  );
}
