import type { Metadata } from 'next';
import Link from 'next/link';
import { FileText, FolderKanban, Home, Receipt } from 'lucide-react';
import { ThemeToggle } from '@/components/theme';
import { ClientLogoutButton } from '@/components/client/portal-forms';
import { getClientSessionContext } from '@/lib/auth/session';
import { portalClient, portalDisplayName } from '@/lib/db/portal';
import { getSiteProfile } from '@/lib/site';

/**
 * Client-portal shell.
 *
 * Like the admin layout, this is presentation only — never a security boundary.
 * Each page calls `requireClientUser()` itself and every query goes through
 * `lib/db/portal.ts`, which scopes on the caller's own client id. A layout in
 * the App Router can be skipped, so nothing may depend on it for access control.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'Espace client', template: '%s · Espace client' },
  robots: { index: false, follow: false, nocache: true },
};

const NAV = [
  { href: '/client', label: 'Accueil', icon: Home },
  { href: '/client/projets', label: 'Projets', icon: FolderKanban },
  { href: '/client/factures', label: 'Factures', icon: Receipt },
  { href: '/client/documents', label: 'Documents', icon: FileText },
];

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getClientSessionContext();
  const profile = getSiteProfile();

  // No session: the page itself is the login screen, rendered bare.
  if (!ctx) {
    return <div className="min-h-dvh bg-surface">{children}</div>;
  }

  const client = portalClient(ctx.clientUser.client_id);
  const name = portalDisplayName(ctx.clientUser, client);

  return (
    <div className="min-h-dvh bg-surface">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/client" className="min-w-0">
            <span className="block truncate text-[0.9375rem] font-semibold tracking-tight text-fg">
              Espace client
            </span>
            <span className="block truncate text-[0.6875rem] text-fg-subtle">{name}</span>
          </Link>

          <div className="flex items-center gap-1">
            <ThemeToggle />
            <ClientLogoutButton />
          </div>
        </div>

        <nav className="mx-auto max-w-5xl px-4 sm:px-6" aria-label="Navigation de l’espace client">
          <ul className="hide-scrollbar -mb-px flex gap-1 overflow-x-auto">
            {NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="inline-flex shrink-0 items-center gap-1.5 border-b-2 border-transparent px-3 py-2.5 text-[0.8125rem] font-medium text-fg-muted transition-colors hover:border-line-strong hover:text-fg"
                >
                  <item.icon className="size-3.5" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      <footer className="mx-auto max-w-5xl px-4 py-8 text-center text-[0.75rem] text-fg-subtle sm:px-6">
        <p>
          Espace client de {profile.ownerName}
          {profile.email && (
            <>
              {' · '}
              <a href={`mailto:${profile.email}`} className="hover:text-fg">
                {profile.email}
              </a>
            </>
          )}
        </p>
      </footer>
    </div>
  );
}
