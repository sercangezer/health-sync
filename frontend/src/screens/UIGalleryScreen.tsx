import React, { useState } from 'react';
import {
  BarChart,
  Button,
  Checkbox,
  DetailTemplate,
  Input,
  LineChart,
  Menu,
  Modal,
  Panel,
  Select,
  StateBlock,
  Table,
  Tabs,
  Tag,
  Toast,
  Tooltip,
} from '../ui';

export function UIGalleryScreen() {
  const [textVal, setTextVal] = useState('Renpho ES-26BB-B');
  const [selectVal, setSelectVal] = useState('priority');
  const [checkedVal, setCheckedVal] = useState(true);
  const [tabKey, setTabKey] = useState('t1');
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <DetailTemplate
      title="UI Primitif ve Durum Galerisi (Bölüm 4 Doğrulama Ekranı)"
      statusLabel="Tasarım Sistemi Aktif"
      statusTone="nominal"
      kvItems={[
        { label: 'Primitif Kütüphanesi', value: 'React Aria Components' },
        { label: 'Grafik Motoru', value: 'Nivo (Line & Bar)' },
        { label: 'Font Ailesi', value: 'IBM Plex Sans & Mono' },
        { label: 'İkon Seti', value: 'Material Symbols Outlined (20px)' },
      ]}
    >
      <Panel title="1. Buton, Etiket (Tag), Menü ve İpucu (Tooltip) Durumları">
        <div className="hs-filter-bar">
          <Button variant="default" testId="gallery-btn-default">
            Varsayılan Buton
          </Button>
          <Button variant="primary" testId="gallery-btn-primary">
            Birincil Eylem
          </Button>
          <Button variant="destructive" testId="gallery-btn-destructive">
            Yıkıcı Eylem
          </Button>
          <Button variant="default" disabled testId="gallery-btn-disabled">
            Devre Dışı Buton
          </Button>
          <Tag tone="nominal" label="Nominal" />
          <Tag tone="warning" label="Uyarı" />
          <Tag tone="critical" label="Kritik" />
          <Tag tone="neutral" label="Nötr" />
          <Tooltip text="Standart ipucu metni">
            <span>İpucu Üzerine Gel</span>
          </Tooltip>
          <Menu label="Örnek Menü" icon="more_horiz">
            <span>Menü Öğesi 1</span>
            <span>Menü Öğesi 2</span>
          </Menu>
          <Button variant="default" onPress={() => setModalOpen(true)}>
            Modal Aç
          </Button>
        </div>
      </Panel>

      <Panel title="2. Form Denetimleri (Varsayılan, Odak, Hata ve Devre Dışı)">
        <div className="hs-grid-2">
          <Input label="Normal Metin Alanı" value={textVal} onChange={setTextVal} testId="gallery-input-normal" />
          <Input
            label="Hatalı Metin Alanı"
            value="Geçersiz"
            onChange={() => {}}
            error="Alan doğrulaması başarısız oldu."
            testId="gallery-input-error"
          />
          <Input
            label="Devre Dışı Metin Alanı"
            value="Salt okunur"
            onChange={() => {}}
            disabled
            testId="gallery-input-disabled"
          />
          <Select
            label="Birleştirme Stratejisi"
            value={selectVal}
            onChange={setSelectVal}
            options={[
              { value: 'priority', label: 'Öncelik' },
              { value: 'average', label: 'Ortalama' },
            ]}
          />
        </div>
        <div className="hs-filter-bar">
          <Checkbox label="Seçili Onay Kutusu" checked={checkedVal} onChange={setCheckedVal} />
          <Checkbox label="Devre Dışı Onay Kutusu" checked={false} onChange={() => {}} disabled />
        </div>
      </Panel>

      <Panel title="3. Durum Blokları (Yükleniyor, Boş, Hata) ve Bildirim (Toast)">
        <Toast message="Örnek sistem bildirimi aktif." onDismiss={() => {}} />
        <div className="hs-grid-2">
          <StateBlock state="loading" title="Yükleniyor Durumu" description="Veriler getiriliyor..." />
          <StateBlock state="empty" title="Boş Durum" description="Kayıt bulunamadı." />
          <StateBlock state="error" title="Hata Durumu" description="Bağlantı zaman aşımına uğradı." />
        </div>
      </Panel>

      <Tabs
        ariaLabel="Galeri sekmeleri"
        selectedKey={tabKey}
        onSelectionChange={setTabKey}
        items={[
          {
            id: 't1',
            label: 'Tablo ve Grafik Primitifleri',
            content: (
              <div className="hs-grid-2">
                <LineChart
                  title="Örnek Nivo Çizgi Grafiği"
                  xAxisLabel="Gün"
                  yAxisLabel="Kilo (kg)"
                  series={[
                    {
                      id: 'Kilo',
                      data: [
                        { x: '10-16', y: 83.2 },
                        { x: '10-17', y: 82.9 },
                        { x: '10-18', y: 82.6 },
                      ],
                    },
                  ]}
                />
                <BarChart
                  title="Örnek Nivo Çubuk Grafiği"
                  indexBy="day"
                  keys={['Adım']}
                  xAxisLabel="Gün"
                  yAxisLabel="Adım"
                  data={[
                    { day: '10-16', Adım: 8900 },
                    { day: '10-17', Adım: 10200 },
                    { day: '10-18', Adım: 11400 },
                  ]}
                />
              </div>
            ),
          },
          {
            id: 't2',
            label: 'Tablo Primitifi',
            content: (
              <Table
                title="Örnek Veri Tablosu"
                rowKey="id"
                data={[{ id: 1, device: 'Renpho ES-26BB-B', metric: 82.6 }]}
                columns={[
                  { key: 'id', header: 'ID', numeric: true },
                  { key: 'device', header: 'Cihaz' },
                  { key: 'metric', header: 'Değer', numeric: true },
                ]}
              />
            ),
          },
        ]}
      />

      <Modal isOpen={modalOpen} title="Örnek Erişilebilir Modal" onClose={() => setModalOpen(false)}>
        <p>Modal içeriği</p>
      </Modal>
    </DetailTemplate>
  );
}
