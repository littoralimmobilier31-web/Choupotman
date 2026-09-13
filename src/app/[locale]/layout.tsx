import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import { SiteHeader } from '@/components/public/site-header';
import { SiteFooter } from '@/components/public/site-footer';
import { Chatbot } from '@/components/public/chatbot';
import { getDictionary } from '@/lib/i18n';
import { dirFor, isLocale, locales, path, localeMeta, type Locale } from '@/lib/i18n/config';
import { getSiteProfile, absoluteUrl, localeAlternates } from '@/lib/site';
import { getSetting } from '@/lib/db/repositories/settings';
import { listServices } from '@/lib/db/repositories/content';
import { HtmlLang } from '@/components/public/html-lang';

/**
 * Public site shell.
 *
 * `generateStaticParams` pre-renders one shell per locale. `dir` and `lang` are
 * applied to `<html>` by a small client effect (see `HtmlLang`) because the root
 * layout is shared with non-localised routes and cannot know the locale.
 */

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isLocale(raw)) return {};
  const locale = raw;
  const dict = getDictionary(locale);
  const profile = getSiteProfile();

  return {
    title: { default: profile.seo.title || dict.meta.siteTitle, template: `%s · ${profile.ownerName}` },
    description: profile.seo.description || dict.meta.siteDescription,
    keywords: profile.seo.keywords ? profile.seo.keywords.split(',').map((k) => k.trim()) : undefined,
    robots: profile.seo.allowIndex ? { index: true, follow: true } : { index: false, follow: false },
    alternates: {
      canonical: absoluteUrl(`/${locale}`),
      languages: localeAlternates('/', locales),
    },
    openGraph: {
      type: 'website',
      locale: localeMeta[locale].htmlLang,
      url: absoluteUrl(`/${locale}`),
      siteName: profile.ownerName,
      title: profile.seo.title || dict.meta.siteTitle,
      description: profile.seo.description || dict.meta.siteDescription,
      images: profile.ogImage ? [{ url: profile.ogImage, alt: dict.meta.ogAlt }] : undefined,
    },
    twitter: {
      card: 'summary_large_image',
      title: profile.seo.title || dict.meta.siteTitle,
      description: profile.seo.description || dict.meta.siteDescription,
      images: profile.ogImage ? [profile.ogImage] : undefined,
    },
  };
}

export default async function PublicLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;

  const dict = getDictionary(locale);
  const profile = getSiteProfile();
  const services = listServices({ publishedOnly: true, locale });

  const serviceLinks = services.slice(0, 6).map((service) => ({
    label: service.name,
    href: `${path(locale, 'services')}#${service.slug}`,
  }));

  return (
    <div dir={dirFor(locale)} id="top" className="flex min-h-dvh flex-col">
      <HtmlLang locale={locale} />

      <a
        href="#contenu"
        className="sr-only focus:not-sr-only focus:fixed focus:start-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-accent focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-accent-fg"
      >
        {dict.common.skipToContent}
      </a>

      <SiteHeader locale={locale} dict={dict} ownerName={profile.ownerName} />

      <main id="contenu" className="flex-1">
        {children}
      </main>

      <SiteFooter locale={locale} dict={dict} profile={profile} serviceLinks={serviceLinks} />

      {profile.show.chatbot && (
        <Chatbot
          locale={locale}
          dict={dict}
          greeting={getSetting('ai.chatbot_greeting', '')}
          assistantName={getSetting('ai.assistant_name', 'Choupotman AI')}
        />
      )}
    </div>
  );
}
