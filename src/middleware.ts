import { NextResponse, type NextRequest } from 'next/server';
import { defaultLocale, isLocale, locales, negotiateLocale } from '@/lib/i18n/config';

/**
 * Locale routing and canonical-host redirects.
 *
 * Runs on the Edge, so it deliberately touches nothing server-only: no database,
 * no session decoding. Route protection lives in `lib/auth/guard.ts`, where the
 * session can actually be verified — a middleware cookie check would only be a
 * cosmetic gate, and treating it as security would be a mistake.
 */

const LOCALE_COOKIE = 'chp_locale';

/** Paths that must never receive a locale prefix. */
const BARE_PREFIXES = [
  '/espace-admin',
  '/client',
  '/brief',
  '/moodboard',
  '/api',
  '/_next',
  '/uploads',
];

const BARE_FILES = [
  '/favicon.ico',
  '/robots.txt',
  '/sitemap.xml',
  '/manifest.webmanifest',
  '/sw.js',
  '/icon.svg',
  '/apple-icon.png',
  '/opengraph-image.png',
];

function isBarePath(pathname: string): boolean {
  if (BARE_FILES.includes(pathname)) return true;
  if (BARE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return true;
  // Any request for a concrete file (has an extension) is served as-is.
  return /\.[a-z0-9]+$/i.test(pathname);
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname, search } = request.nextUrl;

  if (isBarePath(pathname)) return NextResponse.next();

  const firstSegment = pathname.split('/')[1] ?? '';

  // Already locale-prefixed: remember the choice so the next bare visit lands
  // on the same language.
  if (isLocale(firstSegment)) {
    const response = NextResponse.next();
    if (request.cookies.get(LOCALE_COOKIE)?.value !== firstSegment) {
      response.cookies.set(LOCALE_COOKIE, firstSegment, {
        path: '/',
        maxAge: 60 * 60 * 24 * 365,
        sameSite: 'lax',
      });
    }
    return response;
  }

  // Otherwise pick a locale: explicit cookie first, then Accept-Language.
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(cookieLocale)
    ? cookieLocale
    : negotiateLocale(request.headers.get('accept-language')) || defaultLocale;

  const url = request.nextUrl.clone();
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
  url.search = search;
  return NextResponse.redirect(url);
}

export const config = {
  /**
   * Skip the middleware entirely for static assets and API routes. Keeping the
   * matcher narrow matters: this runs on every request.
   */
  matcher: ['/((?!_next/static|_next/image|api|uploads|favicon.ico|sw.js|.*\\..*).*)'],
};

export { locales };
