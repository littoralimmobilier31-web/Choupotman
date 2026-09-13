import Link from 'next/link';
import { AlertTriangle, CheckSquare, ListChecks, MessageSquare } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Avatar } from '@/components/ui/misc';
import { TableWrap, Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table';
import { PageHeader, SummaryStrip, ListEmpty } from '@/components/admin/page-kit';
import { ListFilters } from '@/components/admin/list-filters';
import { TaskBoard } from '@/components/admin/task-board';
import { TaskDrawerHost } from '@/components/admin/task-drawer-host';
import { ViewSwitch } from '@/components/admin/view-switch';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import {
  countTasks, getKanban, listTasks, priorityLabel, taskStatusLabel,
  projectOptions, PRIORITIES, TASK_STATUSES,
} from '@/lib/db/repositories/projects';
import { listUsers } from '@/lib/db/repositories/users';
import { formatShortDate } from '@/lib/i18n/format';
import type { Priority, TaskStatus } from '@/lib/db/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Tâches' };

const STATUS_TONES: Record<string, 'neutral' | 'brand' | 'warning' | 'success' | 'danger'> = {
  todo: 'neutral', in_progress: 'brand', review: 'warning', done: 'success', blocked: 'danger',
};

const PRIORITY_TONES: Record<string, 'neutral' | 'info' | 'warning' | 'danger'> = {
  low: 'neutral', medium: 'info', high: 'warning', urgent: 'danger',
};

export default async function TasksPage({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string; statut?: string; projet?: string; assigne?: string;
    priorite?: string; retard?: string; vue?: string; tache?: string;
  }>;
}) {
  const user = await requirePermission('tasks.view');
  const query = await searchParams;
  const csrf = (await getCsrfToken()) ?? '';

  const today = new Date().toISOString().slice(0, 10);
  const view = query.vue === 'liste' ? 'liste' : 'kanban';

  const filter = {
    search: query.q?.trim() || undefined,
    // The board shows every column, so a status filter only applies to the list.
    status: (view === 'liste' ? (query.statut as TaskStatus | 'all' | 'open') : undefined) || undefined,
    projectId: Number.parseInt(query.projet ?? '', 10) || undefined,
    assigneeId: Number.parseInt(query.assigne ?? '', 10) || undefined,
    priority: (query.priorite as Priority) || undefined,
    overdueOnly: query.retard === '1',
    limit: 400,
  };

  const projects = projectOptions();
  const assignees = listUsers()
    .filter((person) => person.is_active === 1)
    .map((person) => ({ id: person.id, label: person.full_name ?? person.username }));

  return (
    <>
      <PageHeader
        title="Tâches"
        description="Kanban global : toutes les tâches, tous projets confondus. Glissez une carte pour changer son statut."
      />

      <SummaryStrip
        items={[
          { label: 'À faire', value: countTasks({ status: 'todo' }), href: '/espace-admin/taches?vue=liste&statut=todo' },
          { label: 'En cours', value: countTasks({ status: 'in_progress' }), href: '/espace-admin/taches?vue=liste&statut=in_progress' },
          { label: 'Bloquées', value: countTasks({ status: 'blocked' }), href: '/espace-admin/taches?vue=liste&statut=blocked' },
          { label: 'En retard', value: countTasks({ overdueOnly: true }), href: '/espace-admin/taches?retard=1' },
          { label: 'Ouvertes', value: countTasks({ status: 'open' }) },
        ]}
      />

      <ListFilters
        searchPlaceholder="Titre ou description…"
        selects={[
          ...(view === 'liste'
            ? [
                {
                  key: 'statut',
                  label: 'Statut',
                  allLabel: 'Tous les statuts',
                  options: [
                    { value: 'open', label: 'Non terminées' },
                    ...TASK_STATUSES.map((status) => ({ value: status.key, label: status.label })),
                  ],
                },
              ]
            : []),
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
          ...(assignees.length > 1
            ? [
                {
                  key: 'assigne',
                  label: 'Responsable',
                  allLabel: 'Tous les responsables',
                  options: assignees.map((person) => ({ value: String(person.id), label: person.label })),
                },
              ]
            : []),
          {
            key: 'priorite',
            label: 'Priorité',
            allLabel: 'Toutes les priorités',
            options: PRIORITIES.map((priority) => ({ value: priority.key, label: priority.label })),
          },
        ]}
      >
        <ViewSwitch
          paramKey="vue"
          options={[
            { value: 'kanban', label: 'Kanban' },
            { value: 'liste', label: 'Liste' },
          ]}
          defaultValue="kanban"
        />
      </ListFilters>

      <div className="mt-5">
        {view === 'kanban' ? (
          <TaskBoard
            csrf={csrf}
            columns={getKanban(filter)}
            projects={projects.map((project) => ({ id: project.id, label: project.label }))}
            assignees={assignees}
            canUpdate={can(user, 'tasks.update')}
            canCreate={can(user, 'tasks.create')}
            canDelete={can(user, 'tasks.delete')}
          />
        ) : (
          <>
            <TaskList tasks={listTasks(filter)} today={today} />
            {/* The list links to `?tache=`, so it needs the drawer too. */}
            <TaskDrawerHost
              csrf={csrf}
              assignees={assignees}
              canUpdate={can(user, 'tasks.update')}
              canDelete={can(user, 'tasks.delete')}
            />
          </>
        )}
      </div>
    </>
  );
}

function TaskList({
  tasks,
  today,
}: {
  tasks: ReturnType<typeof listTasks>;
  today: string;
}) {
  if (tasks.length === 0) {
    return (
      <ListEmpty
        icon={<ListChecks className="size-5" />}
        title="Aucune tâche"
        description="Les tâches se créent depuis un projet, ou directement sur le kanban."
      />
    );
  }

  return (
    <TableWrap>
      <Table>
        <Thead>
          <tr>
            <Th>Tâche</Th>
            <Th>Projet</Th>
            <Th alignment="center">Statut</Th>
            <Th alignment="center">Priorité</Th>
            <Th>Échéance</Th>
            <Th alignment="center">Avancement</Th>
            <Th>Responsable</Th>
          </tr>
        </Thead>
        <Tbody>
          {tasks.map((task) => {
            const late = task.due_date !== null && task.due_date < today && task.status !== 'done';
            return (
              <Tr key={task.id}>
                <Td>
                  <Link
                    href={`/espace-admin/taches?tache=${task.id}`}
                    className="block min-w-0 font-medium text-fg hover:text-accent"
                  >
                    {task.title}
                  </Link>
                  {task.stage_name && (
                    <span className="text-[0.6875rem] text-fg-subtle">{task.stage_name}</span>
                  )}
                </Td>
                <Td>
                  {task.project_id ? (
                    <Link
                      href={`/espace-admin/projets/${task.project_id}`}
                      className="text-[0.8125rem] text-fg-muted transition-colors hover:text-accent"
                    >
                      {task.project_title}
                    </Link>
                  ) : (
                    <span className="text-fg-subtle">—</span>
                  )}
                </Td>
                <Td alignment="center">
                  <Badge tone={STATUS_TONES[task.status] ?? 'neutral'}>{taskStatusLabel(task.status)}</Badge>
                </Td>
                <Td alignment="center">
                  <Badge tone={PRIORITY_TONES[task.priority] ?? 'neutral'}>{priorityLabel(task.priority)}</Badge>
                </Td>
                <Td className="whitespace-nowrap">
                  {task.due_date ? (
                    <span
                      className={
                        late
                          ? 'inline-flex items-center gap-1 text-[0.75rem] font-semibold text-danger'
                          : 'text-[0.75rem] text-fg-muted'
                      }
                    >
                      {late && <AlertTriangle className="size-3" />}
                      {formatShortDate(task.due_date, 'fr')}
                    </span>
                  ) : (
                    <span className="text-fg-subtle">—</span>
                  )}
                </Td>
                <Td alignment="center" className="whitespace-nowrap text-[0.6875rem] tabular-nums text-fg-muted">
                  {task.checklist_total > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <CheckSquare className="size-3" />
                      {task.checklist_done}/{task.checklist_total}
                    </span>
                  )}
                  {task.comment_count > 0 && (
                    <span className="ms-2 inline-flex items-center gap-1">
                      <MessageSquare className="size-3" />
                      {task.comment_count}
                    </span>
                  )}
                  {task.checklist_total === 0 && task.comment_count === 0 && (
                    <span className="text-fg-subtle">—</span>
                  )}
                </Td>
                <Td>
                  {task.assignee_name ? (
                    <span className="inline-flex items-center gap-2 text-[0.75rem] text-fg-muted">
                      <Avatar name={task.assignee_name} size={20} />
                      {task.assignee_name}
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
  );
}
