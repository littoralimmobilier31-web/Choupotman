import { redirect } from 'next/navigation';
import Link from 'next/link';
import { ShieldCheck } from 'lucide-react';
import { ClientLoginForm } from '@/components/client/portal-forms';
import { ThemeToggle } from '@/components/theme';
import { getClientSessionContext } from '@/lib/auth/session';
import { getSiteProfile } from '@/lib/site';

export const dynamic = 'force-dynamic';
export const metadata = {
  title: 'Connexion',
  robots: { index: false, follow: false, nocache: true },
};

export default async function ClientLoginPage() {
  // Already signed in: no reason to show the form again.
  if (await getClientSessionContext()) redirect('/client');
  const profile = getSiteProfile();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-4 py-4 sm:px-6">
        <Link href="/" className="text-[0.9375rem] font-semibold tracking-tight text-fg">
          {profile.ownerName}
        </Link>
        <ThemeToggle />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          <div className="mb-6 text-center">
            <span className="mx-auto mb-4 flex size-11 items-center justify-center rounded-full bg-accent-soft text-accent">
              <ShieldCheck className="size-5" />
            </span>
            <h1 className="text-[1.375rem] font-semibold tracking-tight text-fg">Espace client</h1>
            <p className="mt-2 text-[0.8125rem] leading-relaxed text-fg-muted">
              Suivez l’avancement de vos projets, consultez vos documents et vos factures.
            </p>
          </div>

          <div className="rounded-[var(--radius-card)] border border-line bg-surface-raised p-5 sm:p-6">
            <ClientLoginForm />
          </div>

          <p className="mt-5 text-center text-[0.75rem] text-fg-subtle">
            <Link href="/contact" className="hover:text-fg">
              Un problème de connexion ? Contactez-nous
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
