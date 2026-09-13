/**
 * Serializable number formatting for charts.
 *
 * Charts are client components rendered from server components, and a function
 * prop cannot cross that boundary. So callers pass a plain descriptor
 * (`{ style: 'money', currency: 'DZD' }`) and the chart resolves it to a
 * formatter on the client.
 */

export type NumberFormatSpec = {
  style?: 'compact' | 'integer' | 'decimal' | 'money' | 'percent' | 'duration';
  currency?: string;
  /** Appended after the value, e.g. "h" or "j". */
  suffix?: string;
  maximumFractionDigits?: number;
};

const FR = 'fr-FR';

/** Compact axis/tile notation: 1 284 / 12,9 k / 4,2 M. */
export function compactNumber(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1).replace('.', ',')} M`;
  }
  if (abs >= 1_000) {
    return `${(value / 1_000).toFixed(abs >= 10_000 ? 0 : 1).replace('.', ',')} k`;
  }
  return new Intl.NumberFormat(FR, { maximumFractionDigits: 1 }).format(value);
}

/** Turns a spec into a formatter. Called on the client, so `Intl` is available. */
export function resolveFormat(spec?: NumberFormatSpec): (value: number) => string {
  const style = spec?.style ?? 'compact';
  const suffix = spec?.suffix ? ` ${spec.suffix}` : '';

  switch (style) {
    case 'money': {
      const currency = spec?.currency ?? 'DZD';
      return (value) => `${compactNumber(value)} ${currency}`;
    }
    case 'integer':
      return (value) => `${new Intl.NumberFormat(FR, { maximumFractionDigits: 0 }).format(value)}${suffix}`;
    case 'decimal':
      return (value) =>
        `${new Intl.NumberFormat(FR, {
          maximumFractionDigits: spec?.maximumFractionDigits ?? 1,
        }).format(value)}${suffix}`;
    case 'percent':
      return (value) => `${new Intl.NumberFormat(FR, { maximumFractionDigits: 1 }).format(value)} %`;
    case 'duration':
      return (value) => {
        const days = Math.round(value);
        return days === 1 ? '1 jour' : `${days} jours`;
      };
    case 'compact':
    default:
      return (value) => `${compactNumber(value)}${suffix}`;
  }
}
