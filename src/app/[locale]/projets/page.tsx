import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { FolderOpen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/misc';
import { ProjectCard } from '@/components/public/cards';
import { ProjectFilters } from '@/components/public/project-filters';
import { getDictionary } from '@/lib/i18n';
import { isLocale, locales, path, type Locale } from '@/lib/i18n/config';
import { absoluteUrl, getSiteProfile, localeAlternates } from '@/lib/site';
import { listPortfolio, portfolioFacets } from '@/lib/db/repositories/content';

/**
 * Projects listing.
 *
 * Filters live in the URL (`?q=&categorie=&techno=&annee=`) rather than in client
 * state: the result is shareable, back-button friendly, and rendered on the
 * server so the list is indexable.
 */

export const revalidate = 300;

type SearchParams = Promise<{ q?: string; categorie?: string; techno?: string; annee?: string }>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isLocale(raw)) return {};
  const dict = getDictionary(raw);
  return {
    title: dict.projects.title,
    description: dict.projects.subtitle,
    alternates: {
      canonical: absoluteUrl(path(raw, 'projects')),
      languages: localeAlternates('/projets', locales),
    },
  };
}

export default async function ProjectsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: SearchParams;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;

  const dict = getDictionary(locale);
  const profile = getSiteProfile();
  const query = await searchParams;

  const facets = portfolioFacets();
  const categoryId = query.categorie ? facets.categories.find((c) => c.slug === query.categorie)?.id : undefined;
  const year = query.annee ? Number.parseInt(query.annee, 10) : undefined;

  const projects = listPortfolio({
    status: 'published',
    locale,
    search: query.q?.trim() || undefined,
    categoryId,
    technology: query.techno || undefined,
    year: Number.isFinite(year) ? year : undefined,
    limit: 60,
  });

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: dict.projects.title,
    description: dict.projects.subtitle,
    url: absoluteUrl(path(locale, 'projects')),
    author: { '@type': 'Person', name: profile.ownerName },
    hasPart: projects.slice(0, 20).map((project) => ({
      '@type': 'CreativeWork',
      name: project.title,
      url: absoluteUrl(path(locale, 'projects', project.slug)),
      dateCreated: project.project_date ?? undefined,
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="relative overflow-hidden border-b border-line">
        <div className="absolute inset-0 -z-10 surface-mesh opacity-60" aria-hidden />
        <div className="container-page py-16 sm:py-20">
          <Badge tone="brand" className="mb-4">
            Portfolio
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{dict.projects.title}</h1>
          <p className="mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-fg-muted">{dict.projects.subtitle}</p>
        </div>
      </section>

      <div className="container-page py-10 sm:py-14">
        <ProjectFilters
          locale={locale}
          dict={dict}
          facets={{
            categories: facets.categories.map((c) => ({ slug: c.slug, name: c.name })),
            technologies: facets.technologies,
            years: facets.years,
          }}
          current={{
            q: query.q ?? '',
            categorie: query.categorie ?? '',
            techno: query.techno ?? '',
            annee: query.annee ?? '',
          }}
          resultCount={projects.length}
        />

        {projects.length === 0 ? (
          <EmptyState
            className="mt-10"
            icon={<FolderOpen className="size-5" />}
            title={dict.projects.empty}
            description={dict.projects.resetFilters}
          />
        ) : (
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} locale={locale} dict={dict} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
