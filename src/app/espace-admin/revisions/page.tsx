import Link from 'next/link';
import { RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { TableWrap, Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table';
import { PageHeader, SummaryStrip, ListEmpty, DemoBadge } from '@/components/admin/page-kit';
import { ListFilters } from '@/components/admin/list-filters';
import { RevisionStatusCell, RevisionBillButton } from '@/components/admin/revision-controls';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import { countRevisions, listRevisionsAcross, projectOptions } from '@/lib/db/repositories/projects';
import { formatMoney, formatShortDate } from '@/lib/i18n/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Révisions' };

export default async function RevisionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string; projet?: string; type?: string }>;
}) {
  const user = await requirePermission('revisions.view');
  const query = await searchParams;
  const csrf = (await getCsrfToken()) ?? '';

  const filter = {
    status: query.statut || undefined,
    projectId: Number.parseInt(query.projet ?? '', 10) || undefined,
    extraOnly: query.type === 'supplement',
    unbilledOnly: query.type === 'afacturer',
    limit: 300,
  };

  const revisions = listRevisionsAcross(filter).filter((revision) => {
    // Only the free-text term is applied in memory: the list is capped at 300
    // rows and the searchable columns live in two different tables.
    const term = query.q?.trim().toLowerCase();
    if (!term) return true;
    return [revision.title, revision.description, revision.project_title, revision.client_name, revision.client_company]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
  });

  const projects = projectOptions();
  const canUpdate = can(user, 'revisions.update');
  const canInvoice = can(user, 'invoices.create');

  return (
    <>
      <PageHeader
        title="Révisions"
        description="Chaque projet a un forfait de révisions incluses. Au-delà, un supplément est calculé et peut être facturé."
      />

      <SummaryStrip
        items={[
          { label: 'Ouvertes', value: countRevisions({ status: 'open' }), href: '/espace-admin/revisions?statut=open' },
          { label: 'En cours', value: countRevisions({ status: 'in_progress' }), href: '/espace-admin/revisions?statut=in_progress' },
          { label: 'Terminées', value: countRevisions({ status: 'done' }), href: '/espace-admin/revisions?statut=done' },
          { label: 'Supplémentaires', value: countRevisions({ extraOnly: true }), href: '/espace-admin/revisions?type=supplement' },
          { label: 'À facturer', value: countRevisions({ unbilledOnly: true }), href: '/espace-admin/revisions?type=afacturer' },
        ]}
      />

      <ListFilters
        searchPlaceholder="Titre, description, projet, client…"
        resultCount={revisions.length}
        selects={[
          {
            key: 'statut',
            label: 'Statut',
            allLabel: 'Tous les statuts',
            options: [
              { value: 'open', label: 'Ouverte' },
              { value: 'in_progress', label: 'En cours' },
              { value: 'done', label: 'Terminée' },
              { value: 'rejected', label: 'Refusée' },
            ],
          },
          {
            key: 'type',
            label: 'Type',
            allLabel: 'Toutes',
            options: [
              { value: 'supplement', label: 'Supplémentaires' },
              { value: 'afacturer', label: 'À facturer' },
            ],
          },
          ...(projects.length > 0
            ? [
                {
                  key: 'projet',
                  label: 'Projet',
                  allLabel: 'Tous les projets',
                  options: projects.map((project) => ({ value: String(project.id), label: project.label })),
                },
              ]
            : []),
        ]}
      />

      <div className="mt-5">
        {revisions.length === 0 ? (
          <ListEmpty
            icon={<RefreshCw className="size-5" />}
            title="Aucune révision"
            description="Les révisions se créent depuis un projet ou depuis un retour client. Le compteur « utilisées / incluses » est visible sur chaque projet."
          />
        ) : (
          <TableWrap>
            <Table>
              <Thead>
                <tr>
                  <Th>Révision</Th>
                  <Th>Projet</Th>
                  <Th>Client</Th>
                  <Th alignment="center">Statut</Th>
                  <Th alignment="center">Type</Th>
                  <Th alignment="end">Supplément</Th>
                  <Th>Demandée le</Th>
                </tr>
              </Thead>
              <Tbody>
                {revisions.map((revision) => (
                  <Tr key={revision.id}>
                    <Td>
                      <span className="flex items-center gap-2">
                        <span className="font-medium text-fg">
                          #{revision.index_number} · {revision.title ?? 'Révision'}
                        </span>
                        <DemoBadge when={revision.is_demo} />
                      </span>
                      {revision.description && (
                        <span className="line-clamp-2 text-[0.6875rem] text-fg-subtle">{revision.description}</span>
                      )}
                    </Td>
                    <Td>
                      <Link
                        href={`/espace-admin/projets/${revision.project_id}`}
                        className="text-[0.8125rem] text-fg-muted transition-colors hover:text-accent"
                      >
                        {revision.project_title ?? '—'}
                      </Link>
                    </Td>
                    <Td className="text-[0.8125rem] text-fg-muted">
                      {revision.client_id ? (
                        <Link
                          href={`/espace-admin/clients/${revision.client_id}`}
                          className="transition-colors hover:text-accent"
                        >
                          {revision.client_company ?? revision.client_name}
                        </Link>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </Td>
                    <Td alignment="center">
                      <RevisionStatusCell
                        csrf={csrf}
                        revisionId={revision.id}
                        status={revision.status}
                        canUpdate={canUpdate}
                      />
                    </Td>
                    <Td alignment="center">
                      {revision.is_extra === 1 ? (
                        <Badge tone="warning">Hors forfait</Badge>
                      ) : (
                        <Badge tone="outline">Incluse</Badge>
                      )}
                    </Td>
                    <Td alignment="end" className="tabular-nums">
                      {revision.is_extra === 1 && revision.extra_cost > 0 ? (
                        <span>
                          {formatMoney(revision.extra_cost, revision.currency)}
                          {revision.invoice_number ? (
                            <span className="block text-[0.625rem] text-success">
                              facturé · {revision.invoice_number}
                            </span>
                          ) : (
                            <RevisionBillButton
                              csrf={csrf}
                              revisionId={revision.id}
                              enabled={canInvoice}
                            />
                          )}
                        </span>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-[0.75rem] text-fg-muted">
                      {formatShortDate(revision.created_at, 'fr')}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableWrap>
        )}
      </div>
    </>
  );
}
