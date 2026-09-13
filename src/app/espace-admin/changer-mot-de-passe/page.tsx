import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { KeyRound, ShieldAlert } from 'lucide-react';
import { ChangePasswordForm } from '@/components/admin/change-password-form';
import { getSessionContext } from '@/lib/auth/session';
import { mintCsrfToken } from '@/lib/auth/csrf';
import { ADMIN_LOGIN_PATH } from '@/lib/auth/guard';

/**
 * Password change.
 *
 * When `must_change_password` is set — which is how the seeded bootstrap account
 * starts — every other admin route redirects here, so the initial development
 * password cannot be used for anything except setting a real one.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Changer le mot de passe',
  robots: { index: false, follow: false },
};

export default async function ChangePasswordPage() {
  const context = await getSessionContext();
  if (!context) redirect(ADMIN_LOGIN_PATH);

  const forced = context.user.must_change_password === 1;
  const csrf = mintCsrfToken(context.session.csrf_secret);

  return (
    <div className="relative flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="absolute inset-0 -z-10 surface-mesh" aria-hidden />

      <div className="w-full max-w-md">
        <div className="rounded-[var(--radius-card)] border border-line bg-surface-raised p-6 shadow-raised sm:p-8">
          <div className="flex items-center gap-3">
            <span
              className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${
                forced ? 'bg-warning-soft text-warning' : 'bg-accent-soft text-accent'
              }`}
            >
              {forced ? <ShieldAlert className="size-5" /> : <KeyRound className="size-5" />}
            </span>
            <div className="min-w-0">
              <h1 className="text-[1.0625rem] font-semibold text-fg">
                {forced ? 'Définissez votre mot de passe' : 'Changer le mot de passe'}
              </h1>
              <p className="truncate text-[0.6875rem] text-fg-subtle">
                {context.user.full_name ?? context.user.username}
              </p>
            </div>
          </div>

          {forced ? (
            <div className="mt-5 rounded-lg border border-warning/30 bg-warning-soft px-4 py-3">
              <p className="text-[0.8125rem] font-semibold text-warning">Action requise</p>
              <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-fg-muted">
                Le mot de passe utilisé pour cette première connexion est un mot de passe de développement à
                usage unique. Choisissez maintenant un mot de passe personnel : il sera le seul à fonctionner
                ensuite, et n’est jamais stocké en clair.
              </p>
            </div>
          ) : (
            <p className="mt-5 text-[0.875rem] leading-relaxed text-fg-muted">
              Après modification, vos autres sessions ouvertes seront automatiquement déconnectées.
            </p>
          )}

          <div className="mt-6">
            <ChangePasswordForm csrf={csrf} forced={forced} username={context.user.username} email={context.user.email} />
          </div>
        </div>
      </div>
    </div>
  );
}
