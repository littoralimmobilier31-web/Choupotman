import Link from 'next/link';
import {
  AlertTriangle, ArrowRight, Banknote, CalendarClock, CheckCircle2, Clock,
  CreditCard, FolderKanban, Inbox, Receipt, Target, TrendingUp, Users,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState, Progress } from '@/components/ui/misc';
import { StatTile, HeroFigure, LineChart, DonutChart, HBarChart, Meter } from '@/components/charts';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { delta, getDashboardStats, monthlyFinance, projectsByStatus, topClientsByRevenue } from '@/lib/db/repositories/analytics';
import { listProjects, projectStatusLabel, listTasks, listFeedback } from '@/lib/db/repositories/projects';
import { listInvoices } from '@/lib/db/repositories/finance';
import { upcomingEntries } from '@/lib/db/repositories/calendar';
import { getPipelineStats } from '@/lib/db/repositories/leads';
import { upcomingRenewals } from '@/lib/db/repositories/expenses';
import { listContactSubmissions } from '@/lib/db/repositories/comms';
import { formatMoney, formatRelative, formatShortDate } from '@/lib/i18n/format';
import { cn } from '@/lib/utils';

/**
 * Admin dashboard.
 *
 * One hero figure (revenue for the period), a KPI row, then the things that need
 * a decision today: overdue money, approaching deadlines, unread requests. Every
 * number links to the screen where it can be acted on — a dashboard that cannot
 * be acted on is just decoration.
 */

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Tableau de bord' };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ refus?: string }>;
}) {
  const user = await requirePermission('dashboard.view');
  const query = await searchParams;

  const stats = getDashboardStats('month');
  const finance = monthlyFinance(12);
  const pipeline = getPipelineStats();
  const currency = stats.currency;

  const showFinance = can(user, 'invoices.view') || can(user, 'analytics.view');

  const activeProjects = can(user, 'projects.view')
    ? listProjects({ status: 'active', sort: 'delivery', limit: 6 })
    : [];
  const overdueInvoices = can(user, 'invoices.view')
    ? listInvoices({ status: 'overdue', limit: 5 })
    : [];
  const upcoming = can(user, 'calendar.view') ? upcomingEntries(14, 7) : [];
  const overdueTasks = can(user, 'tasks.view') ? listTasks({ overdueOnly: true, limit: 5 }) : [];
  const newRequests = can(user, 'leads.view') ? listContactSubmissions({ status: 'new', limit: 5 }) : [];
  const newFeedback = can(user, 'feedback.view') ? listFeedback({ status: 'new', limit: 4 }) : [];
  const renewals = can(user, 'subscriptions.view') ? upcomingRenewals(14) : [];
  const statusCounts = can(user, 'projects.view') ? projectsByStatus() : [];
  const topClients = can(user, 'analytics.view') ? topClientsByRevenue(6) : [];

  const revenueDelta = delta(stats.finance.revenue, stats.finance.revenuePrevious);
  const expensesDelta = delta(stats.finance.expenses, stats.finance.expensesPrevious);
  const viewsDelta = delta(stats.traffic.views, stats.traffic.viewsPrevious);

  // Donut slots are keyed by status so filtering never repaints the survivors.
  const STATUS_SLOT: Record<string, number> = {
    prospect: 5, planning: 1, in_progress: 0, in_review: 3,
    awaiting_client: 2, completed: 4, archived: 5,
  };

  return (
    <div className="space-y-8">
      {query.refus && (
        <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-warning/30 bg-warning-soft px-4 py-3">
          <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
          <p className="text-[0.8125rem] leading-relaxed text-fg-muted">
            Accès refusé : votre rôle <strong className="text-fg">{user.role_name}</strong> n’a pas la permission{' '}
            <code className="font-mono text-[0.75rem]">{query.refus}</code>.
          </p>
        </div>
      )}

      {/* Header + hero */}
      <header className="flex flex-wrap items-end justify-between gap-6">
        <div>
          <p className="text-[0.8125rem] text-fg-muted">
            Bonjour {user.full_name?.split(' ')[0] ?? user.username} — voici l’essentiel.
          </p>
          {showFinance ? (
            <HeroFigure
              className="mt-3"
              label="Revenus encaissés · 30 derniers jours"
              value={formatMoney(stats.finance.revenue, currency)}
              sub={
                revenueDelta === null
                  ? 'Aucune période de comparaison'
                  : `${revenueDelta > 0 ? '+' : ''}${revenueDelta.toFixed(1).replace('.', ',')} % vs 30 jours précédents`
              }
            />
          ) : (
            <h1 className="mt-3 text-2xl font-semibold tracking-tight text-fg">Tableau de bord</h1>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {can(user, 'projects.create') && (
            <Link href="/espace-admin/projets/nouveau" className={buttonClass('primary', 'sm')}>
              Nouveau projet
            </Link>
          )}
          {can(user, 'quotes.create') && (
            <Link href="/espace-admin/devis/nouveau" className={buttonClass('secondary', 'sm')}>
              Nouveau devis
            </Link>
          )}
          {can(user, 'clients.create') && (
            <Link href="/espace-admin/clients/nouveau" className={buttonClass('secondary', 'sm')}>
              Nouveau client
            </Link>
          )}
        </div>
      </header>

      {/* KPI row */}
      <section aria-label="Indicateurs clés">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {showFinance && (
            <>
              <StatTile
                label="En attente de paiement"
                value={formatMoney(stats.finance.outstanding, currency)}
                icon={<Receipt className="size-4" />}
                hint={`${stats.finance.overdueCount} facture(s) en retard`}
                upIsGood={false}
                href="/espace-admin/factures?statut=unpaid"
                slot={3}
              />
              <StatTile
                label="Dépenses · 30 jours"
                value={formatMoney(stats.finance.expenses, currency)}
                delta={expensesDelta}
                deltaPeriod="vs période précédente"
                upIsGood={false}
                icon={<CreditCard className="size-4" />}
                href="/espace-admin/depenses"
                slot={2}
              />
              <StatTile
                label="Bénéfice · 30 jours"
                value={formatMoney(stats.finance.profit, currency)}
                icon={<TrendingUp className="size-4" />}
                hint={`Récurrent : ${formatMoney(stats.finance.monthlyRecurring, currency)}/mois`}
                href="/espace-admin/statistiques"
                slot={4}
              />
            </>
          )}

          <StatTile
            label="Projets actifs"
            value={stats.projects.active}
            icon={<FolderKanban className="size-4" />}
            hint={stats.projects.overdue > 0 ? `${stats.projects.overdue} en retard` : 'Aucun retard'}
            href="/espace-admin/projets?statut=active"
            slot={0}
          />

          {!showFinance && (
            <>
              <StatTile
                label="Tâches ouvertes"
                value={stats.tasks.open}
                icon={<Clock className="size-4" />}
                hint={`${stats.tasks.overdue} en retard`}
                upIsGood={false}
                href="/espace-admin/taches"
                slot={3}
              />
              <StatTile
                label="Clients"
                value={stats.clients.active}
                icon={<Users className="size-4" />}
                hint={`+${stats.clients.newInPeriod} ce mois`}
                href="/espace-admin/clients"
                slot={1}
              />
              <StatTile
                label="Prospects ouverts"
                value={pipeline.open}
                icon={<Target className="size-4" />}
                hint={`Conversion ${pipeline.conversionRate} %`}
                href="/espace-admin/prospects"
                slot={2}
              />
            </>
          )}
        </div>
      </section>

      {/* Traffic & funnel */}
      {can(user, 'analytics.view') && (
        <section aria-label="Audience et conversion">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Visites · 30 jours"
              value={stats.traffic.views.toLocaleString('fr-FR')}
              delta={viewsDelta}
              deltaPeriod="vs période précédente"
              icon={<TrendingUp className="size-4" />}
              href="/espace-admin/statistiques"
              slot={1}
            />
            <StatTile
              label="Visiteurs uniques"
              value={stats.traffic.visitors.toLocaleString('fr-FR')}
              icon={<Users className="size-4" />}
              hint={`${stats.traffic.conversions} conversion(s)`}
              href="/espace-admin/statistiques"
              slot={1}
            />
            <StatTile
              label="Taux de conversion"
              value={`${stats.traffic.conversionRate.toFixed(1).replace('.', ',')} %`}
              icon={<Target className="size-4" />}
              hint="Demandes / visiteurs"
              href="/espace-admin/statistiques"
              slot={0}
            />
            <StatTile
              label="Pipeline ouvert"
              value={formatMoney(pipeline.potentialValue, currency)}
              icon={<Target className="size-4" />}
              hint={`${pipeline.open} prospect(s) · ${pipeline.conversionRate} % gagnés`}
              href="/espace-admin/prospects"
              slot={2}
            />
          </div>
        </section>
      )}

      {/* Attention required */}
      {(overdueInvoices.length > 0 || overdueTasks.length > 0 || stats.projects.overdue > 0) && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-[0.8125rem] font-semibold uppercase tracking-wider text-fg-subtle">
            <AlertTriangle className="size-3.5 text-warning" />
            Demande votre attention
          </h2>
          <div className="grid gap-4 lg:grid-cols-2">
            {overdueInvoices.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Receipt className="size-4 text-danger" />
                    Factures en retard
                  </CardTitle>
                  <Badge tone="danger">{formatMoney(stats.finance.overdueAmount, currency)}</Badge>
                </CardHeader>
                <CardBody className="pt-3">
                  <ul className="divide-y divide-line">
                    {overdueInvoices.map((invoice) => (
                      <li key={invoice.id}>
                        <Link
                          href={`/espace-admin/factures/${invoice.id}`}
                          className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-surface-hover"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[0.8125rem] font-medium text-fg">
                              {invoice.number}
                            </span>
                            <span className="block truncate text-[0.6875rem] text-fg-subtle">
                              {invoice.client_name ?? '—'} · {invoice.days_overdue} j de retard
                            </span>
                          </span>
                          <span className="shrink-0 text-[0.8125rem] font-semibold tabular-nums text-danger">
                            {formatMoney(invoice.balance_due, invoice.currency)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/espace-admin/factures?statut=overdue"
                    className="mt-3 inline-flex items-center gap-1 text-[0.75rem] font-semibold text-accent hover:underline"
                  >
                    Tout voir
                    <ArrowRight className="size-3 rtl:-scale-x-100" />
                  </Link>
                </CardBody>
              </Card>
            )}

            {overdueTasks.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="size-4 text-warning" />
                    Tâches en retard
                  </CardTitle>
                  <Badge tone="warning">{stats.tasks.overdue}</Badge>
                </CardHeader>
                <CardBody className="pt-3">
                  <ul className="divide-y divide-line">
                    {overdueTasks.map((task) => (
                      <li key={task.id}>
                        <Link
                          href={task.project_id ? `/espace-admin/projets/${task.project_id}?tache=${task.id}` : '/espace-admin/taches'}
                          className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2.5 transition-colors hover:bg-surface-hover"
                        >
                          <span className="min-w-0">
                            <span className="block truncate text-[0.8125rem] font-medium text-fg">{task.title}</span>
                            <span className="block truncate text-[0.6875rem] text-fg-subtle">
                              {task.project_title ?? 'Sans projet'}
                            </span>
                          </span>
                          <span className="shrink-0 text-[0.6875rem] font-medium text-warning">
                            {task.due_date ? formatShortDate(task.due_date, 'fr') : '—'}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href="/espace-admin/taches"
                    className="mt-3 inline-flex items-center gap-1 text-[0.75rem] font-semibold text-accent hover:underline"
                  >
                    Voir le kanban
                    <ArrowRight className="size-3 rtl:-scale-x-100" />
                  </Link>
                </CardBody>
              </Card>
            )}
          </div>
        </section>
      )}

      {/* Charts */}
      {showFinance && (
        <section className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
          <Card>
            <CardBody>
              <LineChart
                title="Revenus et dépenses"
                subtitle="12 derniers mois, en DZD"
                labels={finance.labels}
                height={280}
                unit={currency}
                series={[
                  { key: 'revenue', label: 'Revenus', slot: 0, values: finance.revenue, area: true },
                  { key: 'expenses', label: 'Dépenses', slot: 3, values: finance.expenses },
                ]}
              />
            </CardBody>
          </Card>

          <Card>
            <CardBody>
              {statusCounts.length > 0 ? (
                <DonutChart
                  title="Projets par statut"
                  centerLabel="projets"
                  format={{ style: 'integer' }}
                  slices={statusCounts.map((row) => ({
                    key: row.status,
                    label: projectStatusLabel(row.status),
                    value: row.count,
                    slot: STATUS_SLOT[row.status] ?? 5,
                  }))}
                />
              ) : (
                <EmptyState icon={<FolderKanban className="size-5" />} title="Aucun projet enregistré" />
              )}
            </CardBody>
          </Card>
        </section>
      )}

      {/* Operational panels */}
      <section className="grid gap-4 lg:grid-cols-3">
        {/* Active projects */}
        {activeProjects.length > 0 && (
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle>Projets en cours</CardTitle>
              <Link
                href="/espace-admin/projets"
                className="text-[0.75rem] font-semibold text-accent hover:underline"
              >
                Tout voir
              </Link>
            </CardHeader>
            <CardBody className="pt-3">
              <ul className="space-y-4">
                {activeProjects.map((project) => {
                  const late =
                    project.delivery_date !== null &&
                    project.delivery_date < new Date().toISOString().slice(0, 10);
                  return (
                    <li key={project.id}>
                      <Link href={`/espace-admin/projets/${project.id}`} className="group block">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <span className="min-w-0 truncate text-[0.875rem] font-medium text-fg group-hover:text-accent">
                            {project.title}
                          </span>
                          <span className="flex shrink-0 items-center gap-2 text-[0.6875rem]">
                            <Badge tone={late ? 'danger' : 'neutral'}>
                              {project.delivery_date ? formatShortDate(project.delivery_date, 'fr') : 'Sans échéance'}
                            </Badge>
                            <span className="font-semibold tabular-nums text-fg-muted">{project.progress}%</span>
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-[0.6875rem] text-fg-subtle">
                          {project.client_name ?? 'Sans client'} · {project.done_task_count}/{project.task_count} tâches
                          {project.open_revision_count > 0 ? ` · ${project.open_revision_count} révision(s)` : ''}
                        </p>
                        <Progress
                          className="mt-2"
                          value={project.progress}
                          tone={late ? 'danger' : project.progress >= 80 ? 'success' : 'accent'}
                        />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </CardBody>
          </Card>
        )}

        {/* Upcoming */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarClock className="size-4 text-fg-subtle" />
              À venir
            </CardTitle>
          </CardHeader>
          <CardBody className="pt-3">
            {upcoming.length === 0 ? (
              <p className="py-6 text-center text-[0.8125rem] text-fg-subtle">Rien de prévu sur 14 jours.</p>
            ) : (
              <ul className="divide-y divide-line">
                {upcoming.map((entry) => (
                  <li key={entry.id}>
                    <Link
                      href={entry.url ?? '/espace-admin/calendrier'}
                      className="-mx-2 flex items-start gap-2.5 rounded-md px-2 py-2.5 transition-colors hover:bg-surface-hover"
                    >
                      <span
                        className={cn(
                          'mt-1.5 size-1.5 shrink-0 rounded-full',
                          entry.overdue ? 'bg-danger' : 'bg-accent',
                        )}
                        aria-hidden
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[0.8125rem] text-fg">{entry.title}</span>
                        <span className="block text-[0.625rem] text-fg-subtle">
                          {formatRelative(entry.startsAt, 'fr')}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link
              href="/espace-admin/calendrier"
              className="mt-3 inline-flex items-center gap-1 text-[0.75rem] font-semibold text-accent hover:underline"
            >
              Calendrier complet
              <ArrowRight className="size-3 rtl:-scale-x-100" />
            </Link>
          </CardBody>
        </Card>
      </section>

      {/* Secondary panels */}
      <section className="grid gap-4 lg:grid-cols-3">
        {newRequests.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Inbox className="size-4 text-accent" />
                Demandes non lues
              </CardTitle>
              <Badge tone="brand">{stats.engagement.newSubmissions}</Badge>
            </CardHeader>
            <CardBody className="pt-3">
              <ul className="divide-y divide-line">
                {newRequests.map((submission) => (
                  <li key={submission.id}>
                    <Link
                      href={`/espace-admin/demandes/${submission.id}`}
                      className="-mx-2 block rounded-md px-2 py-2.5 transition-colors hover:bg-surface-hover"
                    >
                      <span className="block truncate text-[0.8125rem] font-medium text-fg">{submission.name}</span>
                      <span className="block truncate text-[0.6875rem] text-fg-subtle">
                        {[submission.company, submission.service, submission.budget].filter(Boolean).join(' · ') ||
                          submission.email}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}

        {newFeedback.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-4 text-success" />
                Nouveaux retours
              </CardTitle>
            </CardHeader>
            <CardBody className="pt-3">
              <ul className="divide-y divide-line">
                {newFeedback.map((item) => (
                  <li key={item.id}>
                    <Link
                      href={`/espace-admin/projets/${item.project_id}`}
                      className="-mx-2 block rounded-md px-2 py-2.5 transition-colors hover:bg-surface-hover"
                    >
                      <span className="flex items-center gap-2">
                        <Badge tone={item.decision === 'approved' ? 'success' : 'warning'}>
                          {item.decision === 'approved' ? 'Validé' : 'Modifications'}
                        </Badge>
                        <span className="truncate text-[0.6875rem] text-fg-subtle">{item.author_label ?? '—'}</span>
                      </span>
                      {item.comment && (
                        <span className="mt-1 block line-clamp-2 text-[0.75rem] leading-relaxed text-fg-muted">
                          {item.comment}
                        </span>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        )}

        {renewals.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Banknote className="size-4 text-fg-subtle" />
                Renouvellements
              </CardTitle>
            </CardHeader>
            <CardBody className="pt-3 space-y-3">
              {renewals.slice(0, 5).map((sub) => (
                <Meter
                  key={sub.id}
                  label={sub.service_name}
                  valueLabel={`${sub.days_until <= 0 ? 'échu' : `${sub.days_until} j`} · ${formatMoney(sub.amount, sub.currency)}`}
                  value={Math.max(0, 14 - sub.days_until)}
                  max={14}
                  thresholds={{ warning: 0.65, danger: 0.9 }}
                />
              ))}
              <Link
                href="/espace-admin/abonnements"
                className="inline-flex items-center gap-1 text-[0.75rem] font-semibold text-accent hover:underline"
              >
                Tous les abonnements
                <ArrowRight className="size-3 rtl:-scale-x-100" />
              </Link>
            </CardBody>
          </Card>
        )}

        {topClients.length > 0 && (
          <Card className={cn(newRequests.length === 0 && newFeedback.length === 0 && 'lg:col-span-2')}>
            <CardBody>
              <HBarChart
                title="Meilleurs clients"
                subtitle="Chiffre d’affaires encaissé"
                items={topClients.map((client, index) => ({
                  label: client.name,
                  value: client.revenue,
                  slot: index,
                }))}
                format={{ style: 'money', currency }}
              />
            </CardBody>
          </Card>
        )}
      </section>
    </div>
  );
}
