/**
 * Service worker — CHOUPOTMAN OS.
 *
 * Deliberately conservative. Two rules:
 *
 *   1. Never cache anything that could contain private data or must be fresh:
 *      API responses, the admin, the client portal, brief links, uploads, and
 *      every non-GET request. A stale invoice or a cached session response would
 *      be worse than being offline.
 *   2. Static build assets are immutable (Next fingerprints them), so they are
 *      cache-first. Public pages are network-first with a cached fallback, which
 *      keeps the site readable offline without ever showing stale prices.
 */

const VERSION = 'chp-v1';
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const OFFLINE_URL = '/hors-ligne.html';

const PRIVATE_PREFIXES = ['/api/', '/espace-admin', '/client', '/brief/', '/moodboard/', '/uploads/'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll([OFFLINE_URL, '/icon.svg'])).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

function isPrivate(pathname) {
  return PRIVATE_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only GET is ever cacheable.
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  // Same-origin only; never touch third-party requests.
  if (url.origin !== self.location.origin) return;

  // Private or always-fresh surfaces bypass the cache entirely.
  if (isPrivate(url.pathname)) return;

  // Immutable build output: cache-first.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ??
          fetch(request).then((response) => {
            if (response.ok) {
              const copy = response.clone();
              caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
            }
            return response;
          }),
      ),
    );
    return;
  }

  // Public documents: network-first, fall back to cache, then to the offline page.
  if (request.mode === 'navigate' || request.destination === 'document') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(PAGE_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached ?? caches.match(OFFLINE_URL)).then(
            (cached) => cached ?? new Response('Hors ligne', { status: 503, headers: { 'Content-Type': 'text/plain' } }),
          ),
        ),
    );
    return;
  }

  // Other same-origin assets (images, fonts): cache-first with background refresh.
  event.respondWith(
    caches.match(request).then((cached) => {
      const network = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);
      return cached ?? network;
    }),
  );
});
