import { all, one, run, transaction } from '../client';
import type { SettingRow, TranslationRow } from '../types';
import { safeJson, toJson } from '@/lib/utils';
import type { Locale } from '@/lib/i18n/config';

/**
 * Site settings and CMS translations.
 *
 * Settings are the mechanism behind "the admin can change texts, images, SEO
 * and contact details without touching code": every editable string on the
 * public site resolves through `getSetting`, with the seeded default acting as
 * the fallback so a blank value never renders as "undefined".
 */

export type SettingsGroup =
  | 'general' | 'identity' | 'contact' | 'social' | 'seo' | 'finance'
  | 'home' | 'ai' | 'automation' | 'legal';

export function getSetting(key: string, fallback = ''): string {
  const row = one<Pick<SettingRow, 'value'>>('SELECT value FROM settings WHERE key = ?', [key]);
  const value = row?.value;
  return value === null || value === undefined || value === '' ? fallback : value;
}

export function getSettingNumber(key: string, fallback = 0): number {
  const raw = getSetting(key, '');
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function getSettingBool(key: string, fallback = false): boolean {
  const raw = getSetting(key, '').toLowerCase();
  if (raw === '') return fallback;
  return raw === '1' || raw === 'true' || raw === 'yes';
}

export function getSettingJson<T>(key: string, fallback: T): T {
  return safeJson<T>(getSetting(key, ''), fallback);
}

/** All settings as a flat map — one query for a whole page render. */
export function getSettingsMap(group?: SettingsGroup): Record<string, string> {
  const rows = group
    ? all<SettingRow>('SELECT * FROM settings WHERE group_name = ? ORDER BY key', [group])
    : all<SettingRow>('SELECT * FROM settings ORDER BY group_name, key');
  return Object.fromEntries(rows.map((r) => [r.key, r.value ?? '']));
}

export function listSettings(group?: SettingsGroup): SettingRow[] {
  return group
    ? all<SettingRow>('SELECT * FROM settings WHERE group_name = ? ORDER BY key', [group])
    : all<SettingRow>('SELECT * FROM settings ORDER BY group_name, key');
}

export function setSetting(
  key: string,
  value: string | number | boolean | null | undefined,
  options: { group?: SettingsGroup; type?: SettingRow['value_type']; label?: string } = {},
): void {
  const serialised =
    value === null || value === undefined
      ? null
      : typeof value === 'boolean'
        ? value ? '1' : '0'
        : String(value);

  /**
   * The metadata columns are only written when the caller actually supplies
   * them. Passing a default here instead would be destructive: an admin form
   * saves values without knowing each field's declared type, so defaulting
   * `value_type` to 'string' would flatten every boolean, number and richtext
   * setting on the first save — and the settings screen would then render the
   * wrong control for them. NULL is coalesced to the existing row on update,
   * and to the column default on insert.
   */
  run(
    `INSERT INTO settings (key, value, group_name, value_type, label, updated_at)
     VALUES (?, ?, COALESCE(?, 'general'), COALESCE(?, 'string'), ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       group_name = COALESCE(?, settings.group_name),
       value_type = COALESCE(?, settings.value_type),
       label = COALESCE(?, settings.label),
       updated_at = datetime('now')`,
    [
      key, serialised,
      options.group ?? null, options.type ?? null, options.label ?? null,
      options.group ?? null, options.type ?? null, options.label ?? null,
    ],
  );
}

export function setSettingJson(key: string, value: unknown, group: SettingsGroup = 'general'): void {
  setSetting(key, toJson(value), { group, type: 'json' });
}

/** Bulk save from an admin form; one transaction so a partial save can't happen. */
export function setSettings(
  entries: Record<string, string | number | boolean | null>,
  group: SettingsGroup = 'general',
): void {
  transaction(() => {
    for (const [key, value] of Object.entries(entries)) setSetting(key, value, { group });
  });
}

// ── Translations ─────────────────────────────────────────────────────────

/**
 * Returns the translated value for a field, falling back to the base row value
 * so a page never renders empty just because one language is unfinished.
 */
export function translate(
  entityType: string,
  entityId: number,
  field: string,
  locale: Locale,
  fallbackValue: string | null,
): string {
  const row = one<Pick<TranslationRow, 'value'>>(
    `SELECT value FROM translations
     WHERE entity_type = ? AND entity_id = ? AND field = ? AND locale = ?`,
    [entityType, entityId, field, locale],
  );
  const value = row?.value;
  return value && value.trim() !== '' ? value : (fallbackValue ?? '');
}

/** All translations for one entity in one locale, as a field → value map. */
export function getTranslations(
  entityType: string,
  entityId: number,
  locale: Locale,
): Record<string, string> {
  const rows = all<TranslationRow>(
    'SELECT * FROM translations WHERE entity_type = ? AND entity_id = ? AND locale = ?',
    [entityType, entityId, locale],
  );
  return Object.fromEntries(rows.filter((r) => r.value).map((r) => [r.field, r.value as string]));
}

/**
 * Overlays translated fields onto a row. Empty translations are ignored so the
 * base-language value wins over a blank override.
 */
export function localiseRow<T extends { id: number }>(
  row: T,
  entityType: string,
  locale: Locale,
  fields: (keyof T & string)[],
): T {
  const translations = getTranslations(entityType, row.id, locale);
  if (Object.keys(translations).length === 0) return row;
  const result = { ...row };
  for (const field of fields) {
    const value = translations[field];
    if (value && value.trim() !== '') (result as Record<string, unknown>)[field] = value;
  }
  return result;
}

/** Batch version of `localiseRow` — one query for a whole list. */
export function localiseRows<T extends { id: number }>(
  rows: T[],
  entityType: string,
  locale: Locale,
  fields: (keyof T & string)[],
): T[] {
  if (rows.length === 0) return rows;
  const placeholders = rows.map(() => '?').join(',');
  const translations = all<TranslationRow>(
    `SELECT * FROM translations
     WHERE entity_type = ? AND locale = ? AND entity_id IN (${placeholders})`,
    [entityType, locale, ...rows.map((r) => r.id)],
  );
  if (translations.length === 0) return rows;

  const byId = new Map<number, Record<string, string>>();
  for (const t of translations) {
    if (!t.value || t.value.trim() === '') continue;
    const bucket = byId.get(t.entity_id) ?? {};
    bucket[t.field] = t.value;
    byId.set(t.entity_id, bucket);
  }

  return rows.map((row) => {
    const bucket = byId.get(row.id);
    if (!bucket) return row;
    const result = { ...row };
    for (const field of fields) {
      const value = bucket[field];
      if (value) (result as Record<string, unknown>)[field] = value;
    }
    return result;
  });
}

export function setTranslation(
  entityType: string,
  entityId: number,
  field: string,
  locale: Locale,
  value: string | null,
): void {
  run(
    `INSERT INTO translations (entity_type, entity_id, field, locale, value, updated_at)
     VALUES (?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(entity_type, entity_id, field, locale)
     DO UPDATE SET value = excluded.value, updated_at = datetime('now')`,
    [entityType, entityId, field, locale, value],
  );
}

export function setTranslations(
  entityType: string,
  entityId: number,
  locale: Locale,
  fields: Record<string, string | null>,
): void {
  transaction(() => {
    for (const [field, value] of Object.entries(fields)) {
      setTranslation(entityType, entityId, field, locale, value);
    }
  });
}

export function deleteTranslations(entityType: string, entityId: number): void {
  run('DELETE FROM translations WHERE entity_type = ? AND entity_id = ?', [entityType, entityId]);
}
