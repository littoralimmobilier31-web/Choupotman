import { fr } from './dictionaries/fr';
import { ar } from './dictionaries/ar';
import { en } from './dictionaries/en';
import { defaultLocale, type Locale } from './config';
import type { Dictionary } from './types';

const dictionaries: Record<Locale, Dictionary> = { fr, ar, en };

/**
 * Dictionaries are plain objects bundled at build time — no async loading, no
 * request waterfall, and a missing key is caught by TypeScript.
 */
export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries[defaultLocale];
}

export type { Dictionary };
export * from './config';
export * from './format';
