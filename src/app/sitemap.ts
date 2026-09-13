import type { MetadataRoute } from 'next';
import { locales, path, routeSegments } from '@/lib/i18n/config';
import { absoluteUrl, getSiteProfile } from '@/lib/site';
import { listCaseStudies, listPortfolio, listPosts } from '@/lib/db/repositories/content';

/**
 * Sitemap.
 *
 * Every public URL is emitted once per locale with `alternates.languages`, so
 * search engines see the three language versions as one page rather than as
 * duplicates. When indexing is disabled in settings the sitemap comes back
 * empty — there is no point advertising URLs that robots.txt forbids.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const profile = getSiteProfile();
  if (!profile.seo.allowIndex) return [];

  const entries: MetadataRoute.Sitemap = [];

  const languagesFor = (suffix: string) =>
    Object.fromEntries(locales.map((locale) => [locale, absoluteUrl(`/${locale}${suffix}`)]));

  // Static pages
  const staticPages: { suffix: string; priority: number; frequency: MetadataRoute.Sitemap[number]['changeFrequency'] }[] = [
    { suffix: '', priority: 1, frequency: 'weekly' },
    { suffix: `/${routeSegments.projects}`, priority: 0.9, frequency: 'weekly' },
    { suffix: `/${routeSegments.services}`, priority: 0.9, frequency: 'monthly' },
    { suffix: `/${routeSegments.about}`, priority: 0.8, frequency: 'monthly' },
    { suffix: `/${routeSegments.caseStudies}`, priority: 0.8, frequency: 'weekly' },
    { suffix: `/${routeSegments.blog}`, priority: 0.8, frequency: 'weekly' },
    { suffix: `/${routeSegments.contact}`, priority: 0.7, frequency: 'monthly' },
    { suffix: `/${routeSegments.privacy}`, priority: 0.3, frequency: 'yearly' },
    { suffix: `/${routeSegments.terms}`, priority: 0.3, frequency: 'yearly' },
  ];

  for (const page of staticPages) {
    for (const locale of locales) {
      entries.push({
        url: absoluteUrl(`/${locale}${page.suffix}`),
        lastModified: new Date(),
        changeFrequency: page.frequency,
        priority: page.priority,
        alternates: { languages: languagesFor(page.suffix) },
      });
    }
  }

  // Portfolio
  for (const project of listPortfolio({ status: 'published', limit: 500 })) {
    const suffix = `/${routeSegments.projects}/${project.slug}`;
    for (const locale of locales) {
      entries.push({
        url: absoluteUrl(`/${locale}${suffix}`),
        lastModified: new Date(project.updated_at),
        changeFrequency: 'monthly',
        priority: project.is_featured === 1 ? 0.9 : 0.7,
        alternates: { languages: languagesFor(suffix) },
      });
    }
  }

  // Case studies
  for (const study of listCaseStudies({ status: 'published', limit: 500 })) {
    const suffix = `/${routeSegments.caseStudies}/${study.slug}`;
    for (const locale of locales) {
      entries.push({
        url: absoluteUrl(`/${locale}${suffix}`),
        lastModified: new Date(study.updated_at),
        changeFrequency: 'monthly',
        priority: 0.7,
        alternates: { languages: languagesFor(suffix) },
      });
    }
  }

  // Blog
  for (const post of listPosts({ status: 'published', limit: 1000 })) {
    const suffix = `/${routeSegments.blog}/${post.slug}`;
    for (const locale of locales) {
      entries.push({
        url: absoluteUrl(`/${locale}${suffix}`),
        lastModified: new Date(post.updated_at),
        changeFrequency: 'monthly',
        priority: post.is_featured === 1 ? 0.8 : 0.6,
        alternates: { languages: languagesFor(suffix) },
      });
    }
  }

  return entries;
}

export { path };
