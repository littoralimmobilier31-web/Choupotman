import type { Metadata } from 'next';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ForgotPasswordForm } from '@/components/admin/reset-forms';
import { config } from '@/lib/config';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Mot de passe oublié',
  robots: { index: false, follow: false },
};

export default function ForgotPasswordPage() {
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
          <h1 className="text-[1.0625rem] font-semibold text-fg">Mot de passe oublié</h1>
          <p className="mt-2 text-[0.875rem] leading-relaxed text-fg-muted">
            Indiquez l’adresse email de votre compte. Un lien de réinitialisation valable une heure vous sera
            envoyé.
          </p>

          <div className="mt-6">
            <ForgotPasswordForm />
          </div>

          {!config.mail.enabled && (
            <p className="mt-5 rounded-lg bg-warning-soft px-3 py-2.5 text-[0.6875rem] leading-relaxed text-warning">
              SMTP n’est pas configuré sur cette installation : le message est préparé et conservé dans la
              messagerie de l’administration au lieu d’être envoyé. Renseignez <code className="font-mono">SMTP_HOST</code> pour
              activer l’envoi réel.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
