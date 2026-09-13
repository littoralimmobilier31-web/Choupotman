import type { Metadata } from 'next';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft } from 'lucide-react';
import { ResetPasswordForm } from '@/components/admin/reset-forms';
import { hashToken } from '@/lib/auth/password';
import { one } from '@/lib/db/client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Réinitialiser le mot de passe',
  robots: { index: false, follow: false },
};

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  /**
   * The token is validated here too, so an expired link shows a clear message
   * instead of a form that will fail on submit. The authoritative check still
   * happens in the API route when the new password is actually set.
   */
  const valid =
    token && token.length >= 10
      ? Boolean(
          one<{ id: number }>(
            `SELECT id FROM password_resets
             WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`,
            [hashToken(token), new Date().toISOString()],
          ),
        )
      : false;

  return (
    <div className="relative flex min-h-dvh items-center justify-center px-4 py-12">
      <div className="absolute inset-0 -z-10 surface-mesh" aria-hidden />

      <div className="w-full max-w-sm">
        <Link
          href="/espace-admin/connexion"
          className="mb-8 inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-fg-muted transition-colors hover:text-fg"
        >
          <ArrowLeft className="size-3.5 rtl:-scale-x-100" />
          Retour à la connexion
        </Link>

        <div className="rounded-[var(--radius-card)] border border-line bg-surface-raised p-6 shadow-raised sm:p-8">
          <h1 className="text-[1.0625rem] font-semibold text-fg">Nouveau mot de passe</h1>

          {valid && token ? (
            <>
              <p className="mt-2 text-[0.875rem] leading-relaxed text-fg-muted">
                Choisissez votre nouveau mot de passe. Toutes vos sessions ouvertes seront déconnectées.
              </p>
              <div className="mt-6">
                <ResetPasswordForm token={token} />
              </div>
            </>
          ) : (
            <div className="mt-5 flex items-start gap-3 rounded-lg border border-danger/30 bg-danger-soft px-4 py-3">
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" />
              <div>
                <p className="text-[0.8125rem] font-semibold text-danger">Lien invalide ou expiré</p>
                <p className="mt-1.5 text-[0.8125rem] leading-relaxed text-fg-muted">
                  Ce lien de réinitialisation n’est plus valable. Les liens expirent au bout d’une heure et ne
                  peuvent être utilisés qu’une seule fois.
                </p>
                <Link
                  href="/espace-admin/mot-de-passe-oublie"
                  className="mt-3 inline-block text-[0.8125rem] font-semibold text-accent hover:underline"
                >
                  Demander un nouveau lien
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
