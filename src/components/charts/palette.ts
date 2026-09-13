/**
 * Chart palette accessors.
 *
 * Slots are assigned in FIXED order and never cycled — the colour follows the
 * entity, not its rank, so filtering a series out must not repaint the ones
 * that remain. Callers therefore pass an explicit slot index derived from a
 * stable key, not from array position after filtering.
 *
 * Slots 1-4 are validated on all pairs in both themes. Slots 5-6 are validated
 * on adjacent pairs only and are legal because every chart here ships a legend
 * (and, at <= 4 series, direct labels) as secondary encoding. A 7th series is
 * never a generated hue: fold it into "Autres".
 */

export const SERIES_SLOTS = 6;

export const seriesVar = (slot: number): string =>
  `var(--color-series-${(Math.abs(slot) % SERIES_SLOTS) + 1})`;

/** Sequential ramp (single hue, monotonically darker) — for magnitude. */
export const SEQ_STEPS = 8;
export const seqVar = (step: number): string =>
  `var(--color-seq-${Math.min(SEQ_STEPS, Math.max(1, step))})`;

/** Diverging ramp with a neutral midpoint — for polarity (profit/loss, ahead/behind). */
export function divergingVar(value: number, max: number): string {
  if (!max || Number.isNaN(value)) return 'var(--color-div-mid)';
  const ratio = Math.max(-1, Math.min(1, value / max));
  if (ratio > 0.66) return 'var(--color-div-pos-3)';
  if (ratio > 0.33) return 'var(--color-div-pos-2)';
  if (ratio > 0.04) return 'var(--color-div-pos-1)';
  if (ratio < -0.66) return 'var(--color-div-neg-3)';
  if (ratio < -0.33) return 'var(--color-div-neg-2)';
  if (ratio < -0.04) return 'var(--color-div-neg-1)';
  return 'var(--color-div-mid)';
}

/** Reserved status colours — never reused as a categorical slot. Always
 *  accompanied by an icon and a text label, never colour alone. */
export const statusVar = {
  good: 'var(--color-success)',
  warning: 'var(--color-warning)',
  serious: 'var(--color-warning)',
  critical: 'var(--color-danger)',
  info: 'var(--color-info)',
  neutral: 'var(--color-ink-400)',
} as const;

/** Mark specs, kept in one place so every chart draws identically. */
export const MARK = {
  barMaxThickness: 24,
  barRadius: 4,
  lineWidth: 2,
  markerRadius: 4,
  surfaceGap: 2,
  surfaceRing: 2,
  areaOpacity: 0.1,
} as const;
