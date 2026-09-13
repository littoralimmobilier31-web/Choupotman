import { createHash } from 'node:crypto';
import { all, run, scalar } from '../client';
import { money } from '@/lib/money';
import { ACTIVE_STATUSES } from './projects';
import { UNPAID_STATUSES } from './finance';
import { monthlyRecurringCost } from './expenses';
import { config } from '@/lib/config';

/**
 * Reporting.
 *
 * Aggregates are computed in SQL and rounded once, so the dashboard renders from
 * a handful of queries. Page views are first-party: no third-party tracker, and
 * the visitor key is a daily-rotating salted hash, which is enough to count
 * unique visits without storing anything that identifies a person.
 */

export type Period = 'week' | 'month' | 'quarter' | 'year' | 'all';

export const PERIODS: { key: Period; label: string; days: number }[] = [
  { key: 'week', label: 'Semaine', days: 7 },
  { key: 'month', label: 'Mois', days: 30 },
  { key: 'quarter', label: 'Trimestre', days: 90 },
  { key: 'year', label: 'Année', days: 365 },
  { key: 'all', label: 'Tout', days: 36500 },
];

export function periodDays(period: Period): number {
  return PERIODS.find((p) => p.key === period)?.days ?? 30;
}

export type DateRange = { from: string; to: string };

export function rangeFor(period: Period): DateRange {
  const days = periodDays(period);
  return {
    from: new Date(Date.now() - days * 86400000).toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
  };
}

/** The equivalent window immediately before `range`, for period-over-period deltas. */
export function previousRange(range: DateRange): DateRange {
  const from = new Date(range.from);
  const to = new Date(range.to);
  const span = Math.max(1, Math.round((to.getTime() - from.getTime()) / 86400000));
  return {
    from: new Date(from.getTime() - span * 86400000).toISOString().slice(0, 10),
    to: new Date(from.getTime() - 86400000).toISOString().slice(0, 10),
  };
}

/** Percentage change; null when there is no baseline to compare against. */
export function delta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

// ── Dashboard ────────────────────────────────────────────────────────────

export type DashboardStats = {
  projects: { total: number; active: number; completed: number; overdue: number; prospects: number };
  clients: { total: number; active: number; newInPeriod: number };
  finance: {
    revenue: number;
    revenuePrevious: number;
    invoiced: number;
    outstanding: number;
    overdueAmount: number;
    overdueCount: number;
    expenses: number;
    expensesPrevious: number;
    profit: number;
    monthlyRecurring: number;
    averageInvoice: number;
  };
  tasks: { total: number; open: number; dueSoon: number; overdue: number; done: number };
  pipeline: { leads: number; open: number; potentialValue: number; conversionRate: number };
  engagement: {
    messages: number;
    unreadNotifications: number;
    newSubmissions: number;
    openFeedback: number;
    openRevisions: number;
  };
  traffic: { views: number; viewsPrevious: number; visitors: number; conversions: number; conversionRate: number };
  currency: string;
};

export function getDashboardStats(period: Period = 'month'): DashboardStats {
  const range = rangeFor(period);
  const prev = previousRange(range);
  const activePlaceholders = ACTIVE_STATUSES.map(() => '?').join(',');
  const unpaidPlaceholders = UNPAID_STATUSES.map(() => '?').join(',');

  const revenue = money(scalar<number>(
    `SELECT COALESCE(SUM(amount), 0) AS s FROM payments
     WHERE status = 'confirmed' AND paid_at BETWEEN ? AND ?`,
    [range.from, range.to], 0,
  ));
  const revenuePrevious = money(scalar<number>(
    `SELECT COALESCE(SUM(amount), 0) AS s FROM payments
     WHERE status = 'confirmed' AND paid_at BETWEEN ? AND ?`,
    [prev.from, prev.to], 0,
  ));
  const expenses = money(scalar<number>(
    'SELECT COALESCE(SUM(amount), 0) AS s FROM expenses WHERE spent_at BETWEEN ? AND ?',
    [range.from, range.to], 0,
  ));
  const expensesPrevious = money(scalar<number>(
    'SELECT COALESCE(SUM(amount), 0) AS s FROM expenses WHERE spent_at BETWEEN ? AND ?',
    [prev.from, prev.to], 0,
  ));
  const invoiced = money(scalar<number>(
    `SELECT COALESCE(SUM(total), 0) AS s FROM invoices
     WHERE status NOT IN ('draft','cancelled') AND issue_date BETWEEN ? AND ?`,
    [range.from, range.to], 0,
  ));
  const invoiceCount = scalar<number>(
    `SELECT COUNT(*) AS c FROM invoices
     WHERE status NOT IN ('draft','cancelled') AND issue_date BETWEEN ? AND ?`,
    [range.from, range.to], 0,
  );

  const views = scalar<number>(
    'SELECT COUNT(*) AS c FROM page_views WHERE date(created_at) BETWEEN ? AND ?',
    [range.from, range.to], 0,
  );
  const viewsPrevious = scalar<number>(
    'SELECT COUNT(*) AS c FROM page_views WHERE date(created_at) BETWEEN ? AND ?',
    [prev.from, prev.to], 0,
  );
  const visitors = scalar<number>(
    'SELECT COUNT(DISTINCT visitor_key) AS c FROM page_views WHERE date(created_at) BETWEEN ? AND ?',
    [range.from, range.to], 0,
  );
  const conversions = scalar<number>(
    'SELECT COUNT(*) AS c FROM conversions WHERE date(created_at) BETWEEN ? AND ?',
    [range.from, range.to], 0,
  );

  const leadTotals = all<{ stage: string; c: number; v: number }>(
    'SELECT stage, COUNT(*) AS c, COALESCE(SUM(estimated_value), 0) AS v FROM leads GROUP BY stage',
  );
  const leadBy = (stage: string) => leadTotals.find((r) => r.stage === stage) ?? { stage, c: 0, v: 0 };
  const openLeadStages = ['new', 'contacted', 'qualified', 'proposal', 'negotiation'];
  const openLeads = openLeadStages.reduce((acc, s) => acc + leadBy(s).c, 0);
  const won = leadBy('won').c;
  const lost = leadBy('lost').c;

  return {
    projects: {
      total: scalar<number>("SELECT COUNT(*) AS c FROM projects WHERE status != 'archived'", [], 0),
      active: scalar<number>(
        `SELECT COUNT(*) AS c FROM projects WHERE status IN (${activePlaceholders})`,
        [...ACTIVE_STATUSES], 0,
      ),
      completed: scalar<number>("SELECT COUNT(*) AS c FROM projects WHERE status = 'completed'", [], 0),
      overdue: scalar<number>(
        `SELECT COUNT(*) AS c FROM projects
         WHERE delivery_date IS NOT NULL AND delivery_date < date('now')
           AND status NOT IN ('completed','archived')`,
        [], 0,
      ),
      prospects: scalar<number>("SELECT COUNT(*) AS c FROM projects WHERE status = 'prospect'", [], 0),
    },
    clients: {
      total: scalar<number>('SELECT COUNT(*) AS c FROM clients', [], 0),
      active: scalar<number>("SELECT COUNT(*) AS c FROM clients WHERE status = 'active'", [], 0),
      newInPeriod: scalar<number>(
        'SELECT COUNT(*) AS c FROM clients WHERE date(created_at) BETWEEN ? AND ?',
        [range.from, range.to], 0,
      ),
    },
    finance: {
      revenue,
      revenuePrevious,
      invoiced,
      outstanding: money(scalar<number>(
        `SELECT COALESCE(SUM(balance_due), 0) AS s FROM invoices WHERE status IN (${unpaidPlaceholders})`,
        [...UNPAID_STATUSES], 0,
      )),
      overdueAmount: money(scalar<number>(
        "SELECT COALESCE(SUM(balance_due), 0) AS s FROM invoices WHERE status = 'overdue'", [], 0,
      )),
      overdueCount: scalar<number>("SELECT COUNT(*) AS c FROM invoices WHERE status = 'overdue'", [], 0),
      expenses,
      expensesPrevious,
      profit: money(revenue - expenses),
      monthlyRecurring: monthlyRecurringCost(),
      averageInvoice: invoiceCount ? money(invoiced / invoiceCount) : 0,
    },
    tasks: {
      total: scalar<number>('SELECT COUNT(*) AS c FROM tasks', [], 0),
      open: scalar<number>("SELECT COUNT(*) AS c FROM tasks WHERE status != 'done'", [], 0),
      dueSoon: scalar<number>(
        `SELECT COUNT(*) AS c FROM tasks
         WHERE status != 'done' AND due_date IS NOT NULL
           AND due_date BETWEEN date('now') AND date('now', '+3 days')`,
        [], 0,
      ),
      overdue: scalar<number>(
        `SELECT COUNT(*) AS c FROM tasks
         WHERE status != 'done' AND due_date IS NOT NULL AND due_date < date('now')`,
        [], 0,
      ),
      done: scalar<number>("SELECT COUNT(*) AS c FROM tasks WHERE status = 'done'", [], 0),
    },
    pipeline: {
      leads: leadTotals.reduce((acc, r) => acc + r.c, 0),
      open: openLeads,
      potentialValue: money(openLeadStages.reduce((acc, s) => acc + leadBy(s).v, 0)),
      conversionRate: won + lost > 0 ? Math.round((won / (won + lost)) * 100) : 0,
    },
    engagement: {
      messages: scalar<number>('SELECT COUNT(*) AS c FROM messages', [], 0),
      unreadNotifications: scalar<number>('SELECT COUNT(*) AS c FROM notifications WHERE read_at IS NULL', [], 0),
      newSubmissions: scalar<number>("SELECT COUNT(*) AS c FROM contact_submissions WHERE status = 'new'", [], 0),
      openFeedback: scalar<number>("SELECT COUNT(*) AS c FROM feedback WHERE status = 'new'", [], 0),
      openRevisions: scalar<number>(
        "SELECT COUNT(*) AS c FROM revisions WHERE status IN ('open','in_progress')", [], 0,
      ),
    },
    traffic: {
      views,
      viewsPrevious,
      visitors,
      conversions,
      conversionRate: visitors ? Math.round((conversions / visitors) * 1000) / 10 : 0,
    },
    currency: 'DZD',
  };
}

// ── Time series ──────────────────────────────────────────────────────────

export type SeriesPoint = { label: string; key: string; value: number };

/** Revenue vs expenses by month over the last `months` months. */
export function monthlyFinance(months = 12): { labels: string[]; revenue: number[]; expenses: number[]; profit: number[] } {
  const labels: string[] = [];
  const keys: string[] = [];
  const now = new Date();
  for (let i = months - 1; i >= 0; i -= 1) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    labels.push(d.toLocaleDateString('fr-FR', { month: 'short' }));
  }

  const revenueRows = all<{ k: string; s: number }>(
    `SELECT strftime('%Y-%m', paid_at) AS k, COALESCE(SUM(amount), 0) AS s
     FROM payments WHERE status = 'confirmed' GROUP BY k`,
  );
  const expenseRows = all<{ k: string; s: number }>(
    `SELECT strftime('%Y-%m', spent_at) AS k, COALESCE(SUM(amount), 0) AS s
     FROM expenses GROUP BY k`,
  );

  const revenue = keys.map((k) => money(revenueRows.find((r) => r.k === k)?.s ?? 0));
  const expenses = keys.map((k) => money(expenseRows.find((r) => r.k === k)?.s ?? 0));
  const profit = keys.map((_, i) => money((revenue[i] ?? 0) - (expenses[i] ?? 0)));

  return { labels, revenue, expenses, profit };
}

/** Daily page views over the last `days` days, zero-filled. */
export function dailyViews(days = 30): { labels: string[]; views: number[]; visitors: number[] } {
  const labels: string[] = [];
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * 86400000);
    keys.push(d.toISOString().slice(0, 10));
    labels.push(d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }));
  }
  const rows = all<{ k: string; c: number; v: number }>(
    `SELECT date(created_at) AS k, COUNT(*) AS c, COUNT(DISTINCT visitor_key) AS v
     FROM page_views WHERE date(created_at) >= ? GROUP BY k`,
    [keys[0]],
  );
  return {
    labels,
    views: keys.map((k) => rows.find((r) => r.k === k)?.c ?? 0),
    visitors: keys.map((k) => rows.find((r) => r.k === k)?.v ?? 0),
  };
}

/** Project counts per status — the donut on the dashboard. */
export function projectsByStatus(): { status: string; count: number }[] {
  return all<{ status: string; count: number }>(
    'SELECT status, COUNT(*) AS count FROM projects GROUP BY status',
  );
}

export function topClientsByRevenue(limit = 8): { id: number; name: string; revenue: number }[] {
  return all<{ id: number; name: string; revenue: number }>(
    `SELECT c.id, c.name, COALESCE(SUM(p.amount), 0) AS revenue
     FROM clients c
     LEFT JOIN payments p ON p.client_id = c.id AND p.status = 'confirmed'
     GROUP BY c.id HAVING revenue > 0
     ORDER BY revenue DESC LIMIT ?`,
    [limit],
  ).map((r) => ({ ...r, revenue: money(r.revenue) }));
}

export function topPages(limit = 10, days = 30): { path: string; views: number }[] {
  return all<{ path: string; views: number }>(
    `SELECT path, COUNT(*) AS views FROM page_views
     WHERE created_at > datetime('now', ?) GROUP BY path ORDER BY views DESC LIMIT ?`,
    [`-${days} days`, limit],
  );
}

export function topPortfolioProjects(limit = 6): { id: number; title: string; view_count: number; slug: string }[] {
  return all<{ id: number; title: string; view_count: number; slug: string }>(
    `SELECT id, title, view_count, slug FROM portfolio_projects
     WHERE status = 'published' ORDER BY view_count DESC LIMIT ?`,
    [limit],
  );
}

/**
 * Operational averages that say how the business actually runs: how long a
 * project takes, how many revisions it absorbs, how fast invoices get paid.
 */
export type OperationalMetrics = {
  averageProjectDays: number | null;
  averageRevisionsPerProject: number;
  averageDaysToPayment: number | null;
  onTimeDeliveryRate: number | null;
  averageProjectValue: number;
};

export function getOperationalMetrics(): OperationalMetrics {
  const projectDays = scalar<number | null>(
    `SELECT AVG(julianday(completed_at) - julianday(start_date)) AS a
     FROM projects WHERE status = 'completed' AND start_date IS NOT NULL AND completed_at IS NOT NULL`,
    [], null,
  );

  const completedCount = scalar<number>("SELECT COUNT(*) AS c FROM projects WHERE status = 'completed'", [], 0);
  const revisionCount = scalar<number>(
    `SELECT COUNT(*) AS c FROM revisions r
     JOIN projects p ON p.id = r.project_id WHERE p.status = 'completed'`,
    [], 0,
  );

  const daysToPayment = scalar<number | null>(
    `SELECT AVG(julianday(pay.paid_at) - julianday(i.issue_date)) AS a
     FROM payments pay JOIN invoices i ON i.id = pay.invoice_id
     WHERE pay.status = 'confirmed'`,
    [], null,
  );

  const onTime = scalar<number>(
    `SELECT COUNT(*) AS c FROM projects
     WHERE status = 'completed' AND delivery_date IS NOT NULL AND completed_at IS NOT NULL
       AND date(completed_at) <= delivery_date`,
    [], 0,
  );
  const withDeadline = scalar<number>(
    `SELECT COUNT(*) AS c FROM projects
     WHERE status = 'completed' AND delivery_date IS NOT NULL AND completed_at IS NOT NULL`,
    [], 0,
  );

  const avgValue = scalar<number>(
    `SELECT COALESCE(AVG(total), 0) AS a FROM invoices WHERE status NOT IN ('draft','cancelled')`,
    [], 0,
  );

  return {
    averageProjectDays: projectDays === null ? null : Math.round(projectDays),
    averageRevisionsPerProject: completedCount ? Math.round((revisionCount / completedCount) * 10) / 10 : 0,
    averageDaysToPayment: daysToPayment === null ? null : Math.round(daysToPayment),
    onTimeDeliveryRate: withDeadline ? Math.round((onTime / withDeadline) * 100) : null,
    averageProjectValue: money(avgValue),
  };
}

// ── First-party traffic tracking ─────────────────────────────────────────

/**
 * Daily-rotating pseudonymous visitor key.
 *
 * Salted with the session secret and the current date, so the same visitor gets
 * a different key tomorrow: enough to count unique visits per day, useless as a
 * long-term identifier and impossible to reverse into an IP address.
 */
export function visitorKey(ip: string | null, userAgent: string | null): string {
  const day = new Date().toISOString().slice(0, 10);
  return createHash('sha256')
    .update(`${config.auth.secret}:${day}:${ip ?? 'unknown'}:${userAgent ?? 'unknown'}`)
    .digest('hex')
    .slice(0, 32);
}

export function recordPageView(input: {
  path: string;
  locale?: string | null;
  referrer?: string | null;
  visitorKey?: string | null;
  entityType?: string | null;
  entityId?: number | null;
}): void {
  run(
    `INSERT INTO page_views (path, locale, referrer, visitor_key, entity_type, entity_id)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.path.slice(0, 300), input.locale ?? null,
      input.referrer ? input.referrer.slice(0, 300) : null,
      input.visitorKey ?? null, input.entityType ?? null, input.entityId ?? null,
    ],
  );
}

export function recordConversion(input: {
  kind: string;
  entityType?: string | null;
  entityId?: number | null;
  value?: number;
  currency?: string;
  visitorKey?: string | null;
}): void {
  run(
    `INSERT INTO conversions (kind, entity_type, entity_id, value, currency, visitor_key)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      input.kind, input.entityType ?? null, input.entityId ?? null,
      money(input.value ?? 0), input.currency ?? 'DZD', input.visitorKey ?? null,
    ],
  );
}

export function conversionsByKind(days = 30): { kind: string; count: number; value: number }[] {
  return all<{ kind: string; count: number; value: number }>(
    `SELECT kind, COUNT(*) AS count, COALESCE(SUM(value), 0) AS value
     FROM conversions WHERE created_at > datetime('now', ?)
     GROUP BY kind ORDER BY count DESC`,
    [`-${days} days`],
  ).map((r) => ({ ...r, value: money(r.value) }));
}

/** Retention: raw view rows are only needed for recent reporting. */
export function prunePageViews(olderThanDays = 400): number {
  return run(`DELETE FROM page_views WHERE created_at < datetime('now', ?)`, [`-${olderThanDays} days`]).changes;
}
