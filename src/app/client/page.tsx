import Link from 'next/link';
import { AlertTriangle, ArrowRight, FolderKanban, Receipt } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { Progress } from '@/components/ui/misc';
import { StatTile } from '@/components/charts';
import { requireClientUser } from '@/lib/auth/guard';
import {
  portalClient, portalDisplayName, portalInvoices, portalProjects, portalSummary,
} from '@/lib/db/portal';
import { projectStatusLabel } from '@/lib/db/repositories/projects';
import { formatMoney, formatShortDate } from '@/lib/i18n/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Accueil' };

const STATUS_TONES: Record<string, 'info' | 'brand' | 'warning' | 'success' | 'outline'> = {
  planning: 'info', in_progress: 'brand', in_review: 'warning',
  awaiting_client: 'warning', completed: 'success', archived: 'outline',
};

export default async function ClientHomePage() {
  const clientUser = await requireClientUser();
  const clientId = clientUser.client_id;

  const client = portalClient(clientId);
  const projects = portalProjects(clientId);
  const invoices = portalInvoices(clientId);
  const summary = portalSummary(clientId);
  const today = new Date().toISOString().slice(0, 10);

  const active = projects.filter((p) => !['completed', 'archived'].includes(p.status));
  const unpaid = invoices.filter((i) => i.balance_due > 0 && i.status !== 'cancelled');

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[1.375rem] font-semibold tracking-tight text-fg sm:text-[1.625rem]">
          Bonjour {portalDisplayName(clientUser, client).split(' ')[0]}
        </h1>
        <p className="mt-1.5 text-[0.8125rem] text-fg-muted">
          Voici où en sont vos projets et vos documents.
        </p>
      </header>

      {summary.awaitingClient > 0 && (
        <p className="mb-5 flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-[0.8125rem] leading-relaxed text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>
            {summary.awaitingClient === 1 ? 'Un projet attend' : `${summary.awaitingClient} projets attendent`} votre
            retour pour avancer.
          </span>
        </p>
      )}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Projets en cours" value={summary.activeProjects} />
        <StatTile label="Projets livrés" value={summary.completedProjects} />
        <StatTile
          label="Solde à régler"
          value={formatMoney(summary.outstanding, summary.currency)}
          tone={summary.outstanding > 0 ? 'warning' : 'default'}
        />
        <StatTile
          label="Factures échues"
          value={summary.overdueCount}
          tone={summary.overdueCount > 0 ? 'danger' : 'default'}
        />
      </div>

      {/* ── Projects ───────────────────────────────────────────────────── */}
      <section className="mb-8">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 className="text-[0.9375rem] font-semibold text-fg">Vos projets</h2>
          {projects.length > active.length && (
            <Link href="/client/projets" className="text-[0.75rem] font-medium text-accent hover:underline">
              Tout voir ({projects.length})
            </Link>
          )}
        </div>

        {active.length === 0 ? (
          <Card>
            <CardBody className="py-10 text-center">
              <FolderKanban className="mx-auto mb-3 size-6 text-fg-subtle" />
              <p className="text-[0.875rem] font-medium text-fg">Aucun projet en cours</p>
              <p className="mt-1.5 text-[0.8125rem] text-fg-muted">
                Vos projets terminés restent consultables dans l’onglet Projets.
              </p>
            </CardBody>
          </Card>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {active.slice(0, 4).map((project) => {
              const late =
                project.delivery_date !== null &&
                project.delivery_date < today &&
                project.status !== 'completed';
              return (
                <li key={project.id}>
                  <Link
                    href={`/client/projets/${project.id}`}
                    className="group block rounded-[var(--radius-card)] border border-line bg-surface-raised p-4 transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-soft"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="min-w-0 flex-1 truncate text-[0.875rem] font-semibold text-fg group-hover:text-accent">
                        {project.title}
                      </p>
                      <Badge tone={STATUS_TONES[project.status] ?? 'neutral'}>
                        {projectStatusLabel(project.status)}
                      </Badge>
                    </div>

                    <div className="mt-3 flex items-center gap-2">
                      <Progress
                        className="flex-1"
                        value={project.progress}
                        tone={project.progress >= 80 ? 'success' : 'accent'}
                      />
                      <span className="shrink-0 text-[0.6875rem] tabular-nums text-fg-muted">
                        {project.progress} %
                      </span>
                    </div>

                    <p className="mt-2 text-[0.6875rem] text-fg-subtle">
                      {project.delivery_date ? (
                        <span className={late ? 'font-semibold text-warning' : undefined}>
                          Livraison prévue le {formatShortDate(project.delivery_date, 'fr')}
                        </span>
                      ) : (
                        'Date de livraison à confirmer'
                      )}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Invoices ───────────────────────────────────────────────────── */}
      {unpaid.length > 0 && (
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 className="text-[0.9375rem] font-semibold text-fg">Factures à régler</h2>
            <Link href="/client/factures" className="text-[0.75rem] font-medium text-accent hover:underline">
              Toutes les factures
            </Link>
          </div>

          <ul className="space-y-2">
            {unpaid.slice(0, 5).map((invoice) => {
              const overdue = invoice.due_date !== null && invoice.due_date < today;
              return (
                <li key={invoice.id}>
                  <Link
                    href={`/client/factures`}
                    className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-raised px-3.5 py-3 transition-colors hover:border-line-strong"
                  >
                    <Receipt className={overdue ? 'size-4 shrink-0 text-danger' : 'size-4 shrink-0 text-fg-subtle'} />
                    <div className="min-w-0 flex-1">
                      <p className="font-mono text-[0.8125rem] font-medium text-fg">{invoice.number}</p>
                      <p className="text-[0.6875rem] text-fg-subtle">
                        {invoice.project_title ?? invoice.title ?? '—'}
                        {invoice.due_date && ` · échéance ${formatShortDate(invoice.due_date, 'fr')}`}
                      </p>
                    </div>
                    <span
                      className={
                        overdue
                          ? 'shrink-0 text-[0.875rem] font-semibold tabular-nums text-danger'
                          : 'shrink-0 text-[0.875rem] font-semibold tabular-nums text-fg'
                      }
                    >
                      {formatMoney(invoice.balance_due, invoice.currency)}
                    </span>
                    <ArrowRight className="size-3.5 shrink-0 text-fg-subtle rtl:-scale-x-100" />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}
