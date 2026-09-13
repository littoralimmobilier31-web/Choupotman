'use client';

import { useEffect } from 'react';

/**
 * Registers the service worker.
 *
 * Registration is deferred to after `load` so it never competes with the initial
 * render, and skipped entirely in development where a stale worker would mask
 * code changes. Every failure is swallowed: a browser that refuses service
 * workers (private mode, blocked site data) must still get a working site.
 */
export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        // Nothing to do — the app works without offline support.
      });
    };

    if (document.readyState === 'complete') register();
    else window.addEventListener('load', register, { once: true });

    return () => window.removeEventListener('load', register);
  }, []);

  return null;
}
