'use client';

import { useEffect } from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Global error boundary.
 *
 * Shows a neutral message and the digest only. A stack trace or an exception
 * message can leak file paths, SQL and configuration, so it is never rendered —
 * the server log is the place to read it.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Logged server-side by Next; this keeps the digest visible in the browser
    // console for correlation during development.
    console.error('Unhandled error', error.digest ?? '');
  }, [error]);

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-20 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-danger-soft text-danger">
        <AlertTriangle className="size-6" />
      </span>
      <h1 className="mt-5 text-2xl font-semibold tracking-tight text-fg">Erreur inattendue</h1>
      <p className="mt-3 max-w-md text-[0.9375rem] leading-relaxed text-fg-muted">
        Quelque chose s’est mal passé de notre côté. Réessayez dans un instant — si le problème persiste,
        signalez-le en mentionnant la référence ci-dessous.
      </p>

      {error.digest && (
        <code className="mt-4 rounded-md bg-surface-sunken px-2.5 py-1 font-mono text-[0.75rem] text-fg-subtle">
          {error.digest}
        </code>
      )}

      <div className="mt-8 flex flex-wrap justify-center gap-3">
        <Button onClick={reset}>
          <RotateCcw className="size-4" />
          Réessayer
        </Button>
        {/* A full page load on purpose, not <Link>: this boundary catches
            client-side failures, and the router may be exactly what broke.
            Navigating through it would then do nothing at all. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="inline-flex items-center rounded-lg border border-line px-4 py-2 text-sm font-medium text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg">
          Retour à l’accueil
        </a>
      </div>
    </div>
  );
}
