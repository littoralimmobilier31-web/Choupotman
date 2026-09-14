export { cn, type ClassValue } from './cn';
export { slugify, uniqueSlug } from './slug';

/** Stable, non-cryptographic id for client-side keys. */
export function shortId(prefix = 'id'): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function initials(name: string | null | undefined, max = 2): string {
  if (!name) return '?';
  return name
    .trim()
    .split(/\s+/)
    .slice(0, max)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('');
}

export function truncate(text: string | null | undefined, length = 140): string {
  const value = (text ?? '').trim();
  if (value.length <= length) return value;
  return `${value.slice(0, length - 1).trimEnd()}…`;
}

/** Strips HTML for previews, meta descriptions and AI context. */
export function stripHtml(html: string | null | undefined): string {
  return (html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function readingTime(content: string | null | undefined, wordsPerMinute = 210): number {
  const words = stripHtml(content).split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / wordsPerMinute));
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

/** Percentage guarded against divide-by-zero, rounded to an integer. */
export function percent(part: number, total: number): number {
  if (!total) return 0;
  return clamp(Math.round((part / total) * 100), 0, 100);
}

export function parseList(value: string | null | undefined): string[] {
  if (!value) return [];
  return value.split(',').map((v) => v.trim()).filter(Boolean);
}

/** JSON columns are stored as TEXT; never let a bad row crash a page. */
export function safeJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    const parsed = JSON.parse(value);
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export function toJson(value: unknown): string {
  try { return JSON.stringify(value ?? null); } catch { return 'null'; }
}

export function isoNow(): string {
  return new Date().toISOString();
}

export function addDays(date: Date | string, days: number): Date {
  const d = typeof date === 'string' ? new Date(date) : new Date(date.getTime());
  d.setDate(d.getDate() + days);
  return d;
}

export function daysBetween(a: Date | string, b: Date | string): number {
  const d1 = typeof a === 'string' ? new Date(a) : a;
  const d2 = typeof b === 'string' ? new Date(b) : b;
  return Math.round((d2.getTime() - d1.getTime()) / 86400000);
}

export function startOfDay(date: Date = new Date()): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function dateKey(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function groupBy<T, K extends string | number>(items: T[], key: (item: T) => K): Record<K, T[]> {
  return items.reduce((acc, item) => {
    const k = key(item);
    (acc[k] ||= []).push(item);
    return acc;
  }, {} as Record<K, T[]>);
}

export function sum(values: (number | null | undefined)[]): number {
  return values.reduce<number>((acc, v) => acc + Number(v ?? 0), 0);
}

export function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}

/**
 * Human-readable file size.
 *
 * Binary units (1 KiB = 1024 B) reported with the familiar shorthand, which is
 * what every file manager shows; a French non-breaking space keeps the number
 * and the unit together on a line.
 */
export function formatBytes(bytes: number | null | undefined): string {
  const value = Number(bytes ?? 0);
  if (!Number.isFinite(value) || value <= 0) return '0 o';

  const units = ['o', 'Ko', 'Mo', 'Go', 'To'];
  const exponent = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  const scaled = value / 1024 ** exponent;
  const decimals = exponent === 0 || scaled >= 100 ? 0 : scaled >= 10 ? 1 : 2;

  return `${scaled.toFixed(decimals).replace('.', ',')} ${units[exponent]}`;
}
