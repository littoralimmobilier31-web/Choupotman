import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { RequestWizard } from '@/components/public/request-wizard';
import { getDictionary } from '@/lib/i18n';
import { isLocale, locales, path, type Locale } from '@/lib/i18n/config';
import { absoluteUrl, localeAlternates } from '@/lib/site';
import { listServices } from '@/lib/db/repositories/content';

export const revalidate = 600;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isLocale(raw)) return {};
  const dict = getDictionary(raw);
  return {
    title: dict.request.title,
    description: dict.request.subtitle,
    // A form page has no value in search results and should not compete with
    // the pages that do.
    robots: { index: false, follow: true },
    alternates: {
      canonical: absoluteUrl(path(raw, 'request')),
      languages: localeAlternates('/demande-de-projet', locales),
    },
  };
}

export default async function ProjectRequestPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ service?: string }>;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;

  const dict = getDictionary(locale);
  const query = await searchParams;
  const services = listServices({ publishedOnly: true, locale });
  const defaultService = query.service
    ? services.find((s) => s.slug === query.service)?.name
    : undefined;

  return (
    <>
      <section className="relative overflow-hidden border-b border-line">
        <div className="absolute inset-0 -z-10 surface-mesh opacity-60" aria-hidden />
        <div className="container-page py-14 sm:py-16">
          <Badge tone="brand" className="mb-4">
            {dict.nav.requestQuote}
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{dict.request.title}</h1>
          <p className="mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-fg-muted">{dict.request.subtitle}</p>
        </div>
      </section>

      <div className="container-page py-12">
        <div className="mx-auto max-w-3xl">
          <RequestWizard
            locale={locale}
            dict={dict}
            services={services.map((s) => ({ slug: s.slug, name: s.name }))}
            defaultService={defaultService}
          />
        </div>
      </div>
    </>
  );
}
