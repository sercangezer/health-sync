import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import {
  Button,
  DetailTemplate,
  formatDateTimeTR,
  formatDeviceLabelTR,
  formatIntervalTR,
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

  const handleSaveSettings = async (providerToVerify?: 'renpho' | 'garmin' | 'watch6') => {
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
      let verifyMessage = 'Cihaz kimlik bilgileri ve webhook heartbeat ayarları kaydedildi.';
      if (providerToVerify) {
        try {
          const syncRes = await apiClient.triggerSync({ provider: providerToVerify });
          if (syncRes?.message) {
            verifyMessage = syncRes.message;
          }
        } catch (syncErr: any) {
          verifyMessage = syncErr?.message || 'Ayarlar kaydedildi ancak bulut doğrulaması sırasında hata oluştu.';
        }
      }
      setToastMsg(verifyMessage);
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
    ? 'Tüm Cihazlar Aktif'
    : heartbeat.overall_status === 'stale'
      ? 'Senkronizasyon Bekleniyor'
      : 'Cihaz Bekleniyor';

  const renphoSource = (heartbeat.sources || []).find((s: any) => s.source === 'renpho_es26bb');
  const garminSource = (heartbeat.sources || []).find((s: any) => s.source === 'garmin_band');

  const renphoConnected =
    renphoSource?.status === 'healthy' ||
    renphoSource?.status === 'stale' ||
    (renphoSource?.event_count ?? 0) > 0;
  const renphoTagTone = !settings.has_renpho_password
    ? 'neutral'
    : renphoSource?.status === 'degraded'
      ? 'critical'
      : renphoConnected
        ? 'nominal'
        : 'warning';
  const renphoTagLabel = !settings.has_renpho_password
    ? 'BLE / Hesap Bekleniyor'
    : renphoSource?.status === 'degraded'
      ? 'Giriş / Bağlantı Hatası'
      : renphoConnected
        ? 'Bulut Hesabı Bağlı'
        : 'Doğrulama Bekleniyor';

  const garminConnected =
    garminSource?.status === 'healthy' ||
    garminSource?.status === 'stale' ||
    (garminSource?.event_count ?? 0) > 0;
  const garminTagTone = !settings.has_garmin_password
    ? 'neutral'
    : garminSource?.status === 'degraded'
      ? 'critical'
      : garminConnected
        ? 'nominal'
        : 'warning';
  const garminTagLabel = !settings.has_garmin_password
    ? 'Hesap Bekleniyor'
    : garminSource?.status === 'degraded'
      ? 'Giriş / Bağlantı Hatası'
      : garminConnected
        ? 'Bulut Hesabı Bağlı'
        : 'Doğrulama Bekleniyor';

  return (
    <DetailTemplate
      title="Cihaz ve Hesap Ayarları"
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
            <span>{probing ? 'Kontrol Ediliyor...' : 'Bağlantıyı Test Et'}</span>
          </Button>
          <Button variant="default" onPress={loadSettingsAndHeartbeat} testId="refresh-heartbeat-btn">
            <Icon name="refresh" />
            <span>Yenile</span>
          </Button>
        </>
      }
      kvItems={[
        {
          label: 'Renpho Tartı',
          value: settings.has_renpho_password ? `Bağlı (${settings.renpho_email || 'Tanımlı'})` : 'Yerel Mod',
        },
        {
          label: 'Garmin Bileklik',
          value: settings.has_garmin_password ? `Bağlı (${settings.garmin_email || 'Tanımlı'})` : 'Yerel Mod',
        },
        {
          label: 'Senkronizasyon Sıklığı',
          value: formatIntervalTR(settings.auto_sync_interval_minutes || 60),
        },
      ]}
    >
      <Toast message={toastMsg} onDismiss={() => setToastMsg(null)} />

      <div className="hs-grid-2">
        <Panel
          title="Renpho Akıllı Tartı"
          actions={<Tag tone={renphoTagTone} label={renphoTagLabel} />}
        >
          <Input
            label="E-posta Adresi"
            value={formState.renpho_email}
            placeholder="ornek@eposta.com"
            onChange={(val) => setFormState({ ...formState, renpho_email: val })}
            testId="input-renpho-email"
          />
          <Input
            label={`Parola (${settings.renpho_password_masked})`}
            type="password"
            value={formState.renpho_password}
            placeholder="Değiştirmek için yeni parola girin"
            onChange={(val) => setFormState({ ...formState, renpho_password: val })}
            testId="input-renpho-password"
          />
          <div className="hs-filter-bar">
            <Button variant="primary" onPress={() => handleSaveSettings('renpho')} testId="save-renpho-btn">
              <Icon name="save" />
              <span>Kaydet</span>
            </Button>
          </div>
        </Panel>

        <Panel
          title="Garmin Bileklik"
          actions={<Tag tone={garminTagTone} label={garminTagLabel} />}
        >
          <Input
            label="E-posta Adresi"
            value={formState.garmin_email}
            placeholder="ornek@eposta.com"
            onChange={(val) => setFormState({ ...formState, garmin_email: val })}
            testId="input-garmin-email"
          />
          <Input
            label={`Parola (${settings.garmin_password_masked})`}
            type="password"
            value={formState.garmin_password}
            placeholder="Değiştirmek için yeni parola girin"
            onChange={(val) => setFormState({ ...formState, garmin_password: val })}
            testId="input-garmin-password"
          />
          <div className="hs-filter-bar">
            <Button variant="primary" onPress={() => handleSaveSettings('garmin')} testId="save-garmin-btn">
              <Icon name="save" />
              <span>Kaydet</span>
            </Button>
          </div>
        </Panel>

        <Panel
          title="Galaxy Watch6 (Health Connect)"
          actions={
            <Tag
              tone={isHealthy ? 'nominal' : 'neutral'}
              label={isHealthy ? 'Bağlantı Aktif' : 'Bekleniyor'}
            />
          }
        >
          <Input
            label="Google Drive Bağlantısı veya Klasör"
            value={formState.watch_export_dir}
            onChange={(val) => setFormState({ ...formState, watch_export_dir: val })}
            testId="input-watch-export-dir"
          />
          <Input
            label={`Güvenlik Anahtarı (${settings.webhook_secret_masked})`}
            type="password"
            value={formState.webhook_secret}
            placeholder="Opsiyonel güvenlik anahtarı"
            onChange={(val) => setFormState({ ...formState, webhook_secret: val })}
            testId="input-webhook-secret"
          />
          <Input
            label="Kontrol Sıklığı (Dakika)"
            value={formState.webhook_expected_interval_minutes}
            onChange={(val) => setFormState({ ...formState, webhook_expected_interval_minutes: val })}
            error={intervalError}
            testId="input-heartbeat-interval"
          />
          <div className="hs-filter-bar">
            <Button variant="primary" onPress={() => handleSaveSettings('watch6')} testId="save-watch6-btn">
              <Icon name="save" />
              <span>Kaydet</span>
            </Button>
          </div>
        </Panel>

        <Panel
          title="Yapay Zeka ve Otomatik Çekim"
          actions={
            <Tag
              tone={settings.has_gemini_api_key ? 'nominal' : 'neutral'}
              label={settings.has_gemini_api_key ? 'Gemini Aktif' : 'Standart Mod'}
            />
          }
        >
          <Input
            label={`Gemini API Anahtarı (${settings.gemini_api_key_masked})`}
            type="password"
            value={formState.gemini_api_key}
            placeholder="AIza..."
            onChange={(val) => setFormState({ ...formState, gemini_api_key: val })}
            testId="input-gemini-key"
          />
          <Input
            label="Otomatik Senkronizasyon Sıklığı (Dakika)"
            value={formState.auto_sync_interval_minutes}
            onChange={(val) => setFormState({ ...formState, auto_sync_interval_minutes: val })}
            error={intervalError}
            testId="input-auto-sync-interval"
          />
          <div className="hs-filter-bar">
            <Button variant="primary" onPress={() => handleSaveSettings()} testId="save-ai-btn">
              <Icon name="save" />
              <span>Kaydet</span>
            </Button>
          </div>
        </Panel>
      </div>

      <Table
        title="Cihaz Bağlantı Durumu"
        rowKey="source"
        data={heartbeat.sources || []}
        emptyMessage="Henüz kayıtlı cihaz bulunamadı."
        columns={[
          {
            key: 'device_label',
            header: 'Cihaz',
            render: (row) => formatDeviceLabelTR(row.device_label, row.source),
          },
          {
            key: 'status',
            header: 'Durum',
            render: (row) => (
              <Tag
                tone={
                  row.status === 'healthy'
                    ? 'nominal'
                    : row.status === 'degraded'
                      ? 'critical'
                      : row.status === 'stale'
                        ? 'warning'
                        : 'neutral'
                }
                label={
                  row.status === 'healthy'
                    ? 'BAĞLI'
                    : row.status === 'degraded'
                      ? 'HATA'
                      : row.status === 'stale'
                        ? 'BEKLEMEDE'
                        : 'BEKLENİYOR'
                }
              />
            ),
          },
          {
            key: 'last_seen_at',
            header: 'Son Güncelleme',
            render: (row) => formatDateTimeTR(row.last_seen_at),
          },
          { key: 'last_payload_summary', header: 'Son İşlem' },
        ]}
      />
    </DetailTemplate>
  );
}
