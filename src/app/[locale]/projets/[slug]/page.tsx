import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  ArrowLeft, ArrowRight, ArrowUpRight, Calendar, ExternalLink,
  ImageOff, Info, PlayCircle, Target, Lightbulb, TrendingUp,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { getDictionary } from '@/lib/i18n';
import { isLocale, locales, path, type Locale } from '@/lib/i18n/config';
import { formatShortDate } from '@/lib/i18n/format';
import { absoluteUrl, getSiteProfile, localeAlternates } from '@/lib/site';
import {
  findPortfolioBySlug, listPortfolio, listPortfolioMedia, portfolioNeighbours,
  listCaseStudies,
} from '@/lib/db/repositories/content';
import { cn } from '@/lib/utils';

/**
 * Project detail.
 *
 * `generateStaticParams` pre-renders every published project per locale, so the
 * page is static HTML at request time with ISR picking up CMS edits.
 */

export const revalidate = 300;

export function generateStaticParams() {
  const projects = listPortfolio({ status: 'published', limit: 200 });
  return locales.flatMap((locale) => projects.map((project) => ({ locale, slug: project.slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw)) return {};
  const project = findPortfolioBySlug(slug, raw);
  if (!project) return { title: 'Projet introuvable' };

  const description = project.seo_description ?? project.summary ?? project.subtitle ?? undefined;

  return {
    title: project.seo_title ?? project.title,
    description: description ?? undefined,
    alternates: {
      canonical: absoluteUrl(path(raw, 'projects', slug)),
      languages: localeAlternates(`/projets/${slug}`, locales),
    },
    openGraph: {
      type: 'article',
      title: project.title,
      description: description ?? undefined,
      url: absoluteUrl(path(raw, 'projects', slug)),
      images: project.cover_url ? [{ url: project.cover_url, alt: project.title }] : undefined,
    },
  };
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;

  const project = findPortfolioBySlug(slug, locale);
  if (!project || project.status !== 'published') notFound();

  const dict = getDictionary(locale);
  const profile = getSiteProfile();
  const media = listPortfolioMedia(project.id);
  const { previous, next } = portfolioNeighbours(project.id, locale);
  const caseStudy = listCaseStudies({ status: 'published', locale, limit: 100 }).find(
    (study) => study.portfolio_id === project.id,
  );

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CreativeWork',
    name: project.title,
    headline: project.title,
    description: project.summary ?? project.subtitle ?? undefined,
    url: absoluteUrl(path(locale, 'projects', slug)),
    image: project.cover_url ?? undefined,
    dateCreated: project.project_date ?? undefined,
    creator: { '@type': 'Person', name: profile.ownerName },
    keywords: project.technologyList.join(', ') || undefined,
  };

  const sections = [
    { key: 'challenge', title: dict.projects.challenge, body: project.challenge, icon: <Info className="size-4" /> },
    { key: 'objectives', title: dict.projects.objectives, body: project.objectives, icon: <Target className="size-4" /> },
    { key: 'solution', title: dict.projects.solution, body: project.solution, icon: <Lightbulb className="size-4" /> },
    { key: 'results', title: dict.projects.results, body: project.results, icon: <TrendingUp className="size-4" /> },
  ].filter((section) => section.body && section.body.trim() !== '');

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <article>
        {/* Header */}
        <header className="relative overflow-hidden border-b border-line">
          <div className="absolute inset-0 -z-10 surface-mesh opacity-60" aria-hidden />
          <div className="container-page py-12 sm:py-16">
            <Link
              href={path(locale, 'projects')}
              className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-fg-muted transition-colors hover:text-fg"
            >
              <ArrowLeft className="size-3.5 rtl:-scale-x-100" />
              {dict.projects.backToProjects}
            </Link>

            <div className="mt-6 flex flex-wrap items-center gap-2.5">
              {project.category_name && <Badge tone="brand">{project.category_name}</Badge>}
              {project.year && (
                <Badge tone="outline">
                  <Calendar className="size-3" />
                  {project.year}
                </Badge>
              )}
              {project.is_demo === 1 && <Badge tone="warning">{dict.projects.demoBadge}</Badge>}
            </div>

            <h1 className="mt-4 max-w-4xl text-3xl font-semibold leading-tight tracking-tight text-fg sm:text-4xl lg:text-[2.75rem]">
              {project.title}
            </h1>
            {project.subtitle && (
              <p className="mt-3 max-w-3xl text-[1.0625rem] text-fg-muted">{project.subtitle}</p>
            )}

            {project.is_demo === 1 && (
              <p className="mt-6 max-w-2xl rounded-lg border border-warning/30 bg-warning-soft px-4 py-3 text-[0.8125rem] leading-relaxed text-warning">
                {dict.projects.demoNotice}
              </p>
            )}

            <dl className="mt-8 grid gap-x-8 gap-y-4 border-t border-line pt-6 sm:grid-cols-2 lg:grid-cols-4">
              {project.client_name && (
                <MetaItem label={dict.projects.client} value={project.client_name} />
              )}
              {project.project_date && (
                <MetaItem label={dict.projects.year} value={formatShortDate(project.project_date, locale)} />
              )}
              {project.serviceList.length > 0 && (
                <MetaItem label={dict.projects.servicesDone} value={project.serviceList.join(', ')} />
              )}
              {project.technologyList.length > 0 && (
                <div className="min-w-0">
                  <dt className="text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-subtle">
                    {dict.projects.technologies}
                  </dt>
                  <dd className="mt-1.5 flex flex-wrap gap-1.5">
                    {project.technologyList.map((tech) => (
                      <Badge key={tech} tone="neutral">
                        {tech}
                      </Badge>
                    ))}
                  </dd>
                </div>
              )}
            </dl>

            {(project.linkList.length > 0 || caseStudy) && (
              <div className="mt-8 flex flex-wrap gap-3">
                {project.linkList.map((link) => (
                  <a
                    key={link.url}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={buttonClass('primary', 'md')}
                  >
                    {link.label || dict.projects.visitSite}
                    <ExternalLink className="size-3.5" />
                  </a>
                ))}
                {caseStudy && (
                  <Link href={path(locale, 'caseStudies', caseStudy.slug)} className={buttonClass('secondary', 'md')}>
                    {dict.projects.caseStudy}
                    <ArrowUpRight className="size-3.5 rtl:-scale-x-100" />
                  </Link>
                )}
              </div>
            )}
          </div>
        </header>

        {/* Cover */}
        {project.cover_url ? (
          <div className="container-page -mt-2 pb-4 pt-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={project.cover_url}
              alt={project.title}
              className="w-full rounded-[var(--radius-card)] border border-line object-cover shadow-raised"
            />
          </div>
        ) : null}

        {/* Narrative */}
        {(project.description || sections.length > 0) && (
          <section className="container-page py-14 sm:py-16">
            <div className="grid gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:gap-16">
              <div>
                {project.description && (
                  <div className="rich-text max-w-none whitespace-pre-line text-[0.9375rem]">
                    {project.description}
                  </div>
                )}

                {sections.length > 0 && (
                  <div className="mt-12 space-y-10">
                    {sections.map((section) => (
                      <div key={section.key}>
                        <h2 className="flex items-center gap-2.5 text-[1.125rem] font-semibold text-fg">
                          <span className="flex size-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
                            {section.icon}
                          </span>
                          {section.title}
                        </h2>
                        <p className="mt-3 whitespace-pre-line text-[0.9375rem] leading-relaxed text-fg-muted">
                          {section.body}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
                {project.metricList.length > 0 && (
                  <div className="rounded-[var(--radius-card)] border border-line bg-surface-raised p-5 shadow-soft">
                    <h2 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-subtle">
                      {dict.projects.results}
                    </h2>
                    <dl className="mt-4 space-y-4">
                      {project.metricList.map((metric) => (
                        <div key={metric.label}>
                          <dd className="text-[1.375rem] font-semibold leading-none text-fg">{metric.value}</dd>
                          <dt className="mt-1 text-[0.75rem] text-fg-muted">{metric.label}</dt>
                          {metric.note && <p className="text-[0.6875rem] text-fg-subtle">{metric.note}</p>}
                        </div>
                      ))}
                    </dl>
                  </div>
                )}

                {project.testimonial_quote && (
                  <figure className="rounded-[var(--radius-card)] border border-line bg-surface-raised p-5 shadow-soft">
                    <h2 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-subtle">
                      {dict.projects.testimonial}
                    </h2>
                    <blockquote className="mt-3 text-[0.875rem] leading-relaxed text-fg">
                      “{project.testimonial_quote}”
                    </blockquote>
                    {project.testimonial_author && (
                      <figcaption className="mt-3 text-[0.75rem] text-fg-subtle">
                        {[project.testimonial_author, project.testimonial_role].filter(Boolean).join(' · ')}
                      </figcaption>
                    )}
                  </figure>
                )}

                <div className="rounded-[var(--radius-card)] border border-line bg-accent-soft p-5">
                  <p className="text-[0.875rem] font-semibold text-accent">{dict.home.ctaWork}</p>
                  <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-fg-muted">
                    {dict.home.contactSubtitle}
                  </p>
                  <Link href={path(locale, 'request')} className={buttonClass('primary', 'sm', 'mt-4 w-full')}>
                    {dict.nav.requestQuote}
                  </Link>
                </div>
              </aside>
            </div>
          </section>
        )}

        {/* Gallery */}
        {media.filter((item) => item.kind === 'image').length > 0 && (
          <section className="border-t border-line bg-surface-sunken/30 py-14">
            <div className="container-page">
              <h2 className="text-[1.125rem] font-semibold text-fg">{dict.projects.gallery}</h2>
              <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {media
                  .filter((item) => item.kind === 'image')
                  .map((item) => (
                    <li key={item.id} className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface-raised">
                      {item.url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.url}
                          alt={item.alt_text ?? item.caption ?? project.title}
                          loading="lazy"
                          className="aspect-[4/3] w-full object-cover"
                        />
                      ) : (
                        <div className="flex aspect-[4/3] items-center justify-center bg-surface-sunken text-fg-subtle">
                          <ImageOff className="size-5" />
                        </div>
                      )}
                      {item.caption && (
                        <p className="px-4 py-3 text-[0.75rem] text-fg-muted">{item.caption}</p>
                      )}
                    </li>
                  ))}
              </ul>
            </div>
          </section>
        )}

        {/* Videos */}
        {project.videoList.length > 0 && (
          <section className="container-page py-14">
            <h2 className="text-[1.125rem] font-semibold text-fg">{dict.projects.videos}</h2>
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {project.videoList.map((video) => (
                <li key={video.url}>
                  <a
                    href={video.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface-raised p-4 shadow-soft transition-colors hover:border-accent"
                  >
                    <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent">
                      <PlayCircle className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.875rem] font-medium text-fg">{video.title}</span>
                      <span className="block truncate text-[0.6875rem] text-fg-subtle">{video.url}</span>
                    </span>
                    <ArrowUpRight className="size-4 shrink-0 text-fg-subtle transition-transform group-hover:-translate-y-0.5 rtl:-scale-x-100" />
                  </a>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Neighbours */}
        {(previous || next) && (
          <nav className="border-t border-line py-10" aria-label={dict.projects.nextProject}>
            <div className="container-page grid gap-4 sm:grid-cols-2">
              {previous ? (
                <Link
                  href={path(locale, 'projects', previous.slug)}
                  className="group flex flex-col rounded-[var(--radius-card)] border border-line bg-surface-raised p-5 shadow-soft transition-colors hover:border-accent"
                >
                  <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-subtle">
                    <ArrowLeft className="size-3 rtl:-scale-x-100" />
                    {dict.projects.previousProject}
                  </span>
                  <span className="mt-2 text-[0.9375rem] font-semibold text-fg group-hover:text-accent">
                    {previous.title}
                  </span>
                </Link>
              ) : (
                <span />
              )}
              {next && (
                <Link
                  href={path(locale, 'projects', next.slug)}
                  className={cn(
                    'group flex flex-col rounded-[var(--radius-card)] border border-line bg-surface-raised p-5 shadow-soft transition-colors hover:border-accent',
                    'sm:items-end sm:text-end',
                  )}
                >
                  <span className="inline-flex items-center gap-1.5 text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-subtle">
                    {dict.projects.nextProject}
                    <ArrowRight className="size-3 rtl:-scale-x-100" />
                  </span>
                  <span className="mt-2 text-[0.9375rem] font-semibold text-fg group-hover:text-accent">
                    {next.title}
                  </span>
                </Link>
              )}
            </div>
          </nav>
        )}
      </article>
    </>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-subtle">{label}</dt>
      <dd className="mt-1.5 text-[0.875rem] font-medium text-fg">{value}</dd>
    </div>
  );
}
