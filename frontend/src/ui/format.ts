const TR_MONTHS_LONG = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

const TR_MONTHS_SHORT = [
  'Oca',
  'Şub',
  'Mar',
  'Nis',
  'May',
  'Haz',
  'Tem',
  'Ağu',
  'Eyl',
  'Eki',
  'Kas',
  'Ara',
];

const TURKEY_OFFSET_MS = 3 * 60 * 60 * 1000;

export function formatDateTR(value?: string | null): string {
  if (!value || value === '-') return 'Henüz yok';
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === '-') return 'Henüz yok';

  const dateOnlyMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnlyMatch) {
    const year = Number(dateOnlyMatch[1]);
    const monthIdx = Number(dateOnlyMatch[2]) - 1;
    const day = Number(dateOnlyMatch[3]);
    const monthName = TR_MONTHS_LONG[monthIdx];
    if (monthName && day >= 1 && day <= 31) {
      return `${day} ${monthName} ${year}`;
    }
  }

  if (trimmed.includes('T')) {
    return formatDateTimeTR(trimmed);
  }

  return trimmed;
}

export function formatDateTimeTR(value?: string | null): string {
  if (!value || value === '-') return 'Henüz yok';
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === '-') return 'Henüz yok';

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return formatDateTR(trimmed);
  }

  const normalizedIso =
    trimmed.includes('T') && !/(Z|[+-]\d{2}:\d{2})$/i.test(trimmed)
      ? `${trimmed}Z`
      : trimmed;

  const parsed = new Date(normalizedIso);
  if (Number.isNaN(parsed.getTime())) {
    return trimmed;
  }

  const trDate = new Date(parsed.getTime() + TURKEY_OFFSET_MS);
  const year = trDate.getUTCFullYear();
  const monthName = TR_MONTHS_LONG[trDate.getUTCMonth()] || '';
  const day = trDate.getUTCDate();
  const hours = String(trDate.getUTCHours()).padStart(2, '0');
  const minutes = String(trDate.getUTCMinutes()).padStart(2, '0');

  return `${day} ${monthName} ${year}, ${hours}:${minutes}`;
}

export function formatShortDateTR(value?: string | number | null): string {
  if (value === null || value === undefined) return '';
  const trimmed = String(value).trim();

  const fullMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (fullMatch) {
    const monthIdx = Number(fullMatch[2]) - 1;
    const day = Number(fullMatch[3]);
    const shortMonth = TR_MONTHS_SHORT[monthIdx];
    if (shortMonth && day >= 1 && day <= 31) {
      return `${day} ${shortMonth}`;
    }
  }

  const shortMatch = /^(\d{2})-(\d{2})$/.exec(trimmed);
  if (shortMatch) {
    const monthIdx = Number(shortMatch[1]) - 1;
    const day = Number(shortMatch[2]);
    const shortMonth = TR_MONTHS_SHORT[monthIdx];
    if (shortMonth && day >= 1 && day <= 31) {
      return `${day} ${shortMonth}`;
    }
  }

  return trimmed;
}

export function formatProviderTR(provider?: string | null): string {
  const key = String(provider || '').trim().toLowerCase();
  if (key === 'renpho' || key === 'renpho_es26bb') return 'Renpho Akıllı Tartı';
  if (key === 'garmin' || key === 'garmin_band') return 'Garmin Akıllı Bileklik';
  if (key === 'watch6' || key === 'galaxy_watch6') return 'Samsung Galaxy Watch6';
  if (key === 'all' || key === 'all_devices') return 'Tüm Cihazlar';
  return provider || '-';
}

export function formatDeviceLabelTR(label?: string | null, source?: string | null): string {
  const raw = String(label || '').trim();
  if (raw === 'Renpho Body Fat Scale ES-26BB-B') {
    return 'Renpho Akıllı Tartı (ES-26BB-B)';
  }
  if (raw === 'Garmin Smart Band (Connect Bridge)' || raw === 'Garmin Smart Band') {
    return 'Garmin Akıllı Bileklik';
  }
  if (raw === 'Samsung Galaxy Watch6 (Health Connect Webhook)') {
    return 'Samsung Galaxy Watch6 (Health Connect)';
  }
  if (raw) return raw;
  return formatProviderTR(source);
}

export function formatFocusAreaTR(focusArea?: string | null): string {
  const key = String(focusArea || '').trim().toLowerCase();
  if (key === 'holistic') return 'Genel Sağlık Özeti';
  if (key === 'body_composition') return 'Kilo, Yağ ve Kas';
  if (key === 'recovery_sleep') return 'Uyku ve Dinlenme';
  if (key === 'wearable_calibration') return 'Cihaz Uyumu';
  return focusArea || '-';
}

export function formatIntervalTR(minutes?: number | string | null): string {
  const mins = Number(minutes);
  if (Number.isNaN(mins) || mins <= 0) return '1 saat';
  if (mins % 60 === 0) {
    const hours = mins / 60;
    return `${hours} saat (${mins} dk)`;
  }
  return `${mins} dakika`;
}
