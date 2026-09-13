import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowRight, Bot, Camera, Code2, Megaphone, Server, Sparkles } from 'lucide-react';
import { buttonClass } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState, SectionHeading } from '@/components/ui/misc';
import { ServiceCard } from '@/components/public/cards';
import { getDictionary } from '@/lib/i18n';
import { isLocale, locales, path, type Locale } from '@/lib/i18n/config';
import { absoluteUrl, getSiteProfile, localeAlternates } from '@/lib/site';
import { listFaqs, servicesByFamily } from '@/lib/db/repositories/content';

export const revalidate = 600;

const FAMILY_ICONS: Record<string, React.ReactNode> = {
  web: <Code2 className="size-5" />,
  it: <Server className="size-5" />,
  marketing: <Megaphone className="size-5" />,
  audiovisual: <Camera className="size-5" />,
  ai: <Bot className="size-5" />,
};

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isLocale(raw)) return {};
  const dict = getDictionary(raw);
  return {
    title: dict.services.title,
    description: dict.services.subtitle,
    alternates: {
      canonical: absoluteUrl(path(raw, 'services')),
      languages: localeAlternates('/services', locales),
    },
  };
}

export default async function ServicesPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;

  const dict = getDictionary(locale);
  const profile = getSiteProfile();
  const groups = servicesByFamily(locale);
  const faqs = listFaqs({ publishedOnly: true, locale });

  /**
   * Schema.org for the service catalogue — one Service node per published
   * service, so search engines can surface the offering directly.
   */
  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: dict.services.title,
    itemListElement: groups.flatMap((group, groupIndex) =>
      group.services.map((service, index) => ({
        '@type': 'ListItem',
        position: groupIndex * 100 + index + 1,
        item: {
          '@type': 'Service',
          name: service.name,
          description: service.short_description ?? undefined,
          serviceType: group.label,
          provider: { '@type': 'Person', name: profile.ownerName },
          areaServed: profile.location ?? undefined,
          url: absoluteUrl(`${path(locale, 'services')}#${service.slug}`),
        },
      })),
    ),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="relative overflow-hidden border-b border-line">
        <div className="absolute inset-0 -z-10 surface-mesh opacity-60" aria-hidden />
        <div className="container-page py-16 sm:py-20">
          <Badge tone="brand" className="mb-4">
            Services
          </Badge>
          <h1 className="max-w-3xl text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            {dict.services.title}
          </h1>
          <p className="mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-fg-muted">{dict.services.subtitle}</p>

          {groups.length > 0 && (
            <nav className="mt-8 flex flex-wrap gap-2" aria-label={dict.services.title}>
              {groups.map((group) => (
                <a
                  key={group.family}
                  href={`#famille-${group.family}`}
                  className="inline-flex items-center gap-2 rounded-lg border border-line bg-surface-raised px-3 py-2 text-[0.8125rem] font-medium text-fg-muted transition-colors hover:border-accent hover:text-fg"
                >
                  <span className="text-accent">{FAMILY_ICONS[group.family] ?? <Sparkles className="size-4" />}</span>
                  {group.label}
                  <span className="text-[0.6875rem] text-fg-subtle">{group.services.length}</span>
                </a>
              ))}
            </nav>
          )}
        </div>
      </section>

      {groups.length === 0 ? (
        <div className="container-page py-20">
          <EmptyState icon={<Sparkles className="size-5" />} title={dict.services.empty} />
        </div>
      ) : (
        groups.map((group, index) => (
          <section
            key={group.family}
            id={`famille-${group.family}`}
            className={index % 2 === 1 ? 'border-y border-line bg-surface-sunken/30' : ''}
          >
            <div className="container-page scroll-mt-20 py-16 sm:py-20">
              <SectionHeading
                eyebrow={`${group.services.length} ${group.services.length > 1 ? 'prestations' : 'prestation'}`}
                title={group.label}
                description={group.description}
              />
              <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {group.services.map((service) => (
                  <ServiceCard key={service.id} service={service} locale={locale} dict={dict} />
                ))}
              </div>
            </div>
          </section>
        ))
      )}

      {faqs.length > 0 && (
        <section className="border-t border-line py-16 sm:py-20">
          <div className="container-prose">
            <SectionHeading eyebrow="FAQ" title="Questions fréquentes" align="center" />
            <div className="mt-10 space-y-3">
              {faqs.map((faq) => (
                <details
                  key={faq.id}
                  className="group rounded-[var(--radius-card)] border border-line bg-surface-raised px-5 py-4 shadow-soft"
                >
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[0.9375rem] font-medium text-fg">
                    {faq.question}
                    <span className="shrink-0 text-fg-subtle transition-transform group-open:rotate-45" aria-hidden>
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-[0.875rem] leading-relaxed text-fg-muted">{faq.answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="border-t border-line bg-surface-sunken/40 py-16">
        <div className="container-page flex flex-wrap items-center justify-between gap-6">
          <div className="max-w-xl">
            <h2 className="text-xl font-semibold text-fg sm:text-2xl">{dict.home.contactTitle}</h2>
            <p className="mt-2 text-[0.875rem] leading-relaxed text-fg-muted">{dict.home.contactSubtitle}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href={path(locale, 'request')} className={buttonClass('primary', 'lg')}>
              {dict.nav.requestQuote}
              <ArrowRight className="size-4 rtl:-scale-x-100" />
            </Link>
            <Link href={path(locale, 'contact')} className={buttonClass('secondary', 'lg')}>
              {dict.home.ctaContact}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
