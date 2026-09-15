import { PageHeader, SummaryStrip } from '@/components/admin/page-kit';
import { ActivityJournal } from '@/components/admin/activity-journal';
import { ListFilters, Pagination } from '@/components/admin/list-filters';
import { requirePermission } from '@/lib/auth/guard';
import {
  countActivity,
  listActivity,
  listActivityActions,
} from '@/lib/db/repositories/activity';
import { listUsers } from '@/lib/db/repositories/users';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Journal d’activité' };

const PAGE_SIZE = 60;

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; action?: string; utilisateur?: string; type?: string; page?: string }>;
}) {
  await requirePermission('activity.view');
  const query = await searchParams;

  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1);

  const filter = {
    search: query.q?.trim() || undefined,
    action: query.action || undefined,
    userId: Number.parseInt(query.utilisateur ?? '', 10) || undefined,
    entityType: query.type || undefined,
  };

  const entries = listActivity({ ...filter, limit: PAGE_SIZE, offset: (page - 1) * PAGE_SIZE });
  const total = countActivity(filter);
  const users = listUsers();

  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <PageHeader
        title="Journal d’activité"
        description="Qui a fait quoi, quand, et depuis quelle adresse. Le journal n’est pas modifiable depuis l’interface — c’est ce qui lui donne sa valeur."
      />

      <SummaryStrip
        items={[
          { label: 'Entrées', value: total },
          { label: 'Aujourd’hui', value: countActivity({ from: today }) },
          { label: 'Connexions', value: countActivity({ action: 'login' }) },
          { label: 'Échecs de connexion', value: countActivity({ action: 'login_failed' }) },
        ]}
      />

      <ListFilters
        searchPlaceholder="Résumé, élément concerné, auteur…"
        resultCount={entries.length}
        selects={[
          {
            key: 'action',
            label: 'Action',
            allLabel: 'Toutes les actions',
            options: listActivityActions().map((action) => ({ value: action, label: action })),
          },
          ...(users.length > 1
            ? [
                {
                  key: 'utilisateur',
                  label: 'Auteur',
                  allLabel: 'Tous les auteurs',
                  options: users.map((user) => ({ value: String(user.id), label: user.username })),
                },
              ]
            : []),
        ]}
      />

      <div className="mt-5 space-y-4">
        <ActivityJournal
          entries={entries.map((entry) => ({
            id: entry.id,
            actor_label: entry.actor_label,
            action: entry.action,
            entity_type: entry.entity_type,
            entity_id: entry.entity_id,
            entity_label: entry.entity_label,
            summary: entry.summary,
            metadata: entry.metadata,
            ip_address: entry.ip_address,
            created_at: entry.created_at,
          }))}
        />

        <Pagination page={page} pageSize={PAGE_SIZE} total={total} />
      </div>
    </>
  );
}
