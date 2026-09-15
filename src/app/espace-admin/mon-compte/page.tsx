import Link from 'next/link';
import { redirect } from 'next/navigation';
import { KeyRound } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { PageHeader, Section, DetailGrid } from '@/components/admin/page-kit';
import { AccountForm } from '@/components/admin/account-form';
import { SessionList } from '@/components/admin/session-list';
import { requirePermission } from '@/lib/auth/guard';
import { getCsrfToken } from '@/lib/auth/csrf';
import { getSessionContext, listUserSessions } from '@/lib/auth/session';
import { findUserById, findRoleById, rolePermissions } from '@/lib/db/repositories/users';
import { countActivity, listActivity } from '@/lib/db/repositories/activity';
import { RESOURCE_LABELS, type Resource } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Mon compte' };

export default async function AccountPage() {
  const user = await requirePermission('dashboard.view');
  const csrf = (await getCsrfToken()) ?? '';
  const context = await getSessionContext();

  const account = findUserById(user.id);
  if (!account) redirect('/espace-admin');

  const role = findRoleById(account.role_id);
  const permissions = role ? rolePermissions(role.id) : [];

  // Which resources this account can touch at all — more useful to a person than
  // a list of ninety permission strings.
  const resources = Array.from(new Set(permissions.map((permission) => permission.split('.')[0])))
    .map((key) => RESOURCE_LABELS[key as Resource])
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b, 'fr'));

  const sessions = listUserSessions(user.id);
  const recent = listActivity({ userId: user.id, limit: 8 });

  return (
    <>
      <PageHeader
        title="Mon compte"
        description="Vos informations, vos sessions ouvertes et ce que votre rôle vous autorise à faire."
        actions={
          <Link href="/espace-admin/changer-mot-de-passe" className={buttonClass('secondary', 'sm')}>
            <KeyRound className="size-3.5" />
            Changer mon mot de passe
          </Link>
        }
      />

      <DetailGrid
        items={[
          { label: 'Identifiant', value: account.username },
          { label: 'Rôle', value: role?.name ?? '—' },
          {
            label: 'Dernière connexion',
            value: account.last_login_at
              ? account.last_login_at.slice(0, 16).replace('T', ' à ')
              : 'première session',
          },
          { label: 'Compte créé le', value: account.created_at.slice(0, 10) },
        ]}
      />

      <div className="mt-6 space-y-8">
        <Section title="Mes informations" description="Modifiables par vous. Le rôle et l’activation relèvent d’un administrateur.">
          <AccountForm
            csrf={csrf}
            account={{
              username: account.username,
              email: account.email,
              full_name: account.full_name,
              phone: account.phone,
              locale: account.locale,
              theme: account.theme,
            }}
          />
        </Section>

        <Section
          title="Sessions ouvertes"
          description="Chaque appareil connecté à ce compte. Fermer les autres sessions vous garde connecté ici."
        >
          <SessionList
            csrf={csrf}
            sessions={sessions.map((session) => ({
              id: session.id,
              created_at: session.created_at,
              last_seen_at: session.last_seen_at,
              expires_at: session.expires_at,
              ip_address: session.ip_address,
              user_agent: session.user_agent,
              current: context?.session.id === session.id,
            }))}
          />
        </Section>

        <Section
          title="Ce que je peux faire"
          description={
            role?.description ??
            'Les permissions viennent du rôle : elles ne se modifient pas depuis cette page.'
          }
        >
          <div className="rounded-[var(--radius-card)] border border-line bg-surface-raised p-4">
            <p className="mb-2.5 text-[0.75rem] text-fg-muted">
              {permissions.length} permission{permissions.length === 1 ? '' : 's'} sur{' '}
              {resources.length} module{resources.length === 1 ? '' : 's'}.
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {resources.map((label) => (
                <li key={label}>
                  <Badge tone="outline">{label}</Badge>
                </li>
              ))}
            </ul>
            {resources.length === 0 && (
              <p className="text-[0.8125rem] text-fg-muted">
                Aucune permission attribuée. Contactez un administrateur.
              </p>
            )}
          </div>
        </Section>

        <Section
          title="Mes dernières actions"
          description={`${countActivity({ userId: user.id })} entrées à votre nom dans le journal d’activité.`}
        >
          {recent.length === 0 ? (
            <p className="rounded-lg border border-line bg-surface-raised px-4 py-6 text-center text-[0.8125rem] text-fg-muted">
              Aucune action enregistrée pour l’instant.
            </p>
          ) : (
            <ul className="space-y-1">
              {recent.map((entry) => (
                <li
                  key={entry.id}
                  className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg border border-line bg-surface-raised px-3 py-2"
                >
                  <span className="min-w-0 text-[0.8125rem] text-fg">{entry.summary ?? entry.action}</span>
                  <span className="shrink-0 text-[0.6875rem] tabular-nums text-fg-subtle">
                    {entry.created_at.slice(0, 16).replace('T', ' à ')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>
    </>
  );
}
