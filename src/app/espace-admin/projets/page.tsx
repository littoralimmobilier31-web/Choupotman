import Link from 'next/link';
import { AlertTriangle, FolderKanban, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { Progress } from '@/components/ui/misc';
import { TableWrap, Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table';
import { PageHeader, SummaryStrip, ListEmpty, DemoBadge } from '@/components/admin/page-kit';
import { ListFilters } from '@/components/admin/list-filters';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import {
  ACTIVE_STATUSES, PROJECT_STATUSES, countProjects, listProjects,
  priorityLabel, projectStatusLabel, PRIORITIES,
} from '@/lib/db/repositories/projects';
import { listCategories } from '@/lib/db/repositories/content';
import { clientOptions } from '@/lib/db/repositories/clients';
import { formatMoney, formatShortDate } from '@/lib/i18n/format';
import type { Priority, ProjectStatus } from '@/lib/db/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Projets' };

const STATUS_TONES: Record<string, 'neutral' | 'info' | 'brand' | 'warning' | 'success' | 'outline'> = {
  prospect: 'neutral', planning: 'info', in_progress: 'brand', in_review: 'warning',
  awaiting_client: 'warning', completed: 'success', archived: 'outline',
};

const PRIORITY_TONES: Record<string, 'neutral' | 'info' | 'warning' | 'danger'> = {
  low: 'neutral', medium: 'info', high: 'warning', urgent: 'danger',
};

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; statut?: string; client?: string; categorie?: string;
    priorite?: string; retard?: string; tri?: string;
  }>;
}) {
  const user = await requirePermission('projects.view');
  const query = await searchParams;

  const today = new Date().toISOString().slice(0, 10);

  const projects = listProjects({
    search: query.q?.trim() || undefined,
    status: (query.statut as ProjectStatus | 'all' | 'active') || undefined,
    clientId: Number.parseInt(query.client ?? '', 10) || undefined,
    categoryId: Number.parseInt(query.categorie ?? '', 10) || undefined,
    priority: (query.priorite as Priority) || undefined,
    overdueOnly: query.retard === '1',
    sort: (query.tri as 'recent' | 'delivery' | 'budget' | 'title') || 'recent',
    limit: 200,
  });

  const categories = listCategories('project');
  const clients = clientOptions();
  const overdueCount = listProjects({ overdueOnly: true, status: 'all', limit: 200 }).length;

  return (
    <>
      <PageHeader
        title="Projets"
        description="Étapes, tâches, révisions, facturation et timeline pour chaque mission."
        actions={
          can(user, 'projects.create') && (
            <Link href="/espace-admin/projets/nouveau" className={buttonClass('primary', 'sm')}>
              <Plus className="size-4" />
              Nouveau projet
            </Link>
          )
        }
      />

      <SummaryStrip
        items={[
          { label: 'Actifs', value: countProjects({ status: 'active' }), href: '/espace-admin/projets?statut=active' },
          { label: 'Terminés', value: countProjects({ status: 'completed' }), href: '/espace-admin/projets?statut=completed' },
          { label: 'Prospects', value: countProjects({ status: 'prospect' }), href: '/espace-admin/projets?statut=prospect' },
          { label: 'En retard', value: overdueCount, href: '/espace-admin/projets?retard=1' },
          { label: 'Total', value: countProjects({ status: 'all' }), href: '/espace-admin/projets?statut=all' },
        ]}
      />

      <ListFilters
        searchPlaceholder="Titre, référence, description, client…"
        resultCount={projects.length}
        selects={[
          {
            key: 'statut',
            label: 'Statut',
            allLabel: 'Tous les statuts',
            options: [
              { value: 'active', label: `En cours (${ACTIVE_STATUSES.length} états)` },
              ...PROJECT_STATUSES.map((status) => ({ value: status.key, label: status.label })),
              { value: 'all', label: 'Tous (archives incluses)' },
            ],
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
          ...(categories.length > 0
            ? [
                {
                  key: 'categorie',
                  label: 'Catégorie',
                  allLabel: 'Toutes les catégories',
                  options: categories.map((category) => ({ value: String(category.id), label: category.name })),
                },
              ]
            : []),
          {
            key: 'priorite',
            label: 'Priorité',
            allLabel: 'Toutes les priorités',
            options: PRIORITIES.map((priority) => ({ value: priority.key, label: priority.label })),
          },
          {
            key: 'tri',
            label: 'Trier',
            allLabel: 'Tri : récents',
            options: [
              { value: 'delivery', label: 'Tri : livraison' },
              { value: 'budget', label: 'Tri : budget' },
              { value: 'title', label: 'Tri : titre' },
            ],
          },
        ]}
      />

      <div className="mt-5">
        {projects.length === 0 ? (
          <ListEmpty
            icon={<FolderKanban className="size-5" />}
            title="Aucun projet"
            description="Créez un projet : les étapes, les tâches de départ et l’arborescence de dossiers sont générées automatiquement."
            actionHref={can(user, 'projects.create') ? '/espace-admin/projets/nouveau' : undefined}
            actionLabel="Nouveau projet"
          />
        ) : (
          <TableWrap>
            <Table>
              <Thead>
                <tr>
                  <Th>Projet</Th>
                  <Th>Client</Th>
                  <Th alignment="center">Statut</Th>
                  <Th>Avancement</Th>
                  <Th>Livraison</Th>
                  <Th alignment="end">Budget</Th>
                  <Th alignment="end">Facturé</Th>
                </tr>
              </Thead>
              <Tbody>
                {projects.map((project) => {
                  const late =
                    project.delivery_date !== null &&
                    project.delivery_date < today &&
                    project.status !== 'completed' &&
                    project.status !== 'archived';
                  return (
                    <Tr key={project.id}>
                      <Td>
                        <Link href={`/espace-admin/projets/${project.id}`} className="group block min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-medium text-fg group-hover:text-accent">
                              {project.title}
                            </span>
                            <DemoBadge when={project.is_demo} />
                            {project.open_revision_count > 0 && (
                              <Badge tone="warning">{project.open_revision_count} rév.</Badge>
                            )}
                          </span>
                          <span className="flex items-center gap-2 text-[0.6875rem] text-fg-subtle">
                            <span className="font-mono">{project.reference}</span>
                            <Badge tone={PRIORITY_TONES[project.priority] ?? 'neutral'}>
                              {priorityLabel(project.priority)}
                            </Badge>
                          </span>
                        </Link>
                      </Td>
                      <Td>
                        {project.client_id ? (
                          <Link
                            href={`/espace-admin/clients/${project.client_id}`}
                            className="text-[0.8125rem] text-fg-muted transition-colors hover:text-accent"
                          >
                            {project.client_company ?? project.client_name}
                          </Link>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </Td>
                      <Td alignment="center">
                        <Badge tone={STATUS_TONES[project.status] ?? 'neutral'}>
                          {projectStatusLabel(project.status)}
                        </Badge>
                      </Td>
                      <Td className="min-w-32">
                        <div className="flex items-center gap-2">
                          <Progress
                            className="flex-1"
                            value={project.progress}
                            tone={late ? 'danger' : project.progress >= 80 ? 'success' : 'accent'}
                          />
                          <span className="shrink-0 text-[0.6875rem] tabular-nums text-fg-muted">
                            {project.progress}%
                          </span>
                        </div>
                        <p className="mt-1 text-[0.625rem] text-fg-subtle">
                          {project.done_task_count}/{project.task_count} tâches
                        </p>
                      </Td>
                      <Td className="whitespace-nowrap">
                        {project.delivery_date ? (
                          <span
                            className={
                              late
                                ? 'inline-flex items-center gap-1 text-[0.75rem] font-semibold text-danger'
                                : 'text-[0.75rem] text-fg-muted'
                            }
                          >
                            {late && <AlertTriangle className="size-3" />}
                            {formatShortDate(project.delivery_date, 'fr')}
                          </span>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </Td>
                      <Td alignment="end" className="tabular-nums">
                        {project.budget > 0 ? formatMoney(project.budget, project.currency) : '—'}
                      </Td>
                      <Td alignment="end" className="tabular-nums">
                        {project.invoiced_total > 0 ? (
                          <span>
                            {formatMoney(project.invoiced_total, project.currency)}
                            {project.paid_total < project.invoiced_total && (
                              <span className="block text-[0.625rem] text-warning">
                                {formatMoney(project.invoiced_total - project.paid_total, project.currency)} dus
                              </span>
                            )}
                          </span>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
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
