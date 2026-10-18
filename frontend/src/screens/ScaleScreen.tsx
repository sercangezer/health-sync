import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import {
  Button,
  Icon,
  Input,
  ListTemplate,
  Modal,
  Select,
  StateBlock,
  Table,
  Toast,
} from '../ui';

export function ScaleScreen({
  forcedState,
}: {
  forcedState?: 'default' | 'empty' | 'error';
}) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [bleModalOpen, setBleModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [impedanceInput, setImpedanceInput] = useState('');
  const [weightError, setWeightError] = useState<string | undefined>(undefined);
  const [importFormat, setImportFormat] = useState('csv');
  const [importDevice, setImportDevice] = useState('galaxy_watch6');
  const [csvContent, setCsvContent] = useState('');

  const loadScale = useCallback(async () => {
    if (forcedState === 'error') {
      setLoading(false);
      setError('Renpho ES-26BB-B mikroservisine ulaşılamadı (Test Hata Durumu).');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await apiClient.listScaleMeasurements({ limit: 60 });
      setItems(forcedState === 'empty' ? [] : res.items || []);
    } catch (err: any) {
      setError(err?.message || 'Tartı verileri alınamadı.');
    } finally {
      setLoading(false);
    }
  }, [forcedState]);

  useEffect(() => {
    loadScale();
  }, [loadScale]);

  const handleSaveBle = async () => {
    const parsedW = parseFloat(weightInput);
    if (Number.isNaN(parsedW) || parsedW <= 20 || parsedW >= 300) {
      setWeightError('Ağırlık 20 kg ile 300 kg arasında olmalıdır.');
      return;
    }
    setWeightError(undefined);
    try {
      const res = await apiClient.ingestBleScale({
        weight_kg: parsedW,
        impedance_ohm: parseFloat(impedanceInput) || 480,
      });
      setToastMsg(res.message);
      setBleModalOpen(false);
      await loadScale();
    } catch (err: any) {
      setWeightError(err?.message || 'Ölçüm kaydedilemedi.');
    }
  };

  const handleImportFile = async () => {
    try {
      if (importFormat === 'json') {
        const parsed = JSON.parse(csvContent || '[]');
        const records = Array.isArray(parsed) ? parsed : [parsed];
        const res = await apiClient.ingestWebhook({
          device_source: importDevice,
          records,
        });
        setToastMsg(res.message);
        setImportModalOpen(false);
        await loadScale();
        return;
      }
      const encoded = window.btoa(unescape(encodeURIComponent(csvContent)));
      const res = await apiClient.importHealthFile({
        file_name: `manual_import.${importFormat}`,
        format: importFormat,
        device_source: importDevice,
        content_base64: encoded,
      });
      setToastMsg(res.message);
      setImportModalOpen(false);
      await loadScale();
    } catch (err: any) {
      setToastMsg(err?.message || 'Dosya içe aktarımı başarısız oldu.');
    }
  };

  const handleBulkDelete = async (ids: number[]) => {
    try {
      const res = await apiClient.bulkDeleteScaleMeasurements({ ids });
      setToastMsg(res.message);
      await loadScale();
    } catch (err: any) {
      setToastMsg(err?.message || 'Silme işlemi başarısız oldu.');
    }
  };

  const handleCloudSync = async () => {
    try {
      const res = await apiClient.triggerSync({ provider: 'renpho' });
      setToastMsg(res.message);
      await loadScale();
    } catch (err: any) {
      setToastMsg(err?.message || 'Renpho bulut senkronizasyonu başarısız oldu.');
    }
  };

  if (loading) {
    return (
      <StateBlock
        state="loading"
        title="Renpho ES-26BB-B ölçümleri yükleniyor"
        description="13 vücut kompozisyonu metriği sorgulanıyor..."
      />
    );
  }

  if (error) {
    return (
      <StateBlock
        state="error"
        title="Tartı verileri alınamadı"
        description={error}
        onRetry={loadScale}
      />
    );
  }

  return (
    <ListTemplate
      title="Renpho Body Fat Scale ES-26BB-B — 13 Metrik Kompozisyon Kayıtları"
      subtitle="Bulut API ve Web Bluetooth (BLE 0xFFE0 / 0x181D) üzerinden toplanan biyoelektrik empedans ölçümleri"
      toolbar={
        <>
          <Button variant="default" onPress={() => setImportModalOpen(true)}>
            <Icon name="upload_file" />
            <span>Veri / yedek içe aktar</span>
          </Button>
          <Button variant="default" onPress={() => setBleModalOpen(true)}>
            <Icon name="bluetooth" />
            <span>Web Bluetooth (BLE) ölçüm ekle</span>
          </Button>
          <Button variant="primary" onPress={handleCloudSync}>
            <Icon name="sync" />
            <span>Renpho buluttan çek</span>
          </Button>
        </>
      }
    >
      <Toast message={toastMsg} onDismiss={() => setToastMsg(null)} />

      <Table
        title="Tartı ve Vücut Kompozisyonu Ölçüm Tablosu"
        rowKey="id"
        data={items}
        selectable={true}
        bulkActionLabel="Seçili ölçümleri sil"
        onBulkAction={handleBulkDelete}
        emptyMessage="Henüz kaydedilmiş Renpho ES-26BB-B tartı ölçümü bulunmuyor."
        columns={[
          { key: 'date', header: 'Tarih' },
          { key: 'weight_kg', header: 'Kilo (kg)', numeric: true },
          { key: 'bmi', header: 'BMI', numeric: true },
          { key: 'body_fat_pct', header: 'Yağ (%)', numeric: true },
          { key: 'muscle_mass_kg', header: 'Kas (kg)', numeric: true },
          { key: 'visceral_fat', header: 'İç Organ Yağı', numeric: true },
          { key: 'subcutaneous_fat_pct', header: 'Deri Altı (%)', numeric: true },
          { key: 'water_pct', header: 'Su (%)', numeric: true },
          { key: 'bone_mass_kg', header: 'Kemik (kg)', numeric: true },
          { key: 'bmr_kcal', header: 'BMR (kcal)', numeric: true },
          { key: 'protein_pct', header: 'Protein (%)', numeric: true },
          { key: 'metabolic_age', header: 'Metabolik Yaş', numeric: true },
          { key: 'fat_free_weight_kg', header: 'Yağsız Kütle (kg)', numeric: true },
          { key: 'source', header: 'Kaynak' },
        ]}
      />

      <Modal
        isOpen={bleModalOpen}
        title="Renpho ES-26BB-B Web Bluetooth (BLE) Ölçüm Kaydı"
        onClose={() => setBleModalOpen(false)}
      >
        <Input
          label="Ağırlık (kg)"
          value={weightInput}
          onChange={setWeightInput}
          error={weightError}
        />
        <Input
          label="Biyoelektrik Empedans (Ohm)"
          value={impedanceInput}
          onChange={setImpedanceInput}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <Button variant="default" onPress={() => setBleModalOpen(false)}>
            İptal
          </Button>
          <Button variant="primary" onPress={handleSaveBle}>
            13 Metriği Hesapla ve Kaydet
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={importModalOpen}
        title="Health Connect (.db) veya Cihaz CSV Yedeği İçe Aktar"
        onClose={() => setImportModalOpen(false)}
      >
        <Select
          label="Cihaz kaynağı"
          value={importDevice}
          onChange={setImportDevice}
          options={[
            { value: 'galaxy_watch6', label: 'Samsung Galaxy Watch6 (Health Connect)' },
            { value: 'garmin_band', label: 'Garmin Smart Band' },
            { value: 'renpho_es26bb', label: 'Renpho ES-26BB-B Tartı' },
          ]}
        />
        <Select
          label="Veri formatı"
          value={importFormat}
          onChange={setImportFormat}
          options={[
            { value: 'csv', label: 'CSV Tablosu' },
            { value: 'db', label: 'Health Connect SQLite (.db)' },
          ]}
        />
        <Input
          label="CSV İçeriği"
          value={csvContent}
          onChange={setCsvContent}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <Button variant="default" onPress={() => setImportModalOpen(false)}>
            İptal
          </Button>
          <Button variant="primary" onPress={handleImportFile}>
            İçe Aktar
          </Button>
        </div>
      </Modal>
    </ListTemplate>
  );
}
