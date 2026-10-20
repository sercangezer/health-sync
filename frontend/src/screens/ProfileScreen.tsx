import React, { useCallback, useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import {
  Button,
  DetailTemplate,
  formatDateTR,
  Icon,
  Input,
  Panel,
  Select,
  StateBlock,
  Tag,
  Toast,
} from '../ui';

export function ProfileScreen({
  forcedState,
}: {
  forcedState?: 'default' | 'empty' | 'error';
}) {
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [birthDateError, setBirthDateError] = useState<string | undefined>(undefined);

  const loadProfile = useCallback(async () => {
    if (forcedState === 'error') {
      setLoading(false);
      setError('Profil bilgileri alınamadı (Test Hata Durumu).');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const cfg = await apiClient.getReconciliationRules();
      setProfile({
        ...cfg,
        full_name: cfg.full_name ?? '',
        birth_date: cfg.birth_date || '1990-01-01',
        gender: cfg.gender || 'male',
        blood_type: cfg.blood_type || 'Bilinmiyor',
        starting_weight_kg: cfg.starting_weight_kg ?? 85,
        height_cm: cfg.height_cm ?? 178,
        target_weight_kg: cfg.target_weight_kg ?? 78,
        activity_level: cfg.activity_level || 'moderate',
        surgeries: cfg.surgeries ?? '',
        chronic_conditions: cfg.chronic_conditions ?? '',
        medications: cfg.medications ?? '',
        allergies_and_notes: cfg.allergies_and_notes ?? '',
      });
    } catch (err: any) {
      setError(err?.message || 'Profil verileri yüklenemedi.');
    } finally {
      setLoading(false);
    }
  }, [forcedState]);

  useEffect(() => {
    loadProfile();
  }, [loadProfile]);

  const handleSaveProfile = async () => {
    if (!profile) return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(profile.birth_date || '').trim())) {
      setBirthDateError('Doğum tarihi YYYY-AA-GG formatında olmalıdır (Örn: 1990-05-15).');
      return;
    }
    setBirthDateError(undefined);
    try {
      const updated = await apiClient.updateReconciliationRules({
        weight_priority: profile.weight_priority || ['renpho_es26bb', 'galaxy_watch6', 'garmin_band'],
        sleep_priority: profile.sleep_priority || ['garmin_band', 'galaxy_watch6'],
        activity_priority: profile.activity_priority || ['galaxy_watch6', 'garmin_band'],
        heart_priority: profile.heart_priority || ['galaxy_watch6', 'garmin_band'],
        merge_strategy: profile.merge_strategy || 'priority',
        cycle_start_date: profile.cycle_start_date || '2026-09-18',
        full_name: String(profile.full_name || '').trim(),
        birth_date: String(profile.birth_date || '1990-01-01').trim(),
        gender: profile.gender || 'male',
        blood_type: profile.blood_type || 'Bilinmiyor',
        height_cm: Number(profile.height_cm || 178),
        starting_weight_kg: Number(profile.starting_weight_kg || 85),
        target_weight_kg: Number(profile.target_weight_kg || 78),
        activity_level: profile.activity_level || 'moderate',
        surgeries: String(profile.surgeries || '').trim(),
        chronic_conditions: String(profile.chronic_conditions || '').trim(),
        medications: String(profile.medications || '').trim(),
        allergies_and_notes: String(profile.allergies_and_notes || '').trim(),
      });
      setProfile(updated);
      setToastMsg('Kişisel bilgileriniz ve sağlık geçmişiniz kaydedildi.');
    } catch (err: any) {
      setToastMsg(err?.message || 'Profil kaydedilemedi.');
    }
  };

  if (loading) {
    return (
      <StateBlock
        state="loading"
        title="Profil bilgileri yükleniyor"
        description="Kişisel sağlık ve tıbbi geçmiş kayıtlarınız getiriliyor..."
      />
    );
  }

  if (error || !profile) {
    return (
      <StateBlock
        state="error"
        title="Profil yüklenemedi"
        description={error || 'Bilinmeyen hata'}
        onRetry={loadProfile}
      />
    );
  }

  const birthYear = Number(String(profile.birth_date || '1990-01-01').slice(0, 4)) || 1990;
  const age = profile.age || Math.max(1, new Date().getFullYear() - birthYear);
  const genderLabel = profile.gender === 'female' ? 'Kadın' : 'Erkek';
  const hasMedicalNotes = Boolean(
    profile.surgeries || profile.chronic_conditions || profile.medications || profile.allergies_and_notes,
  );

  return (
    <DetailTemplate
      title="Kişisel Bilgiler ve Sağlık Geçmişi"
      statusLabel={`${age} Yaş • ${genderLabel}`}
      statusTone="nominal"
      actionBar={
        <Button variant="primary" onPress={handleSaveProfile} testId="save-profile-btn">
          <Icon name="save" />
          <span>Bilgileri Kaydet</span>
        </Button>
      }
      kvItems={[
        { label: 'Ad Soyad', value: profile.full_name || 'Belirtilmedi' },
        { label: 'Yaş ve Cinsiyet', value: `${age} Yaş • ${genderLabel}` },
        { label: 'Boy ve Hedef Kilo', value: `${profile.height_cm} cm • Hedef ${profile.target_weight_kg} kg` },
        { label: 'Tıbbi Geçmiş', value: hasMedicalNotes ? 'Kayıtlı' : 'Belirtilmedi' },
      ]}
    >
      <Toast message={toastMsg} onDismiss={() => setToastMsg(null)} />

      <div className="hs-grid-2">
        <Panel
          title="Kişisel ve Fiziksel Bilgiler"
          actions={<Tag tone="nominal" label="Temel Profil" />}
        >
          <Input
            label="Ad Soyad"
            value={String(profile.full_name || '')}
            placeholder="Adınız ve soyadınız"
            onChange={(val) => setProfile({ ...profile, full_name: val })}
          />
          <Input
            label={`Doğum Tarihi (${formatDateTR(profile.birth_date)})`}
            value={String(profile.birth_date || '')}
            placeholder="1990-05-15"
            onChange={(val) => setProfile({ ...profile, birth_date: val })}
            error={birthDateError}
          />
          <Select
            label="Cinsiyet"
            value={profile.gender || 'male'}
            onChange={(val) => setProfile({ ...profile, gender: val })}
            options={[
              { value: 'male', label: 'Erkek' },
              { value: 'female', label: 'Kadın' },
            ]}
          />
          <Select
            label="Kan Grubu"
            value={profile.blood_type || 'Bilinmiyor'}
            onChange={(val) => setProfile({ ...profile, blood_type: val })}
            options={[
              { value: 'Bilinmiyor', label: 'Bilinmiyor' },
              { value: 'A Rh+', label: 'A Rh+' },
              { value: 'A Rh-', label: 'A Rh-' },
              { value: 'B Rh+', label: 'B Rh+' },
              { value: 'B Rh-', label: 'B Rh-' },
              { value: 'AB Rh+', label: 'AB Rh+' },
              { value: 'AB Rh-', label: 'AB Rh-' },
              { value: '0 Rh+', label: '0 Rh+' },
              { value: '0 Rh-', label: '0 Rh-' },
            ]}
          />
          <Input
            label="Boy (cm)"
            value={String(profile.height_cm ?? '')}
            placeholder="178"
            onChange={(val) => setProfile({ ...profile, height_cm: val })}
          />
          <Input
            label="Başlangıç Kilosu (kg)"
            value={String(profile.starting_weight_kg ?? '')}
            placeholder="85"
            onChange={(val) => setProfile({ ...profile, starting_weight_kg: val })}
          />
          <Input
            label="Hedef Kilo (kg)"
            value={String(profile.target_weight_kg ?? '')}
            placeholder="78"
            onChange={(val) => setProfile({ ...profile, target_weight_kg: val })}
          />
          <Select
            label="Günlük Hareket Seviyesi"
            value={profile.activity_level || 'moderate'}
            onChange={(val) => setProfile({ ...profile, activity_level: val })}
            options={[
              { value: 'sedentary', label: 'Masa Başı / Az Hareketli' },
              { value: 'moderate', label: 'Orta Hareketli' },
              { value: 'active', label: 'Aktif / Düzenli Spor' },
            ]}
          />
        </Panel>

        <Panel
          title="Ameliyatlar ve Tıbbi Geçmiş"
          actions={
            <Tag
              tone={hasMedicalNotes ? 'nominal' : 'neutral'}
              label={hasMedicalNotes ? 'Bilgiler Girildi' : 'Opsiyonel'}
            />
          }
        >
          <Input
            label="Geçirilen Ameliyatlar ve Tarihleri"
            value={String(profile.surgeries || '')}
            placeholder="Örn: Tüp mide (Bariatrik cerrahi), safra kesesi, menisküs vb."
            onChange={(val) => setProfile({ ...profile, surgeries: val })}
          />
          <Input
            label="Kronik Rahatsızlıklar / Tanılar"
            value={String(profile.chronic_conditions || '')}
            placeholder="Örn: İnsülin direnci, hipertansiyon, tiroid, uyku apnesi vb."
            onChange={(val) => setProfile({ ...profile, chronic_conditions: val })}
          />
          <Input
            label="Kullanılan İlaçlar ve Takviyeler"
            value={String(profile.medications || '')}
            placeholder="Örn: D3K2, B12, Magnezyum, düzenli kullanılan ilaçlar"
            onChange={(val) => setProfile({ ...profile, medications: val })}
          />
          <Input
            label="Alerjiler ve Beslenme Notları"
            value={String(profile.allergies_and_notes || '')}
            placeholder="Örn: Laktoz hassasiyeti, yüksek protein diyeti, aralıklı oruç vb."
            onChange={(val) => setProfile({ ...profile, allergies_and_notes: val })}
          />
          <div className="hs-filter-bar">
            <Button variant="primary" onPress={handleSaveProfile}>
              <Icon name="save" />
              <span>Bilgileri Kaydet</span>
            </Button>
          </div>
        </Panel>
      </div>
    </DetailTemplate>
  );
}
