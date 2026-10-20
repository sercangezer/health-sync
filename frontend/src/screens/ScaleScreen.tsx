import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import {
  Button,
  formatDateTR,
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
      title="Akıllı Tartı Ölçümleri"
      subtitle="Kilo, yağ, kas ve vücut suyu geçmişiniz"
      toolbar={
        <>
          <Button variant="default" onPress={() => setImportModalOpen(true)}>
            <Icon name="upload_file" />
            <span>Dosya Yükle</span>
          </Button>
          <Button variant="default" onPress={() => setBleModalOpen(true)}>
            <Icon name="bluetooth" />
            <span>Tartı Ekle</span>
          </Button>
          <Button variant="primary" onPress={handleCloudSync}>
            <Icon name="sync" />
            <span>Güncelle</span>
          </Button>
        </>
      }
    >
      <Toast message={toastMsg} onDismiss={() => setToastMsg(null)} />

      <Table
        title="Tartı Geçmişi"
        rowKey="id"
        pageSize={8}
        data={items}
        selectable={true}
        bulkActionLabel="Seçilenleri sil"
        onBulkAction={handleBulkDelete}
        emptyMessage="Henüz kaydedilmiş tartı ölçümü bulunmuyor."
        columns={[
          { key: 'date', header: 'Tarih', render: (row) => formatDateTR(row.date) },
          { key: 'weight_kg', header: 'Kilo (kg)', numeric: true },
          { key: 'body_fat_pct', header: 'Yağ (%)', numeric: true },
          { key: 'muscle_mass_kg', header: 'Kas (kg)', numeric: true },
          { key: 'water_pct', header: 'Su (%)', numeric: true },
          { key: 'visceral_fat', header: 'İç Yağlanma', numeric: true },
          { key: 'bmi', header: 'BMI', numeric: true },
          { key: 'metabolic_age', header: 'Metabolik Yaş', numeric: true },
        ]}
      />

      <Modal
        isOpen={bleModalOpen}
        title="Yeni Tartı Ölçümü Ekle"
        onClose={() => setBleModalOpen(false)}
      >
        <Input
          label="Ağırlık (kg)"
          value={weightInput}
          onChange={setWeightInput}
          error={weightError}
        />
        <Input
          label="Empedans (Ohm)"
          value={impedanceInput}
          onChange={setImpedanceInput}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <Button variant="default" onPress={() => setBleModalOpen(false)}>
            İptal
          </Button>
          <Button variant="primary" onPress={handleSaveBle}>
            Kaydet
          </Button>
        </div>
      </Modal>

      <Modal
        isOpen={importModalOpen}
        title="Yedek Dosyası Yükle"
        onClose={() => setImportModalOpen(false)}
      >
        <Select
          label="Cihaz"
          value={importDevice}
          onChange={setImportDevice}
          options={[
            { value: 'galaxy_watch6', label: 'Galaxy Watch6' },
            { value: 'garmin_band', label: 'Garmin Bileklik' },
            { value: 'renpho_es26bb', label: 'Renpho Tartı' },
          ]}
        />
        <Select
          label="Format"
          value={importFormat}
          onChange={setImportFormat}
          options={[
            { value: 'csv', label: 'CSV' },
            { value: 'db', label: 'SQLite (.db)' },
          ]}
        />
        <Input
          label="İçerik"
          value={csvContent}
          onChange={setCsvContent}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-2)' }}>
          <Button variant="default" onPress={() => setImportModalOpen(false)}>
            İptal
          </Button>
          <Button variant="primary" onPress={handleImportFile}>
            Yükle
          </Button>
        </div>
      </Modal>
    </ListTemplate>
  );
}
