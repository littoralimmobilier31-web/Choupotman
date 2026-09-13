/**
 * Multilingual foundation. Adding a language = add an entry to `locales`
 * plus a dictionary file in `src/lib/i18n/dictionaries/`. Nothing else
 * in the codebase hardcodes a language list.
 */

export const locales = ['fr', 'ar', 'en'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'fr';

export type LocaleMeta = {
  code: Locale;
  /** Native name shown in the language switcher. */
  label: string;
  /** Short code shown on narrow screens. */
  short: string;
  dir: 'ltr' | 'rtl';
  /** BCP-47 tag for <html lang> and Intl formatting. */
  htmlLang: string;
  currencyLocale: string;
};

export const localeMeta: Record<Locale, LocaleMeta> = {
  fr: { code: 'fr', label: 'Français', short: 'FR', dir: 'ltr', htmlLang: 'fr-FR', currencyLocale: 'fr-FR' },
  ar: { code: 'ar', label: 'العربية', short: 'AR', dir: 'rtl', htmlLang: 'ar', currencyLocale: 'ar-DZ' },
  en: { code: 'en', label: 'English', short: 'EN', dir: 'ltr', htmlLang: 'en', currencyLocale: 'en-US' },
};

export function isLocale(value: string | undefined | null): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

export function resolveLocale(value: string | undefined | null): Locale {
  return isLocale(value) ? value : defaultLocale;
}

export function dirFor(locale: Locale): 'ltr' | 'rtl' {
  return localeMeta[locale].dir;
}

/** Best-effort negotiation from an Accept-Language header. */
export function negotiateLocale(acceptLanguage: string | null): Locale {
  if (!acceptLanguage) return defaultLocale;
  const ranked = acceptLanguage
    .split(',')
    .map((part) => {
      const [tag, q] = part.trim().split(';q=');
      return { tag: (tag ?? '').trim().toLowerCase(), q: q ? Number.parseFloat(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const { tag } of ranked) {
    const base = tag.split('-')[0];
    if (isLocale(base)) return base;
  }
  return defaultLocale;
}

/**
 * URL segments for the public site.
 *
 * One canonical segment per route, shared by every language: the locale prefix
 * already distinguishes `/fr/projets` from `/en/projets`, and a single segment
 * keeps one route file per page instead of one per language. Route *keys* are
 * what the codebase refers to, so per-locale slugs can be introduced later
 * behind `path()` plus a middleware rewrite without touching any call site.
 */
export const routeSegments = {
  projects: 'projets',
  services: 'services',
  about: 'a-propos',
  blog: 'blog',
  contact: 'contact',
  caseStudies: 'etudes-de-cas',
  request: 'demande-de-projet',
  privacy: 'confidentialite',
  terms: 'mentions-legales',
} as const;

export type RouteKey = keyof typeof routeSegments;

/** Builds a locale-prefixed public URL: path('fr', 'projects', slug). */
export function path(locale: Locale, key?: RouteKey, ...rest: (string | number)[]): string {
  const base = `/${locale}`;
  if (!key) return base;
  return [base, routeSegments[key], ...rest.map(String).filter(Boolean)].join('/');
}

/** Swaps the locale on an existing pathname, for the language switcher. */
export function switchLocalePath(pathname: string, next: Locale): string {
  const segments = pathname.split('/').filter(Boolean);
  if (segments.length === 0) return `/${next}`;
  if (isLocale(segments[0])) {
    segments[0] = next;
    return `/${segments.join('/')}`;
  }
  return `/${next}${pathname}`;
}
