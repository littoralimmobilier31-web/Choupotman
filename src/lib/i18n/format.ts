import { localeMeta, type Locale } from './config';

/** Money formatting that never crashes on an unknown currency code. */
export function formatMoney(
  amount: number | null | undefined,
  currency = 'DZD',
  locale: Locale = 'fr',
): string {
  const value = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat(localeMeta[locale].currencyLocale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(value);
  } catch {
    return `${value.toLocaleString('fr-FR', { maximumFractionDigits: 2 })} ${currency}`;
  }
}

export function formatNumber(value: number | null | undefined, locale: Locale = 'fr'): string {
  return new Intl.NumberFormat(localeMeta[locale].currencyLocale).format(Number(value ?? 0));
}

export function formatPercent(value: number | null | undefined, locale: Locale = 'fr'): string {
  return new Intl.NumberFormat(localeMeta[locale].currencyLocale, {
    style: 'percent',
    maximumFractionDigits: 1,
  }).format(Number(value ?? 0) / 100);
}

export function formatDate(
  input: string | number | Date | null | undefined,
  locale: Locale = 'fr',
  options: Intl.DateTimeFormatOptions = { year: 'numeric', month: 'long', day: 'numeric' },
): string {
  if (!input) return '—';
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '—';
  // Arabic uses Latin digits here so invoice/date data stays scannable.
  const tag = locale === 'ar' ? 'ar-DZ-u-nu-latn' : localeMeta[locale].currencyLocale;
  return new Intl.DateTimeFormat(tag, options).format(date);
}

export function formatDateTime(
  input: string | number | Date | null | undefined,
  locale: Locale = 'fr',
): string {
  return formatDate(input, locale, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export function formatShortDate(input: string | number | Date | null | undefined, locale: Locale = 'fr'): string {
  return formatDate(input, locale, { year: 'numeric', month: 'short', day: 'numeric' });
}

/** "dans 3 jours" / "il y a 2 heures" — relative, locale-aware. */
export function formatRelative(input: string | number | Date | null | undefined, locale: Locale = 'fr'): string {
  if (!input) return '—';
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) return '—';
  const diffMs = date.getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31536000000], ['month', 2592000000], ['week', 604800000],
    ['day', 86400000], ['hour', 3600000], ['minute', 60000], ['second', 1000],
  ];
  const rtf = new Intl.RelativeTimeFormat(localeMeta[locale].currencyLocale, { numeric: 'auto' });
  for (const [unit, ms] of units) {
    if (abs >= ms || unit === 'second') return rtf.format(Math.round(diffMs / ms), unit);
  }
  return '—';
}

export function formatFileSize(bytes: number | null | undefined): string {
  const b = Number(bytes ?? 0);
  if (b < 1024) return `${b} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = b / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) { value /= 1024; i += 1; }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}
