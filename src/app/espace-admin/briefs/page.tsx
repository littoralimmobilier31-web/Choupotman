import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/misc';
import { TableWrap, Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table';
import { PageHeader, SummaryStrip, ListEmpty, DemoBadge } from '@/components/admin/page-kit';
import { ListFilters } from '@/components/admin/list-filters';
import { NewBriefButton, CopyLinkButton } from '@/components/admin/brief-controls';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import { BRIEF_STATUSES, briefStatusLabel, isBriefExpired, listBriefs } from '@/lib/db/repositories/briefs';
import { clientOptions } from '@/lib/db/repositories/clients';
import { projectOptions } from '@/lib/db/repositories/projects';
import { config } from '@/lib/config';
import { formatRelative, formatShortDate } from '@/lib/i18n/format';
import type { BriefStatus } from '@/lib/db/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Briefs' };

const STATUS_TONES: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'outline'> = {
  draft: 'neutral', sent: 'info', in_progress: 'warning', completed: 'success', expired: 'outline',
};

export default async function BriefsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string; client?: string }>;
}) {
  const user = await requirePermission('briefs.view');
  const query = await searchParams;
  const csrf = (await getCsrfToken()) ?? '';

  const all = listBriefs({ status: 'all', limit: 300 });
  const briefs = listBriefs({
    status: (query.statut as BriefStatus | 'all') || undefined,
    clientId: Number.parseInt(query.client ?? '', 10) || undefined,
    limit: 300,
  }).filter((brief) => {
    const term = query.q?.trim().toLowerCase();
    if (!term) return true;
    return [brief.title, brief.client_name, brief.project_title]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
  });

  const clients = clientOptions();
  const projects = projectOptions();
  const countBy = (status: BriefStatus) => all.filter((brief) => brief.status === status).length;

  return (
    <>
      <PageHeader
        title="Briefs"
        description="Un questionnaire envoyé par lien unique, sans compte à créer. Chaque réponse est enregistrée immédiatement et alimente la timeline du projet."
        actions={
          can(user, 'briefs.create') && (
            <NewBriefButton
              csrf={csrf}
              clients={clients.map((client) => ({ id: client.id, label: client.label }))}
              projects={projects.map((project) => ({
                id: project.id,
                label: project.label,
                client_id: project.client_id,
              }))}
            />
          )
        }
      />

      <SummaryStrip
        items={[
          { label: 'Envoyés', value: countBy('sent'), href: '/espace-admin/briefs?statut=sent' },
          { label: 'En cours', value: countBy('in_progress'), href: '/espace-admin/briefs?statut=in_progress' },
          { label: 'Terminés', value: countBy('completed'), href: '/espace-admin/briefs?statut=completed' },
          { label: 'Total', value: all.length, href: '/espace-admin/briefs?statut=all' },
        ]}
      />

      <ListFilters
        searchPlaceholder="Titre, client, projet…"
        resultCount={briefs.length}
        selects={[
          {
            key: 'statut',
            label: 'Statut',
            allLabel: 'Tous les statuts',
            options: BRIEF_STATUSES.map((status) => ({ value: status.key, label: status.label })),
          },
          ...(clients.length > 0
            ? [
                {
                  key: 'client',
                  label: 'Client',
                  allLabel: 'Tous les clients',
                  options: clients.map((client) => ({ value: String(client.id), label: client.label })),
                },
              ]
            : []),
        ]}
      />

      <div className="mt-5">
        {briefs.length === 0 ? (
          <ListEmpty
            icon={<ClipboardList className="size-5" />}
            title="Aucun brief"
            description="Créez un brief : un lien unique est généré, le client répond à son rythme et vous voyez l’avancement en direct."
          />
        ) : (
          <TableWrap>
            <Table>
              <Thead>
                <tr>
                  <Th>Brief</Th>
                  <Th>Client / projet</Th>
                  <Th alignment="center">Statut</Th>
                  <Th>Avancement</Th>
                  <Th>Dernière activité</Th>
                  <Th alignment="end">Lien</Th>
                </tr>
              </Thead>
              <Tbody>
                {briefs.map((brief) => {
                  const expired = isBriefExpired(brief);
                  const percent =
                    brief.question_count > 0
                      ? Math.round((brief.answered_count / brief.question_count) * 100)
                      : 0;
                  return (
                    <Tr key={brief.id}>
                      <Td>
                        <Link
                          href={`/espace-admin/briefs/${brief.id}`}
                          className="flex items-center gap-2 font-medium text-fg hover:text-accent"
                        >
                          {brief.title}
                          <DemoBadge when={brief.is_demo} />
                        </Link>
                        <span className="block text-[0.6875rem] text-fg-subtle">
                          {brief.locale.toUpperCase()}
                          {brief.expires_at &&
                            ` · ${expired ? 'expiré le' : 'valable jusqu’au'} ${formatShortDate(brief.expires_at, 'fr')}`}
                        </span>
                      </Td>
                      <Td className="text-[0.8125rem] text-fg-muted">
                        {brief.client_name ?? '—'}
                        {brief.project_title && (
                          <Link
                            href={`/espace-admin/projets/${brief.project_id}`}
                            className="block text-[0.6875rem] transition-colors hover:text-accent"
                          >
                            {brief.project_title}
                          </Link>
                        )}
                      </Td>
                      <Td alignment="center">
                        <Badge tone={expired ? 'outline' : (STATUS_TONES[brief.status] ?? 'neutral')}>
                          {expired ? 'Expiré' : briefStatusLabel(brief.status)}
                        </Badge>
                      </Td>
                      <Td className="min-w-32">
                        <div className="flex items-center gap-2">
                          <Progress
                            className="flex-1"
                            value={brief.answered_count}
                            total={Math.max(1, brief.question_count)}
                            tone={percent === 100 ? 'success' : 'accent'}
                          />
                          <span className="shrink-0 text-[0.6875rem] tabular-nums text-fg-muted">
                            {brief.answered_count}/{brief.question_count}
                          </span>
                        </div>
                      </Td>
                      <Td className="whitespace-nowrap text-[0.75rem] text-fg-muted">
                        {brief.last_activity_at ? formatRelative(brief.last_activity_at, 'fr') : '—'}
                      </Td>
                      <Td alignment="end">
                        <CopyLinkButton url={`${config.site.url}/brief/${brief.token}`} label="Copier" />
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </TableWrap>
        )}
      </div>
    </>
  );
}
