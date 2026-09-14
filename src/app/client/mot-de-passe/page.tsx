import { redirect } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { ClientPasswordForm } from '@/components/client/password-form';
import { requireClientUser } from '@/lib/auth/guard';
import { getClientCsrfToken } from '@/lib/auth/csrf';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mot de passe' };

export default async function ClientPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ obligatoire?: string }>;
}) {
  // Allowed through with a temporary password: this is the page that fixes it.
  const clientUser = await requireClientUser({ allowPasswordChange: true });
  const csrf = (await getClientCsrfToken()) ?? '';
  const query = await searchParams;

  // Nothing to force and nobody asked: send them back to the portal.
  const forced = clientUser.must_change_password === 1;
  if (!forced && query.obligatoire === '1') redirect('/client');

  return (
    <div className="mx-auto max-w-md">
      <header className="mb-6 text-center">
        <span className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent">
          <KeyRound className="size-5" />
        </span>
        <h1 className="text-[1.25rem] font-semibold tracking-tight text-fg">
          {forced ? 'Choisissez votre mot de passe' : 'Changer de mot de passe'}
        </h1>
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-fg-muted">
          {forced
            ? 'Votre mot de passe actuel est provisoire. Choisissez-en un nouveau, connu de vous seul.'
            : 'Choisissez un mot de passe d’au moins 10 caractères, avec majuscule, minuscule, chiffre et caractère spécial.'}
        </p>
      </header>

      <div className="rounded-[var(--radius-card)] border border-line bg-surface-raised p-5 sm:p-6">
        <ClientPasswordForm csrf={csrf} forced={forced} />
      </div>
    </div>
  );
}
