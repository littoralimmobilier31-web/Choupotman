import 'server-only';
import { revalidatePath } from 'next/cache';

/**
 * On-demand revalidation of the public site.
 *
 * The public pages are incrementally regenerated (`revalidate = 600`) because
 * they are read far more often than they change. Left at that alone, an edit in
 * the admin would take up to ten minutes to appear — which reads as "the site is
 * broken", and quietly discourages the owner from filling anything in.
 *
 * So every content mutation calls the matching function here. The pages keep
 * their cache and their speed, and a save shows up immediately.
 *
 * Paths are the route patterns, not concrete URLs: the public site is
 * locale-prefixed, and `revalidatePath(pattern, 'page')` clears every locale at
 * once rather than needing one call per language.
 */

type PublicRoute =
  | 'home' | 'about' | 'services' | 'portfolio' | 'case-studies' | 'blog' | 'legal';

const ROUTES: Record<PublicRoute, string[]> = {
  home: ['/[locale]'],
  about: ['/[locale]/a-propos', '/[locale]'],
  services: ['/[locale]/services', '/[locale]'],
  portfolio: ['/[locale]/projets', '/[locale]/projets/[slug]', '/[locale]'],
  'case-studies': ['/[locale]/etudes-de-cas', '/[locale]/etudes-de-cas/[slug]'],
  blog: ['/[locale]/blog', '/[locale]/blog/[slug]', '/[locale]'],
  legal: ['/[locale]/mentions-legales', '/[locale]/confidentialite'],
};

/**
 * Refreshes the given areas of the public site.
 *
 * Never throws: a revalidation failure must not turn a successful save into an
 * error response. The worst case is the old behaviour — the page refreshes
 * within its normal window.
 */
export function revalidatePublic(...areas: PublicRoute[]): void {
  const paths = new Set(areas.flatMap((area) => ROUTES[area] ?? []));
  for (const path of paths) {
    try {
      revalidatePath(path, 'page');
    } catch {
      // Ignored on purpose; see above.
    }
  }
}

/** Everything — used when a global setting changes the whole site. */
export function revalidateAllPublic(): void {
  revalidatePublic('home', 'about', 'services', 'portfolio', 'case-studies', 'blog', 'legal');
  try {
    revalidatePath('/sitemap.xml');
  } catch {
    // Ignored on purpose.
  }
}
