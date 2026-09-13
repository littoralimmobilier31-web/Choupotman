import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { LoginForm } from '@/components/admin/login-form';
import { getCurrentUser } from '@/lib/auth/session';
import { ADMIN_HOME_PATH, CHANGE_PASSWORD_PATH } from '@/lib/auth/guard';
import { countUsers } from '@/lib/db/repositories/users';
import { config } from '@/lib/config';

/**
 * Admin login.
 *
 * A CSRF token is minted into a short-lived httpOnly cookie and echoed in the
 * form, so a third-party page cannot submit a login attempt on the user's behalf
 * even though there is no session yet.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Connexion',
  robots: { index: false, follow: false },
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ redirige?: string; deconnecte?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect(user.must_change_password ? CHANGE_PASSWORD_PATH : ADMIN_HOME_PATH);

  const query = await searchParams;
  const noUsers = countUsers() === 0;

  return (
    <div className="relative flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="absolute inset-0 -z-10 surface-mesh" aria-hidden />
      <div className="absolute inset-0 -z-10 grid-lines opacity-40" aria-hidden />

      <div className="w-full max-w-sm">
        <Link
          href="/fr"
          className="mb-8 inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-fg-muted transition-colors hover:text-fg"
        >
          <ArrowLeft className="size-3.5 rtl:-scale-x-100" />
          Retour au site
        </Link>

        <div className="rounded-[var(--radius-card)] border border-line bg-surface-raised p-6 shadow-raised sm:p-8">
          <div className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-accent text-[0.8125rem] font-bold text-accent-fg">
              BC
            </span>
            <div className="min-w-0">
              <h1 className="text-[1.0625rem] font-semibold text-fg">CHOUPOTMAN OS</h1>
              <p className="truncate text-[0.6875rem] text-fg-subtle">{config.site.tagline}</p>
            </div>
          </div>

          <p className="mt-6 text-[0.875rem] text-fg-muted">
            Connectez-vous pour accéder à votre espace de gestion.
          </p>

          {query.deconnecte === '1' && (
            <p className="mt-4 rounded-lg bg-success-soft px-3 py-2 text-[0.75rem] font-medium text-success">
              Vous êtes déconnecté.
            </p>
          )}

          {noUsers && (
            <p className="mt-4 rounded-lg bg-warning-soft px-3 py-2.5 text-[0.75rem] leading-relaxed text-warning">
              Aucun compte n’existe encore. Lancez <code className="font-mono">npm run db:seed</code> pour créer
              le compte administrateur initial.
            </p>
          )}

          <div className="mt-6">
            <LoginForm redirectTo={query.redirige} />
          </div>

          <div className="mt-6 flex items-start gap-2 border-t border-line pt-5 text-[0.6875rem] leading-relaxed text-fg-subtle">
            <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
            <p>
              Connexion protégée : limitation des tentatives, verrouillage temporaire du compte après
              plusieurs échecs, session chiffrée et journalisée.
            </p>
          </div>
        </div>

        <p className="mt-6 text-center text-[0.6875rem] text-fg-subtle">
          <Link href="/espace-admin/mot-de-passe-oublie" className="font-medium text-accent hover:underline">
            Mot de passe oublié ?
          </Link>
        </p>
      </div>
    </div>
  );
}
