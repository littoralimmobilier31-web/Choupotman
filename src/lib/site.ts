import 'server-only';
import { getSettingsMap } from '@/lib/db/repositories/settings';
import { config } from '@/lib/config';
import type { Locale } from '@/lib/i18n/config';

/**
 * Public-site data resolved from settings.
 *
 * Every string here is CMS-editable. When a value has never been filled in it
 * comes back as `null` rather than as invented copy: the pages then render a
 * neutral placeholder or hide the section entirely. That is what keeps the site
 * from ever publishing a claim — a statistic, a job title, a bio — that the
 * owner did not actually write.
 */

export type SocialLink = { key: string; label: string; url: string };

export type SiteProfile = {
  ownerName: string;
  productName: string;
  tagline: string;
  roleLabel: string | null;
  headline: string | null;
  subheadline: string | null;
  shortBio: string | null;
  longBio: string | null;
  avatarUrl: string | null;
  ogImage: string | null;
  location: string | null;
  availability: string | null;
  cvUrl: string | null;

  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: string | null;
  hours: string | null;
  responseTime: string | null;
  bookingUrl: string | null;

  social: SocialLink[];

  seo: { title: string; description: string; keywords: string; allowIndex: boolean; canonicalHost: string };

  show: {
    stats: boolean;
    testimonials: boolean;
    technologies: boolean;
    blog: boolean;
    process: boolean;
    chatbot: boolean;
  };

  /** Only the counters the owner has actually entered. */
  stats: { key: string; value: string }[];

  legal: {
    companyName: string | null;
    taxId: string | null;
    registration: string | null;
    privacyText: string | null;
    termsText: string | null;
  };
};

const SOCIAL_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn',
  instagram: 'Instagram',
  facebook: 'Facebook',
  github: 'GitHub',
  youtube: 'YouTube',
  tiktok: 'TikTok',
  behance: 'Behance',
};

function value(map: Record<string, string>, key: string): string | null {
  const raw = map[key];
  return raw && raw.trim() !== '' ? raw.trim() : null;
}

function flag(map: Record<string, string>, key: string, fallback = true): boolean {
  const raw = map[key];
  if (raw === undefined || raw === '') return fallback;
  return raw === '1' || raw.toLowerCase() === 'true';
}

export function getSiteProfile(): SiteProfile {
  const map = getSettingsMap();

  const social: SocialLink[] = Object.keys(SOCIAL_LABELS)
    .map((key) => ({ key, label: SOCIAL_LABELS[key] as string, url: value(map, `social.${key}`) ?? '' }))
    .filter((link) => link.url !== '');

  const stats = [
    { key: 'projects', value: value(map, 'home.stat_projects') },
    { key: 'clients', value: value(map, 'home.stat_clients') },
    { key: 'years', value: value(map, 'home.stat_years') },
    { key: 'satisfaction', value: value(map, 'home.stat_satisfaction') },
  ].filter((stat): stat is { key: string; value: string } => stat.value !== null);

  return {
    ownerName: value(map, 'site.owner_name') ?? config.site.owner,
    productName: value(map, 'site.product_name') ?? config.site.productName,
    tagline: value(map, 'site.tagline') ?? config.site.tagline,
    roleLabel: value(map, 'site.role_label'),
    headline: value(map, 'site.headline'),
    subheadline: value(map, 'site.subheadline'),
    shortBio: value(map, 'site.short_bio'),
    longBio: value(map, 'site.long_bio'),
    avatarUrl: value(map, 'site.avatar_url'),
    ogImage: value(map, 'site.og_image'),
    location: value(map, 'site.location'),
    availability: value(map, 'site.availability'),
    cvUrl: value(map, 'site.cv_url'),

    email: value(map, 'contact.email'),
    phone: value(map, 'contact.phone'),
    whatsapp: value(map, 'contact.whatsapp'),
    address: value(map, 'contact.address'),
    hours: value(map, 'contact.hours'),
    responseTime: value(map, 'contact.response_time'),
    bookingUrl: value(map, 'contact.booking_url'),

    social,

    seo: {
      title: value(map, 'seo.title') ?? 'Boubaker Choupotman',
      description: value(map, 'seo.description') ?? '',
      keywords: value(map, 'seo.keywords') ?? '',
      allowIndex: flag(map, 'seo.index', true),
      canonicalHost: value(map, 'seo.canonical_host') ?? config.site.domain,
    },

    show: {
      stats: flag(map, 'home.show_stats') && stats.length > 0,
      testimonials: flag(map, 'home.show_testimonials'),
      technologies: flag(map, 'home.show_technologies'),
      blog: flag(map, 'home.show_blog'),
      process: flag(map, 'home.show_process'),
      chatbot: flag(map, 'ai.chatbot_enabled'),
    },

    stats,

    legal: {
      companyName: value(map, 'legal.company_name'),
      taxId: value(map, 'legal.tax_id'),
      registration: value(map, 'legal.registration'),
      privacyText: value(map, 'legal.privacy_text'),
      termsText: value(map, 'legal.terms_text'),
    },
  };
}

/** Canonical absolute URL for a path, used by metadata and the sitemap. */
export function absoluteUrl(path: string): string {
  const base = config.site.url.replace(/\/$/, '');
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

/** hreflang alternates for a locale-prefixed path. */
export function localeAlternates(
  pathWithoutLocale: string,
  locales: readonly Locale[],
): Record<string, string> {
  const suffix = pathWithoutLocale.replace(/^\/+/, '');
  return Object.fromEntries(
    locales.map((locale) => [locale, absoluteUrl(`/${locale}${suffix ? `/${suffix}` : ''}`)]),
  );
}
