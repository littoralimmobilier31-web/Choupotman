import type { MetadataRoute } from 'next';
import { absoluteUrl, getSiteProfile } from '@/lib/site';

/**
 * robots.txt.
 *
 * Private surfaces are disallowed explicitly — not as a security measure (the
 * guards in `lib/auth` do that) but so they never appear in search results.
 * Setting `seo.index` to false in the admin blocks the whole site, which is what
 * a staging deployment needs.
 */
export default function robots(): MetadataRoute.Robots {
  const profile = getSiteProfile();

  if (!profile.seo.allowIndex) {
    return {
      rules: [{ userAgent: '*', disallow: '/' }],
      sitemap: undefined,
    };
  }

  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/espace-admin',
          '/espace-admin/',
          '/client',
          '/client/',
          '/brief/',
          '/moodboard/',
          '/api/',
          '/uploads/',
          // Filtered listings add no value in an index and waste crawl budget.
          '/*?q=',
          '/*?categorie=',
          '/*?techno=',
          '/*?annee=',
          '/*?tag=',
          '/*/demande-de-projet',
        ],
      },
    ],
    sitemap: absoluteUrl('/sitemap.xml'),
    host: absoluteUrl('/'),
  };
}
