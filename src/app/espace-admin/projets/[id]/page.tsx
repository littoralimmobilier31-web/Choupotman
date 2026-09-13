import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  AlertTriangle, Banknote, CalendarDays, CheckCircle2, Clock, FileText,
  FolderOpen, MessageSquareQuote, Plus, Receipt, RefreshCw, Sparkles, User,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/misc';
import { Meter } from '@/components/charts';
import { PageHeader, Section, MiniStat, DemoBadge, ListEmpty, DetailGrid } from '@/components/admin/page-kit';
import { ProjectForm, type ProjectFormValues } from '@/components/admin/project-form';
import { ProjectWorkspace } from '@/components/admin/project-workspace';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import {
  findProject, getKanban, getRevisionSummary, listFeedback, listProjectEvents,
  listRevisions, listStages, listTasks, priorityLabel, projectStatusLabel,
} from '@/lib/db/repositories/projects';
import { listInvoices, listQuotes, listContracts, invoiceStatusLabel, quoteStatusLabel } from '@/lib/db/repositories/finance';
import { listFiles } from '@/lib/db/repositories/files';
import { listBriefs } from '@/lib/db/repositories/briefs';
import { listMoodboards } from '@/lib/db/repositories/moodboards';
import { clientOptions } from '@/lib/db/repositories/clients';
import { listCategories } from '@/lib/db/repositories/content';
import { listUsers } from '@/lib/db/repositories/users';
import { formatMoney, formatShortDate, formatRelative } from '@/lib/i18n/format';
import { money } from '@/lib/money';
import { cn } from '@/lib/utils';

/**
 * Project hub.
 *
 * Everything about one project on a single screen: the numbers, the board, the
 * timeline, the money and the client's feedback. The intent is that during
 * delivery this is the only page you need open.
 */

export const dynamic = 'force-dynamic';

const STATUS_TONES: Record<string, 'neutral' | 'info' | 'brand' | 'warning' | 'success' | 'outline'> = {
  prospect: 'neutral', planning: 'info', in_progress: 'brand', in_review: 'warning',
  awaiting_client: 'warning', completed: 'success', archived: 'outline',
};

const PRIORITY_TONES: Record<string, 'neutral' | 'info' | 'warning' | 'danger'> = {
  low: 'neutral', medium: 'info', high: 'warning', urgent: 'danger',
};

const INVOICE_TONES: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'outline'> = {
  draft: 'neutral', sent: 'info', partially_paid: 'warning',
  paid: 'success', overdue: 'danger', cancelled: 'outline',
};

const EVENT_ICONS: Record<string, React.ReactNode> = {
  created: <Sparkles className="size-3" />,
  status: <RefreshCw className="size-3" />,
  stage: <CheckCircle2 className="size-3" />,
  task: <CheckCircle2 className="size-3" />,
  feedback: <MessageSquareQuote className="size-3" />,
  revision: <RefreshCw className="size-3" />,
  invoice: <Receipt className="size-3" />,
  payment: <Banknote className="size-3" />,
  quote: <FileText className="size-3" />,
  contract: <FileText className="size-3" />,
  file: <FolderOpen className="size-3" />,
  brief: <FileText className="size-3" />,
  message: <MessageSquareQuote className="size-3" />,
  ai: <Sparkles className="size-3" />,
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = findProject(Number.parseInt(id, 10));
  return { title: project?.title ?? 'Projet' };
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ onglet?: string; tache?: string }>;
}) {
  const user = await requirePermission('projects.view');
  const { id: raw } = await params;
  const query = await searchParams;
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const project = findProject(id);
  if (!project) notFound();

  const csrf = (await getCsrfToken()) ?? '';
  const editing = query.onglet === 'modifier' && can(user, 'projects.update');

  const stages = listStages(id);
  const tasks = listTasks({ projectId: id, status: 'all', limit: 500 });
  const kanban = getKanban({ projectId: id });
  const revisions = listRevisions(id);
  const revisionSummary = getRevisionSummary(id);
  const feedback = listFeedback({ projectId: id, limit: 30 });
  const events = listProjectEvents(id, 60);
  const files = listFiles({ projectId: id, limit: 40 });
  const quotes = can(user, 'quotes.view') ? listQuotes({ projectId: id }) : [];
  const invoices = can(user, 'invoices.view') ? listInvoices({ projectId: id }) : [];
  const contracts = can(user, 'contracts.view') ? listContracts({ projectId: id }) : [];
  const briefs = can(user, 'briefs.view') ? listBriefs({ limit: 50 }).filter((b) => b.project_id === id) : [];
  const moodboards = can(user, 'moodboards.view') ? listMoodboards({ projectId: id }) : [];

  const today = new Date().toISOString().slice(0, 10);
  const late =
    project.delivery_date !== null &&
    project.delivery_date < today &&
    project.status !== 'completed' &&
    project.status !== 'archived';

  const invoiced = money(invoices.filter((i) => i.status !== 'cancelled').reduce((a, i) => a + i.total, 0));
  const paid = money(invoices.reduce((a, i) => a + i.amount_paid, 0));
  const outstanding = money(invoiced - paid);
  const openTasks = tasks.filter((task) => task.status !== 'done').length;
  const overdueTasks = tasks.filter(
    (task) => task.due_date !== null && task.due_date < today && task.status !== 'done',
  ).length;

  if (editing) {
    const initialValues: ProjectFormValues = {
      title: project.title,
      client_id: project.client_id ? String(project.client_id) : '',
      category_id: project.category_id ? String(project.category_id) : '',
      description: project.description ?? '',
      status: project.status,
      priority: project.priority,
      budget: String(project.budget ?? 0),
      currency: project.currency,
      start_date: project.start_date ?? '',
      delivery_date: project.delivery_date ?? '',
      revisions_included: String(project.revisions_included),
      revision_extra_cost: String(project.revision_extra_cost),
      notes: project.notes ?? '',
      scaffold: false,
    };

    return (
      <div className="mx-auto max-w-3xl">
        <PageHeader
          title={`Modifier — ${project.title}`}
          backHref={`/espace-admin/projets/${id}`}
          backLabel="Retour au projet"
        />
        <ProjectForm
          csrf={csrf}
          projectId={id}
          initial={initialValues}
          clients={clientOptions()}
          categories={listCategories('project').map((c) => ({ id: c.id, name: c.name }))}
          canDelete={can(user, 'projects.delete')}
        />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={project.title}
        description={project.description ?? undefined}
        backHref="/espace-admin/projets"
        backLabel="Projets"
        breadcrumb={[
          { label: 'Projets', href: '/espace-admin/projets' },
          ...(project.client_id
            ? [{ label: project.client_name ?? 'Client', href: `/espace-admin/clients/${project.client_id}` }]
            : []),
          { label: project.reference },
        ]}
        badges={
          <>
            <Badge tone={STATUS_TONES[project.status] ?? 'neutral'}>{projectStatusLabel(project.status)}</Badge>
            <Badge tone={PRIORITY_TONES[project.priority] ?? 'neutral'}>{priorityLabel(project.priority)}</Badge>
            {late && (
              <Badge tone="danger">
                <AlertTriangle className="size-3" />
                En retard
              </Badge>
            )}
            {revisionSummary.overLimit && <Badge tone="warning">Révisions dépassées</Badge>}
            <DemoBadge when={project.is_demo} />
          </>
        }
        actions={
          <>
            {can(user, 'projects.update') && (
              <Link href={`/espace-admin/projets/${id}?onglet=modifier`} className={buttonClass('secondary', 'sm')}>
                Modifier
              </Link>
            )}
            {can(user, 'quotes.create') && (
              <Link
                href={`/espace-admin/devis/nouveau?projet=${id}${project.client_id ? `&client=${project.client_id}` : ''}`}
                className={buttonClass('secondary', 'sm')}
              >
                <FileText className="size-4" />
                Devis
              </Link>
            )}
            {can(user, 'invoices.create') && (
              <Link
                href={`/espace-admin/factures/nouveau?projet=${id}${project.client_id ? `&client=${project.client_id}` : ''}`}
                className={buttonClass('secondary', 'sm')}
              >
                <Receipt className="size-4" />
                Facture
              </Link>
            )}
          </>
        }
      />

      {/* KPI band */}
      <Card className="mb-6">
        <CardBody className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-6">
          <div className="col-span-2 sm:col-span-3 lg:col-span-2">
            <p className="text-[0.625rem] font-semibold uppercase tracking-wider text-fg-subtle">Avancement</p>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-[1.5rem] font-semibold leading-none text-fg">{project.progress}%</span>
              <span className="text-[0.75rem] text-fg-subtle">
                {project.done_task_count}/{project.task_count} tâches
              </span>
            </div>
            <Progress
              className="mt-2"
              value={project.progress}
              tone={late ? 'danger' : project.progress >= 80 ? 'success' : 'accent'}
            />
          </div>

          <MiniStat
            label="Budget"
            value={project.budget > 0 ? formatMoney(project.budget, project.currency) : '—'}
          />
          <MiniStat
            label="Facturé"
            value={invoiced > 0 ? formatMoney(invoiced, project.currency) : '—'}
            hint={paid > 0 ? `${formatMoney(paid, project.currency)} encaissés` : undefined}
          />
          <MiniStat
            label="Reste à encaisser"
            value={outstanding > 0 ? formatMoney(outstanding, project.currency) : '—'}
            tone={outstanding > 0 ? 'warning' : 'default'}
          />
          <MiniStat
            label="Tâches ouvertes"
            value={openTasks}
            tone={overdueTasks > 0 ? 'danger' : 'default'}
            hint={overdueTasks > 0 ? `${overdueTasks} en retard` : undefined}
          />
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          {/* Board + stages + AI, all client-side interactive */}
          <ProjectWorkspace
            csrf={csrf}
            projectId={id}
            projectTitle={project.title}
            stages={stages.map((stage) => ({
              id: stage.id,
              name: stage.name,
              status: stage.status,
              position: stage.position,
              due_date: stage.due_date,
              task_count: stage.task_count,
              done_count: stage.done_count,
            }))}
            kanban={kanban.map((column) => ({
              status: column.status,
              label: column.label,
              tone: column.tone,
              tasks: column.tasks.map((task) => ({
                id: task.id,
                title: task.title,
                status: task.status,
                priority: task.priority,
                position: task.position,
                due_date: task.due_date,
                project_id: task.project_id,
                project_title: task.project_title,
                stage_name: task.stage_name,
                assignee_name: task.assignee_name,
                checklist_total: task.checklist_total,
                checklist_done: task.checklist_done,
                comment_count: task.comment_count,
                file_count: task.file_count,
              })),
            }))}
            assignees={listUsers()
              .filter((u) => u.is_active === 1)
              .map((u) => ({ id: u.id, label: u.full_name ?? u.username }))}
            canUpdate={can(user, 'tasks.update')}
            canCreate={can(user, 'tasks.create')}
            canDelete={can(user, 'tasks.delete')}
            canUseAi={can(user, 'ai.create')}
          />

          {/* Finance */}
          {(quotes.length > 0 || invoices.length > 0 || contracts.length > 0) && (
            <Section title="Documents financiers">
              <div className="space-y-2">
                {quotes.map((quote) => (
                  <Link
                    key={`q-${quote.id}`}
                    href={`/espace-admin/devis/${quote.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-raised px-4 py-3 transition-colors hover:border-line-strong"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <FileText className="size-4 shrink-0 text-fg-subtle" />
                      <span className="min-w-0">
                        <span className="block truncate text-[0.8125rem] font-medium text-fg">{quote.number}</span>
                        <span className="block truncate text-[0.6875rem] text-fg-subtle">
                          Devis · {quote.title ?? '—'}
                        </span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <Badge tone={quote.status === 'accepted' ? 'success' : quote.status === 'sent' ? 'info' : 'neutral'}>
                        {quoteStatusLabel(quote.status)}
                      </Badge>
                      <span className="text-[0.8125rem] font-semibold tabular-nums text-fg">
                        {formatMoney(quote.total, quote.currency)}
                      </span>
                    </span>
                  </Link>
                ))}

                {invoices.map((invoice) => (
                  <Link
                    key={`i-${invoice.id}`}
                    href={`/espace-admin/factures/${invoice.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-raised px-4 py-3 transition-colors hover:border-line-strong"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <Receipt className="size-4 shrink-0 text-fg-subtle" />
                      <span className="min-w-0">
                        <span className="block truncate text-[0.8125rem] font-medium text-fg">{invoice.number}</span>
                        <span className="block truncate text-[0.6875rem] text-fg-subtle">
                          Facture{invoice.due_date ? ` · échéance ${formatShortDate(invoice.due_date, 'fr')}` : ''}
                        </span>
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <Badge tone={INVOICE_TONES[invoice.status] ?? 'neutral'}>
                        {invoiceStatusLabel(invoice.status)}
                      </Badge>
                      <span className="text-end">
                        <span className="block text-[0.8125rem] font-semibold tabular-nums text-fg">
                          {formatMoney(invoice.total, invoice.currency)}
                        </span>
                        {invoice.balance_due > 0 && (
                          <span className="block text-[0.625rem] tabular-nums text-warning">
                            {formatMoney(invoice.balance_due, invoice.currency)} dus
                          </span>
                        )}
                      </span>
                    </span>
                  </Link>
                ))}

                {contracts.map((contract) => (
                  <Link
                    key={`c-${contract.id}`}
                    href={`/espace-admin/contrats/${contract.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface-raised px-4 py-3 transition-colors hover:border-line-strong"
                  >
                    <span className="flex min-w-0 items-center gap-2.5">
                      <FileText className="size-4 shrink-0 text-fg-subtle" />
                      <span className="min-w-0">
                        <span className="block truncate text-[0.8125rem] font-medium text-fg">{contract.number}</span>
                        <span className="block truncate text-[0.6875rem] text-fg-subtle">{contract.title}</span>
                      </span>
                    </span>
                    <Badge tone={contract.status === 'signed' ? 'success' : contract.status === 'sent' ? 'info' : 'neutral'}>
                      {contract.status === 'signed' ? 'Signé' : contract.status === 'sent' ? 'Envoyé' : 'Brouillon'}
                    </Badge>
                  </Link>
                ))}
              </div>
            </Section>
          )}

          {/* Feedback */}
          <Section
            title={`Feedback client (${feedback.length})`}
            action={
              can(user, 'feedback.create') && (
                <Link
                  href={`/espace-admin/feedback?projet=${id}`}
                  className="text-[0.75rem] font-semibold text-accent hover:underline"
                >
                  Tout voir
                </Link>
              )
            }
          >
            {feedback.length === 0 ? (
              <ListEmpty
                icon={<MessageSquareQuote className="size-5" />}
                title="Aucun retour client"
                description="Les retours envoyés depuis l’espace client apparaissent ici et dans la timeline."
              />
            ) : (
              <div className="space-y-2">
                {feedback.slice(0, 6).map((item) => (
                  <article
                    key={item.id}
                    className="rounded-lg border border-line bg-surface-raised p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <Badge
                          tone={
                            item.decision === 'approved'
                              ? 'success'
                              : item.decision === 'changes_requested'
                                ? 'warning'
                                : 'neutral'
                          }
                        >
                          {item.decision === 'approved'
                            ? 'Validé'
                            : item.decision === 'changes_requested'
                              ? 'Modifications demandées'
                              : 'Commentaire'}
                        </Badge>
                        {item.rating && (
                          <span className="text-[0.75rem] text-warning" aria-label={`${item.rating}/5`}>
                            {'★'.repeat(item.rating)}
                            <span className="text-line-strong">{'★'.repeat(5 - item.rating)}</span>
                          </span>
                        )}
                        <Badge tone={item.status === 'resolved' ? 'outline' : 'info'}>
                          {item.status === 'resolved' ? 'Traité' : item.status === 'acknowledged' ? 'Vu' : 'Nouveau'}
                        </Badge>
                      </span>
                      <span className="text-[0.625rem] text-fg-subtle">
                        {formatRelative(item.created_at, 'fr')}
                      </span>
                    </div>
                    {item.comment && (
                      <p className="mt-2.5 whitespace-pre-line text-[0.8125rem] leading-relaxed text-fg-muted">
                        {item.comment}
                      </p>
                    )}
                    {item.author_label && (
                      <p className="mt-2 inline-flex items-center gap-1.5 text-[0.6875rem] text-fg-subtle">
                        <User className="size-3" />
                        {item.author_label}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            )}
          </Section>

          {/* Timeline */}
          <Section title="Timeline du projet" description="Toutes les actions importantes, du brief à la livraison.">
            {events.length === 0 ? (
              <ListEmpty icon={<Clock className="size-5" />} title="Aucun événement enregistré" />
            ) : (
              <ol className="relative space-y-4 border-s border-line ps-6">
                {events.map((event) => (
                  <li key={event.id} className="relative">
                    <span
                      className="absolute -start-[1.6875rem] top-1 flex size-5 items-center justify-center rounded-full border-2 border-surface bg-surface-sunken text-fg-subtle"
                      aria-hidden
                    >
                      {EVENT_ICONS[event.kind] ?? <Clock className="size-3" />}
                    </span>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-[0.8125rem] font-medium text-fg">{event.title}</p>
                      <time className="text-[0.625rem] text-fg-subtle" dateTime={event.created_at}>
                        {formatRelative(event.created_at, 'fr')}
                      </time>
                    </div>
                    {event.body && (
                      <p className="mt-0.5 whitespace-pre-line text-[0.75rem] leading-relaxed text-fg-muted">
                        {event.body}
                      </p>
                    )}
                    {event.actor_label && (
                      <p className="mt-1 text-[0.625rem] text-fg-subtle">{event.actor_label}</p>
                    )}
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>

        {/* Sidebar */}
        <aside className="space-y-5 lg:sticky lg:top-20">
          <Card>
            <CardHeader>
              <CardTitle>Informations</CardTitle>
            </CardHeader>
            <CardBody className="pt-3">
              <DetailGrid
                columns={2}
                items={[
                  { label: 'Référence', value: <span className="font-mono">{project.reference}</span> },
                  {
                    label: 'Client',
                    value: project.client_id ? (
                      <Link href={`/espace-admin/clients/${project.client_id}`} className="text-accent hover:underline">
                        {project.client_company ?? project.client_name}
                      </Link>
                    ) : (
                      '—'
                    ),
                  },
                  { label: 'Catégorie', value: project.category_name ?? '—' },
                  { label: 'Début', value: project.start_date ? formatShortDate(project.start_date, 'fr') : '—' },
                  {
                    label: 'Livraison',
                    value: project.delivery_date ? (
                      <span className={late ? 'font-semibold text-danger' : undefined}>
                        {formatShortDate(project.delivery_date, 'fr')}
                      </span>
                    ) : (
                      '—'
                    ),
                  },
                  {
                    label: 'Terminé le',
                    value: project.completed_at ? formatShortDate(project.completed_at, 'fr') : '—',
                  },
                ]}
              />
            </CardBody>
          </Card>

          {/* Revisions counter — the spec's "0 / 3" with overflow handling */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <RefreshCw className="size-4 text-fg-subtle" />
                Révisions
              </CardTitle>
              <Badge tone={revisionSummary.overLimit ? 'danger' : 'neutral'}>
                {revisionSummary.used} / {revisionSummary.included}
              </Badge>
            </CardHeader>
            <CardBody className="pt-3">
              <Meter
                value={revisionSummary.used}
                max={Math.max(revisionSummary.included, revisionSummary.used)}
                label={
                  revisionSummary.overLimit
                    ? `${revisionSummary.extras} révision(s) hors forfait`
                    : `${revisionSummary.remaining} restante(s)`
                }
                valueLabel={
                  revisionSummary.extraCostTotal > 0
                    ? formatMoney(revisionSummary.extraCostTotal, project.currency)
                    : undefined
                }
                thresholds={{ warning: 0.7, danger: 1 }}
              />

              {revisionSummary.overLimit && (
                <p className="mt-3 rounded-lg bg-warning-soft px-3 py-2 text-[0.6875rem] leading-relaxed text-warning">
                  Le forfait de {revisionSummary.included} révision(s) est dépassé. Une facture
                  complémentaire a été préparée automatiquement en brouillon.
                </p>
              )}

              {revisions.length > 0 && (
                <ul className="mt-4 space-y-2 border-t border-line pt-3">
                  {revisions.slice(0, 6).map((revision) => (
                    <li key={revision.id} className="flex items-start justify-between gap-2 text-[0.75rem]">
                      <span className="min-w-0">
                        <span className="block truncate text-fg">
                          #{revision.index_number} {revision.title ?? ''}
                        </span>
                        <span className="text-[0.625rem] text-fg-subtle">
                          {formatShortDate(revision.requested_at, 'fr')}
                        </span>
                      </span>
                      <span className="flex shrink-0 flex-col items-end gap-0.5">
                        <Badge
                          tone={
                            revision.status === 'done'
                              ? 'success'
                              : revision.status === 'rejected'
                                ? 'outline'
                                : 'info'
                          }
                        >
                          {revision.status === 'done'
                            ? 'Faite'
                            : revision.status === 'in_progress'
                              ? 'En cours'
                              : revision.status === 'rejected'
                                ? 'Refusée'
                                : 'Ouverte'}
                        </Badge>
                        {revision.is_extra === 1 && (
                          <span className="text-[0.625rem] font-semibold text-warning">
                            +{formatMoney(revision.extra_cost, revision.currency)}
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {/* Files */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FolderOpen className="size-4 text-fg-subtle" />
                Fichiers
              </CardTitle>
              <Link
                href={`/espace-admin/fichiers?projet=${id}`}
                className="text-[0.75rem] font-semibold text-accent hover:underline"
              >
                Ouvrir
              </Link>
            </CardHeader>
            <CardBody className="pt-3">
              {files.length === 0 ? (
                <p className="text-[0.75rem] text-fg-muted">
                  L’arborescence du projet est créée, mais aucun fichier n’a encore été déposé.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {files.slice(0, 6).map((file) => (
                    <li key={file.id} className="flex items-center justify-between gap-2 text-[0.75rem]">
                      <span className="min-w-0 truncate text-fg-muted">{file.original_name}</span>
                      <span className="shrink-0 text-[0.625rem] text-fg-subtle">{file.kind}</span>
                    </li>
                  ))}
                  {files.length > 6 && (
                    <li className="text-[0.6875rem] text-fg-subtle">+{files.length - 6} autre(s)</li>
                  )}
                </ul>
              )}
            </CardBody>
          </Card>

          {/* Briefs & moodboards */}
          {(briefs.length > 0 || moodboards.length > 0) && (
            <Card>
              <CardHeader>
                <CardTitle>Cadrage & direction visuelle</CardTitle>
              </CardHeader>
              <CardBody className="space-y-2 pt-3">
                {briefs.map((brief) => (
                  <Link
                    key={`b-${brief.id}`}
                    href={`/espace-admin/briefs/${brief.id}`}
                    className="flex items-center justify-between gap-2 rounded-md px-1 py-1.5 text-[0.75rem] transition-colors hover:bg-surface-hover"
                  >
                    <span className="min-w-0 truncate text-fg-muted">{brief.title}</span>
                    <Badge tone={brief.status === 'completed' ? 'success' : 'info'}>
                      {brief.answered_count}/{brief.question_count}
                    </Badge>
                  </Link>
                ))}
                {moodboards.map((board) => (
                  <Link
                    key={`m-${board.id}`}
                    href={`/espace-admin/moodboards/${board.id}`}
                    className="flex items-center justify-between gap-2 rounded-md px-1 py-1.5 text-[0.75rem] transition-colors hover:bg-surface-hover"
                  >
                    <span className="min-w-0 truncate text-fg-muted">{board.title}</span>
                    <span className="shrink-0 text-[0.625rem] text-fg-subtle">{board.item_count} élém.</span>
                  </Link>
                ))}
              </CardBody>
            </Card>
          )}

          {project.notes && (
            <Card>
              <CardHeader>
                <CardTitle>Notes internes</CardTitle>
              </CardHeader>
              <CardBody className="pt-3">
                <p className="whitespace-pre-line text-[0.8125rem] leading-relaxed text-fg-muted">{project.notes}</p>
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Actions rapides</CardTitle>
            </CardHeader>
            <CardBody className="flex flex-col gap-2 pt-3">
              {can(user, 'calendar.create') && (
                <Link
                  href={`/espace-admin/calendrier?projet=${id}&action=nouveau`}
                  className={buttonClass('secondary', 'sm', 'w-full justify-start')}
                >
                  <CalendarDays className="size-3.5" />
                  Planifier une réunion
                </Link>
              )}
              {can(user, 'briefs.create') && (
                <Link
                  href={`/espace-admin/briefs?projet=${id}&action=nouveau`}
                  className={buttonClass('secondary', 'sm', 'w-full justify-start')}
                >
                  <FileText className="size-3.5" />
                  Envoyer un brief
                </Link>
              )}
              {can(user, 'contracts.create') && (
                <Link
                  href={`/espace-admin/contrats/nouveau?projet=${id}`}
                  className={buttonClass('secondary', 'sm', 'w-full justify-start')}
                >
                  <FileText className="size-3.5" />
                  Générer un contrat
                </Link>
              )}
              {can(user, 'moodboards.create') && (
                <Link
                  href={`/espace-admin/moodboards?projet=${id}&action=nouveau`}
                  className={buttonClass('secondary', 'sm', 'w-full justify-start')}
                >
                  <Plus className="size-3.5" />
                  Créer un moodboard
                </Link>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
