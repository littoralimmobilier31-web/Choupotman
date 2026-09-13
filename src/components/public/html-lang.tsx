'use client';

import { useEffect } from 'react';
import { dirFor, localeMeta, type Locale } from '@/lib/i18n/config';

/**
 * Syncs `<html lang>` and `<html dir>` with the active locale.
 *
 * The root layout is shared by localised public pages and by non-localised
 * routes (admin, client portal, public brief links), so it cannot set these
 * attributes itself. Doing it here keeps Arabic RTL correct without duplicating
 * the whole document shell per locale.
 */
export function HtmlLang({ locale }: { locale: Locale }) {
  useEffect(() => {
    const root = document.documentElement;
    root.lang = localeMeta[locale].htmlLang;
    root.dir = dirFor(locale);
  }, [locale]);

  return null;
}
