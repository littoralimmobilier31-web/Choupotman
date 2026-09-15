import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, ArrowRight, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { getDictionary } from '@/lib/i18n';
import { isLocale, locales, path, type Locale } from '@/lib/i18n/config';
import { absoluteUrl, getSiteProfile, localeAlternates } from '@/lib/site';
import { findCaseStudyBySlug, findPortfolio, listCaseStudies } from '@/lib/db/repositories/content';

/**
 * Case study detail — the structure the brief asks for, in order:
 * problem → objectives → strategy → solution → development → tools → result →
 * metrics → gallery → testimonial → next study. Each block renders only when it
 * has content.
 */

export const revalidate = 300;

export function generateStaticParams() {
  const studies = listCaseStudies({ status: 'published', limit: 200 });
  return locales.flatMap((locale) => studies.map((study) => ({ locale, slug: study.slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw)) return {};
  const study = findCaseStudyBySlug(slug, raw);
  if (!study) return { title: 'Étude de cas introuvable' };

  return {
    title: study.seo_title ?? study.title,
    description: study.seo_description ?? study.subtitle ?? study.problem ?? undefined,
    alternates: {
      canonical: absoluteUrl(path(raw, 'caseStudies', slug)),
      languages: localeAlternates(`/etudes-de-cas/${slug}`, locales),
    },
    openGraph: {
      type: 'article',
      title: study.title,
      description: study.subtitle ?? undefined,
      images: study.cover_url ? [{ url: study.cover_url, alt: study.title }] : undefined,
    },
  };
}

export default async function CaseStudyPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;

  const study = findCaseStudyBySlug(slug, locale);
  if (!study || study.status !== 'published') notFound();

  const dict = getDictionary(locale);
  const profile = getSiteProfile();
  const related = study.portfolio_id ? findPortfolio(study.portfolio_id, locale) : null;

  const all = listCaseStudies({ status: 'published', locale, limit: 100 });
  const index = all.findIndex((s) => s.id === study.id);
  const next = index >= 0 && index < all.length - 1 ? all[index + 1] : all[0]?.id === study.id ? null : all[0];

  const sections = [
    { title: dict.caseStudy.problem, body: study.problem },
    { title: dict.caseStudy.objectives, body: study.objectives },
    { title: dict.caseStudy.strategy, body: study.strategy },
    { title: dict.caseStudy.solution, body: study.solution },
    { title: dict.caseStudy.development, body: study.development },
    { title: dict.caseStudy.tools, body: study.tools_used },
    { title: dict.caseStudy.result, body: study.result },
  ].filter((section) => section.body && section.body.trim() !== '');

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: study.title,
    description: study.subtitle ?? study.problem ?? undefined,
    image: study.cover_url ?? undefined,
    datePublished: study.published_at ?? undefined,
    dateModified: study.updated_at,
    author: { '@type': 'Person', name: profile.ownerName },
    publisher: { '@type': 'Person', name: profile.ownerName },
    mainEntityOfPage: absoluteUrl(path(locale, 'caseStudies', slug)),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <article>
        <header className="relative overflow-hidden border-b border-line">
          <div className="absolute inset-0 -z-10 surface-mesh opacity-60" aria-hidden />
          <div className="container-page py-12 sm:py-16">
            <Link
              href={path(locale, 'caseStudies')}
              className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-fg-muted transition-colors hover:text-fg"
            >
              <ArrowLeft className="size-3.5 rtl:-scale-x-100" />
              {dict.caseStudy.title}
            </Link>

            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              <Badge tone="brand">{dict.caseStudy.title}</Badge>
              {study.reading_minutes && (
                <Badge tone="outline">
                  <Clock className="size-3" />
                  {study.reading_minutes} {dict.caseStudy.readingTime}
                </Badge>
              )}
              {study.is_demo === 1 && <Badge tone="warning">{dict.projects.demoBadge}</Badge>}
            </div>

            <h1 className="mt-4 max-w-4xl text-3xl font-semibold leading-tight tracking-tight text-fg sm:text-4xl">
              {study.title}
            </h1>
            {study.subtitle && <p className="mt-3 max-w-3xl text-[1.0625rem] text-fg-muted">{study.subtitle}</p>}

            {study.is_demo === 1 && (
              <p className="mt-6 max-w-2xl rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-[0.8125rem] leading-relaxed text-warning">
                {dict.projects.demoNotice}
              </p>
            )}
          </div>
        </header>

        {study.cover_url && (
          <div className="container-page pt-10">
            { }
            <img
              src={study.cover_url}
              alt={study.title}
              className="w-full rounded-[var(--radius-card)] border border-line object-cover shadow-raised"
            />
          </div>
        )}

        {study.metricList.length > 0 && (
          <section className="container-page pt-12">
            <h2 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-subtle">
              {dict.caseStudy.metrics}
            </h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {study.metricList.map((metric) => (
                <div
                  key={metric.label}
                  className="rounded-[var(--radius-card)] border border-line bg-surface-raised p-5 shadow-soft"
                >
                  <dd className="text-[1.75rem] font-semibold leading-none text-fg">{metric.value}</dd>
                  <dt className="mt-2 text-[0.8125rem] text-fg-muted">{metric.label}</dt>
                  {metric.note && <p className="mt-0.5 text-[0.6875rem] text-fg-subtle">{metric.note}</p>}
                </div>
              ))}
            </dl>
          </section>
        )}

        <section className="container-prose py-14 sm:py-16">
          <div className="space-y-12">
            {sections.map((section, i) => (
              <section key={section.title}>
                <h2 className="flex items-baseline gap-3 text-[1.25rem] font-semibold text-fg">
                  <span className="text-[0.875rem] font-semibold text-accent">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  {section.title}
                </h2>
                <div className="rich-text mt-3 whitespace-pre-line">{section.body}</div>
              </section>
            ))}
          </div>

          {study.testimonial_quote && (
            <figure className="mt-14 rounded-[var(--radius-card)] border-s-4 border-accent bg-surface-sunken/50 px-6 py-5">
              <h2 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-subtle">
                {dict.caseStudy.testimonial}
              </h2>
              <blockquote className="mt-3 text-[1rem] italic leading-relaxed text-fg">
                “{study.testimonial_quote}”
              </blockquote>
              {study.testimonial_author && (
                <figcaption className="mt-3 text-[0.8125rem] text-fg-subtle">{study.testimonial_author}</figcaption>
              )}
            </figure>
          )}

          {related && (
            <div className="mt-14 rounded-[var(--radius-card)] border border-line bg-surface-raised p-5 shadow-soft">
              <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-subtle">
                {dict.projects.title}
              </p>
              <Link
                href={path(locale, 'projects', related.slug)}
                className="mt-2 inline-flex items-center gap-2 text-[1rem] font-semibold text-fg transition-colors hover:text-accent"
              >
                {related.title}
                <ArrowRight className="size-4 rtl:-scale-x-100" />
              </Link>
            </div>
          )}
        </section>

        <section className="border-t border-line bg-surface-sunken/30 py-12">
          <div className="container-page flex flex-wrap items-center justify-between gap-6">
            {next ? (
              <Link
                href={path(locale, 'caseStudies', next.slug)}
                className="group min-w-0 flex-1"
              >
                <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-subtle">
                  {dict.caseStudy.next}
                </span>
                <span className="mt-1 flex items-center gap-2 text-[1.0625rem] font-semibold text-fg group-hover:text-accent">
                  {next.title}
                  <ArrowRight className="size-4 rtl:-scale-x-100" />
                </span>
              </Link>
            ) : (
              <span />
            )}
            <Link href={path(locale, 'request')} className={buttonClass('primary', 'md')}>
              {dict.nav.requestQuote}
            </Link>
          </div>
        </section>
      </article>
    </>
  );
}
