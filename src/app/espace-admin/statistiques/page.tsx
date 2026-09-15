import Link from 'next/link';
import { Banknote, CreditCard, Eye, Percent, Target, TrendingUp } from 'lucide-react';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { buttonClass } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { PageHeader, MiniStat, Section } from '@/components/admin/page-kit';
import { StatTile, HeroFigure, LineChart, BarChart, DonutChart, HBarChart } from '@/components/charts';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import {
  PERIODS,
  conversionsByKind,
  dailyViews,
  delta,
  getDashboardStats,
  getOperationalMetrics,
  monthlyFinance,
  projectsByStatus,
  topClientsByRevenue,
  topPages,
  topPortfolioProjects,
  type Period,
} from '@/lib/db/repositories/analytics';
import { expensesByCategory } from '@/lib/db/repositories/expenses';
import { projectStatusLabel } from '@/lib/db/repositories/projects';
import { formatMoney, formatNumber } from '@/lib/i18n/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Statistiques' };

/** "+12 %" / "−4 %", or an em dash when there is nothing to compare against. */
function signed(value: number | null): string {
  if (value === null) return '—';
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${Math.abs(rounded)} %`;
}

/**
 * Statistics.
 *
 * Every figure here is computed from records the owner entered — payments,
 * expenses, invoices, page views collected first-party. Nothing is estimated or
 * benchmarked against an industry average, so a number that looks small is
 * genuinely small rather than a guess.
 *
 * When a source is empty the panel says so instead of drawing a flat line at
 * zero: an empty chart reads as "the business made nothing", which is a different
 * claim from "nothing has been recorded yet".
 */
export default async function StatisticsPage({
  searchParams,
}: {
  searchParams: Promise<{ periode?: string }>;
}) {
  const user = await requirePermission('analytics.view');
  const query = await searchParams;

  const period = (PERIODS.find((entry) => entry.key === query.periode)?.key ?? 'month') as Period;
  const stats = getDashboardStats(period);
  const ops = getOperationalMetrics();
  const finance = monthlyFinance(12);
  const views = dailyViews(30);
  const byStatus = projectsByStatus();
  const topClients = topClientsByRevenue(8);
  const pages = topPages(10, 30);
  const portfolio = topPortfolioProjects(6);
  const expenses = expensesByCategory();
  const conversions = conversionsByKind(30);

  const currency = stats.currency;
  const money = { style: 'money' as const, currency };

  const hasFinance = finance.revenue.some((value) => value > 0) || finance.expenses.some((value) => value > 0);
  const hasTraffic = views.views.some((value) => value > 0);

  return (
    <>
      <PageHeader
        title="Statistiques"
        description="Chiffre d’affaires encaissé, charges, marge, trafic du site et conversion. Tout est calculé depuis vos enregistrements — rien n’est estimé."
        actions={
          <nav className="flex flex-wrap items-center gap-1" aria-label="Période">
            {PERIODS.map((entry) => (
              <Link
                key={entry.key}
                href={`/espace-admin/statistiques?periode=${entry.key}`}
                className={buttonClass(entry.key === period ? 'secondary' : 'ghost', 'sm')}
              >
                {entry.label}
              </Link>
            ))}
          </nav>
        }
      />

      {/* Money first: it is the reason the rest exists. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <HeroFigure
          label="Encaissé sur la période"
          value={formatMoney(stats.finance.revenue, currency)}
          sub={[
            `Paiements confirmés uniquement — ${formatMoney(stats.finance.invoiced, currency)} facturé`,
            // The comparison only means something once a previous period exists.
            stats.finance.revenuePrevious > 0
              ? `${signed(delta(stats.finance.revenue, stats.finance.revenuePrevious))} vs période précédente`
              : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        />

        <div className="grid gap-3 sm:grid-cols-2 lg:col-span-2">
          <StatTile
            label="Charges"
            value={formatMoney(stats.finance.expenses, currency)}
            delta={delta(stats.finance.expenses, stats.finance.expensesPrevious)}
            upIsGood={false}
            icon={<CreditCard className="size-4" />}
            href="/espace-admin/depenses"
            slot={3}
          />
          <StatTile
            label="Résultat"
            value={formatMoney(stats.finance.profit, currency)}
            hint="encaissé moins charges"
            icon={<TrendingUp className="size-4" />}
            tone={stats.finance.profit < 0 ? 'danger' : 'default'}
            slot={1}
          />
          <StatTile
            label="Reste à encaisser"
            value={formatMoney(stats.finance.outstanding, currency)}
            hint={
              stats.finance.overdueCount > 0
                ? `dont ${formatMoney(stats.finance.overdueAmount, currency)} en retard`
                : 'aucune facture en retard'
            }
            icon={<Banknote className="size-4" />}
            href="/espace-admin/factures?statut=unpaid"
            tone={stats.finance.overdueAmount > 0 ? 'warning' : 'default'}
            slot={2}
          />
          <StatTile
            label="Abonnements / mois"
            value={formatMoney(stats.finance.monthlyRecurring, currency)}
            hint="coût récurrent équivalent"
            icon={<CreditCard className="size-4" />}
            href="/espace-admin/abonnements"
            slot={4}
          />
        </div>
      </div>

      <Section title="Revenus et charges sur douze mois" className="mt-8">
        {hasFinance ? (
          <Card>
            <CardBody>
              <BarChart
                labels={finance.labels}
                series={[
                  { key: 'revenue', label: 'Encaissé', slot: 1, values: finance.revenue },
                  { key: 'expenses', label: 'Charges', slot: 3, values: finance.expenses },
                ]}
                format={money}
                height={280}
              />
              <div className="mt-4 border-t border-line pt-4">
                <LineChart
                  labels={finance.labels}
                  series={[{ key: 'profit', label: 'Résultat mensuel', slot: 2, values: finance.profit, area: true }]}
                  format={money}
                  height={180}
                />
              </div>
            </CardBody>
          </Card>
        ) : (
          <EmptyState
            title="Aucun mouvement enregistré"
            description="Les courbes apparaîtront dès qu’un paiement ou une dépense sera enregistré. Un graphique vide serait trompeur : il ne dirait pas que l’activité est nulle, seulement que rien n’a encore été saisi."
          />
        )}
      </Section>

      <div className="mt-8 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Projets par statut</CardTitle>
            <CardDescription>Où en est la production.</CardDescription>
          </CardHeader>
          <CardBody>
            {byStatus.length === 0 ? (
              <p className="py-2 text-[0.8125rem] text-fg-muted">Aucun projet enregistré.</p>
            ) : (
              <DonutChart
                slices={byStatus.map((entry, index) => ({
                  key: entry.status,
                  label: projectStatusLabel(entry.status),
                  value: entry.count,
                  slot: index,
                }))}
                centerLabel="projets"
                format={{ style: 'integer' }}
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Charges par catégorie</CardTitle>
            <CardDescription>Où part l’argent, toutes périodes confondues.</CardDescription>
          </CardHeader>
          <CardBody>
            {expenses.length === 0 ? (
              <p className="py-2 text-[0.8125rem] text-fg-muted">Aucune charge enregistrée.</p>
            ) : (
              <HBarChart
                items={expenses.map((entry) => ({ label: entry.label, value: entry.total, slot: entry.slot }))}
                format={money}
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Clients par chiffre d’affaires</CardTitle>
            <CardDescription>Paiements confirmés, tous exercices.</CardDescription>
          </CardHeader>
          <CardBody>
            {topClients.length === 0 ? (
              <p className="py-2 text-[0.8125rem] text-fg-muted">Aucun paiement encaissé pour l’instant.</p>
            ) : (
              <HBarChart
                items={topClients.map((client) => ({ label: client.name, value: client.revenue }))}
                format={money}
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Commercial</CardTitle>
            <CardDescription>Ce que le pipeline contient, et ce qu’il transforme.</CardDescription>
          </CardHeader>
          <CardBody>
            <div className="grid grid-cols-2 gap-3">
              <MiniStat label="Prospects ouverts" value={stats.pipeline.open} />
              <MiniStat
                label="Valeur potentielle"
                value={formatMoney(stats.pipeline.potentialValue, currency)}
              />
              <MiniStat label="Taux de conversion" value={`${stats.pipeline.conversionRate} %`} />
              <MiniStat label="Demandes non lues" value={stats.engagement.newSubmissions} />
            </div>
          </CardBody>
        </Card>
      </div>

      <Section title="Fréquentation du site" description="Mesurée en interne, sans service tiers ni cookie publicitaire." className="mt-8">
        {hasTraffic ? (
          <div className="space-y-4">
            <Card>
              <CardBody>
                <LineChart
                  labels={views.labels}
                  series={[
                    { key: 'views', label: 'Pages vues', slot: 0, values: views.views, area: true },
                    { key: 'visitors', label: 'Visiteurs', slot: 2, values: views.visitors },
                  ]}
                  format={{ style: 'integer' }}
                  height={240}
                />
              </CardBody>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Pages les plus consultées</CardTitle>
                  <CardDescription>Sur les trente derniers jours.</CardDescription>
                </CardHeader>
                <CardBody>
                  <HBarChart
                    items={pages.map((page) => ({ label: page.path, value: page.views }))}
                    format={{ style: 'integer' }}
                  />
                </CardBody>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Projets du portfolio les plus vus</CardTitle>
                </CardHeader>
                <CardBody>
                  {portfolio.length === 0 ? (
                    <p className="py-2 text-[0.8125rem] text-fg-muted">Aucune réalisation publiée.</p>
                  ) : (
                    <ul className="space-y-1.5">
                      {portfolio.map((project) => (
                        <li key={project.id} className="flex items-center justify-between gap-3">
                          <Link
                            href={`/espace-admin/portfolio/${project.id}`}
                            className="min-w-0 flex-1 truncate text-[0.8125rem] text-fg transition-colors hover:text-accent"
                          >
                            {project.title}
                          </Link>
                          <span className="shrink-0 text-[0.75rem] tabular-nums text-fg-muted">
                            {formatNumber(project.view_count, 'fr')} vues
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            </div>
          </div>
        ) : (
          <EmptyState
            title="Aucune visite enregistrée"
            description="Le site compte ses pages vues lui-même, sans service externe. Les chiffres apparaîtront dès les premières visites, une fois le domaine en ligne."
          />
        )}
      </Section>

      <Section title="Conversion" description="Ce que la fréquentation produit concrètement." className="mt-8">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Pages vues"
            value={formatNumber(stats.traffic.views, 'fr')}
            delta={delta(stats.traffic.views, stats.traffic.viewsPrevious)}
            icon={<Eye className="size-4" />}
            slot={0}
          />
          <StatTile
            label="Visiteurs"
            value={formatNumber(stats.traffic.visitors, 'fr')}
            icon={<Eye className="size-4" />}
            slot={2}
          />
          <StatTile
            label="Demandes reçues"
            value={stats.traffic.conversions}
            icon={<Target className="size-4" />}
            href="/espace-admin/demandes"
            slot={1}
          />
          <StatTile
            label="Taux de conversion"
            value={`${stats.traffic.conversionRate} %`}
            hint="visiteurs ayant envoyé une demande"
            icon={<Percent className="size-4" />}
            slot={4}
          />
        </div>

        {conversions.length > 0 && (
          <Card className="mt-4">
            <CardBody>
              <HBarChart
                items={conversions.map((entry) => ({ label: entry.kind, value: entry.count }))}
                title="Par type de conversion"
                format={{ style: 'integer' }}
              />
            </CardBody>
          </Card>
        )}
      </Section>

      <Section
        title="Indicateurs d’exploitation"
        description="Calculés sur les projets terminés et les factures réglées. Un tiret signifie qu’il n’y a pas encore assez d’historique."
        className="mt-8"
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <MiniStat
            label="Durée moyenne d’un projet"
            value={ops.averageProjectDays !== null ? `${ops.averageProjectDays} j` : '—'}
          />
          <MiniStat
            label="Délai moyen de paiement"
            value={ops.averageDaysToPayment !== null ? `${ops.averageDaysToPayment} j` : '—'}
          />
          <MiniStat
            label="Livraisons dans les délais"
            value={ops.onTimeDeliveryRate !== null ? `${ops.onTimeDeliveryRate} %` : '—'}
          />
          <MiniStat label="Révisions par projet" value={ops.averageRevisionsPerProject} />
          <MiniStat
            label="Facture moyenne"
            value={ops.averageProjectValue > 0 ? formatMoney(ops.averageProjectValue, currency) : '—'}
          />
        </div>
      </Section>

      {can(user, 'analytics.export') && (
        <p className="mt-6 text-[0.75rem] text-fg-subtle">
          Ces chiffres proviennent de vos enregistrements : paiements confirmés, dépenses saisies, factures émises
          et visites comptées en interne. Aucune estimation, aucune donnée externe.
        </p>
      )}
    </>
  );
}
