import { all, one, run, scalar } from '../client';
import type { ExpenseCategory, ExpenseRow, SubscriptionRow } from '../types';
import { indexEntity, removeFromIndex } from './search';
import { money, monthlyEquivalent } from '@/lib/money';

/** Expenses and professional subscriptions. */

export const EXPENSE_CATEGORIES: { key: ExpenseCategory; label: string; slot: number }[] = [
  { key: 'software', label: 'Logiciels', slot: 0 },
  { key: 'hosting', label: 'Hébergement', slot: 1 },
  { key: 'advertising', label: 'Publicité', slot: 2 },
  { key: 'hardware', label: 'Matériel', slot: 3 },
  { key: 'transport', label: 'Transport', slot: 4 },
  { key: 'training', label: 'Formation', slot: 5 },
  { key: 'subcontracting', label: 'Sous-traitance', slot: 0 },
  { key: 'other', label: 'Autres', slot: 1 },
];

export const SUBSCRIPTION_CATEGORIES: { key: SubscriptionRow['category']; label: string }[] = [
  { key: 'software', label: 'Logiciels' },
  { key: 'hosting', label: 'Hébergement' },
  { key: 'ai', label: 'IA' },
  { key: 'saas', label: 'SaaS' },
  { key: 'marketing', label: 'Outils marketing' },
  { key: 'other', label: 'Autres' },
];

export const FREQUENCIES: { key: SubscriptionRow['frequency']; label: string }[] = [
  { key: 'monthly', label: 'Mensuel' },
  { key: 'quarterly', label: 'Trimestriel' },
  { key: 'yearly', label: 'Annuel' },
  { key: 'one_time', label: 'Paiement unique' },
];

export function expenseCategoryLabel(category: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.key === category)?.label ?? category;
}

export function frequencyLabel(frequency: string): string {
  return FREQUENCIES.find((f) => f.key === frequency)?.label ?? frequency;
}

// ── Expenses ─────────────────────────────────────────────────────────────

export type ExpenseWithMeta = ExpenseRow & { project_title: string | null; receipt_name: string | null };

export function findExpense(id: number): ExpenseWithMeta | null {
  return one<ExpenseWithMeta>(
    `SELECT e.*, p.title AS project_title, f.original_name AS receipt_name
     FROM expenses e
     LEFT JOIN projects p ON p.id = e.project_id
     LEFT JOIN files f ON f.id = e.receipt_file_id
     WHERE e.id = ?`,
    [id],
  );
}

export type ExpenseFilter = {
  category?: ExpenseCategory | 'all';
  projectId?: number;
  from?: string;
  to?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

export function listExpenses(filter: ExpenseFilter = {}): ExpenseWithMeta[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.category && filter.category !== 'all') { where.push('e.category = ?'); params.push(filter.category); }
  if (filter.projectId) { where.push('e.project_id = ?'); params.push(filter.projectId); }
  if (filter.from) { where.push('e.spent_at >= ?'); params.push(filter.from); }
  if (filter.to) { where.push('e.spent_at <= ?'); params.push(filter.to); }
  if (filter.search) {
    where.push('(e.label LIKE ? OR e.supplier LIKE ? OR e.notes LIKE ?)');
    const like = `%${filter.search}%`;
    params.push(like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(filter.limit ?? 200, filter.offset ?? 0);
  return all<ExpenseWithMeta>(
    `SELECT e.*, p.title AS project_title, f.original_name AS receipt_name
     FROM expenses e
     LEFT JOIN projects p ON p.id = e.project_id
     LEFT JOIN files f ON f.id = e.receipt_file_id
     ${clause} ORDER BY e.spent_at DESC, e.id DESC LIMIT ? OFFSET ?`,
    params,
  );
}

export function createExpense(input: {
  label: string;
  category?: ExpenseCategory;
  amount: number;
  currency?: string;
  spentAt?: string;
  supplier?: string | null;
  projectId?: number | null;
  receiptFileId?: number | null;
  isRecurring?: boolean;
  notes?: string | null;
  isDemo?: boolean;
  createdBy?: number | null;
}): number {
  const result = run(
    `INSERT INTO expenses
      (label, category, amount, currency, spent_at, supplier, project_id, receipt_file_id,
       is_recurring, notes, is_demo, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.label, input.category ?? 'other', money(input.amount), input.currency ?? 'DZD',
      input.spentAt ?? new Date().toISOString().slice(0, 10), input.supplier ?? null,
      input.projectId ?? null, input.receiptFileId ?? null, input.isRecurring ? 1 : 0,
      input.notes ?? null, input.isDemo ? 1 : 0, input.createdBy ?? null,
    ],
  );
  const id = Number(result.lastInsertRowid);
  indexEntity({
    type: 'expense', id, title: input.label,
    subtitle: expenseCategoryLabel(input.category ?? 'other'), body: input.notes,
    url: `/espace-admin/depenses?depense=${id}`,
  });
  return id;
}

export function updateExpense(
  id: number,
  patch: {
    label?: string; category?: ExpenseCategory; amount?: number; currency?: string;
    spent_at?: string; supplier?: string | null; project_id?: number | null;
    receipt_file_id?: number | null; notes?: string | null; is_recurring?: boolean;
  },
): void {
  const map: Record<string, unknown> = {
    label: patch.label, category: patch.category,
    amount: patch.amount === undefined ? undefined : money(patch.amount),
    currency: patch.currency, spent_at: patch.spent_at, supplier: patch.supplier,
    project_id: patch.project_id, receipt_file_id: patch.receipt_file_id, notes: patch.notes,
  };
  if (patch.is_recurring !== undefined) map.is_recurring = patch.is_recurring ? 1 : 0;
  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(value);
  }
  if (fields.length === 0) return;
  params.push(id);
  run(`UPDATE expenses SET ${fields.join(', ')} WHERE id = ?`, params);
}

export function deleteExpense(id: number): void {
  run('DELETE FROM expenses WHERE id = ?', [id]);
  removeFromIndex('expense', id);
}

export function totalExpenses(range: { from?: string; to?: string } = {}): number {
  const where: string[] = [];
  const params: unknown[] = [];
  if (range.from) { where.push('spent_at >= ?'); params.push(range.from); }
  if (range.to) { where.push('spent_at <= ?'); params.push(range.to); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return money(scalar<number>(`SELECT COALESCE(SUM(amount), 0) AS s FROM expenses ${clause}`, params, 0));
}

export function expensesByCategory(range: { from?: string; to?: string } = {}): { category: ExpenseCategory; label: string; total: number; count: number; slot: number }[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (range.from) { where.push('spent_at >= ?'); params.push(range.from); }
  if (range.to) { where.push('spent_at <= ?'); params.push(range.to); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return all<{ category: ExpenseCategory; total: number; count: number }>(
    `SELECT category, COALESCE(SUM(amount), 0) AS total, COUNT(*) AS count
     FROM expenses ${clause} GROUP BY category ORDER BY total DESC`,
    params,
  ).map((row) => ({
    ...row,
    total: money(row.total),
    label: expenseCategoryLabel(row.category),
    slot: EXPENSE_CATEGORIES.find((c) => c.key === row.category)?.slot ?? 0,
  }));
}

// ── Subscriptions ────────────────────────────────────────────────────────

export function findSubscription(id: number): SubscriptionRow | null {
  return one<SubscriptionRow>('SELECT * FROM subscriptions WHERE id = ?', [id]);
}

export function listSubscriptions(filter: { status?: SubscriptionRow['status'] | 'all'; category?: string; limit?: number } = {}): SubscriptionRow[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status && filter.status !== 'all') { where.push('status = ?'); params.push(filter.status); }
  else if (!filter.status) where.push("status != 'cancelled'");
  if (filter.category) { where.push('category = ?'); params.push(filter.category); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(filter.limit ?? 200);
  return all<SubscriptionRow>(
    `SELECT * FROM subscriptions ${clause}
     ORDER BY renewal_date IS NULL, renewal_date, service_name LIMIT ?`,
    params,
  );
}

export function createSubscription(input: {
  serviceName: string;
  category?: SubscriptionRow['category'];
  amount: number;
  currency?: string;
  frequency?: SubscriptionRow['frequency'];
  renewalDate?: string | null;
  autoRenew?: boolean;
  url?: string | null;
  notes?: string | null;
  isDemo?: boolean;
}): number {
  const result = run(
    `INSERT INTO subscriptions
      (service_name, category, amount, currency, frequency, renewal_date, auto_renew, url, notes, is_demo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.serviceName, input.category ?? 'software', money(input.amount),
      input.currency ?? 'DZD', input.frequency ?? 'monthly', input.renewalDate ?? null,
      input.autoRenew === false ? 0 : 1, input.url ?? null, input.notes ?? null,
      input.isDemo ? 1 : 0,
    ],
  );
  const id = Number(result.lastInsertRowid);
  indexEntity({
    type: 'subscription', id, title: input.serviceName,
    subtitle: frequencyLabel(input.frequency ?? 'monthly'), body: input.notes,
    url: `/espace-admin/abonnements?abonnement=${id}`,
  });
  return id;
}

export function updateSubscription(
  id: number,
  patch: {
    service_name?: string; category?: SubscriptionRow['category']; amount?: number;
    currency?: string; frequency?: SubscriptionRow['frequency']; renewal_date?: string | null;
    status?: SubscriptionRow['status']; auto_renew?: boolean; url?: string | null; notes?: string | null;
  },
): void {
  const map: Record<string, unknown> = {
    service_name: patch.service_name, category: patch.category,
    amount: patch.amount === undefined ? undefined : money(patch.amount),
    currency: patch.currency, frequency: patch.frequency, renewal_date: patch.renewal_date,
    status: patch.status, url: patch.url, notes: patch.notes,
  };
  if (patch.auto_renew !== undefined) map.auto_renew = patch.auto_renew ? 1 : 0;
  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(value);
  }
  if (fields.length === 0) return;
  params.push(id);
  run(`UPDATE subscriptions SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params);
}

export function deleteSubscription(id: number): void {
  run('DELETE FROM subscriptions WHERE id = ?', [id]);
  removeFromIndex('subscription', id);
}

/** Subscriptions renewing within `days`, soonest first. */
export function upcomingRenewals(days = 30): (SubscriptionRow & { days_until: number })[] {
  return all<SubscriptionRow & { days_until: number }>(
    `SELECT *, CAST(julianday(renewal_date) - julianday('now') AS INTEGER) AS days_until
     FROM subscriptions
     WHERE status = 'active' AND renewal_date IS NOT NULL
       AND renewal_date <= date('now', ?)
     ORDER BY renewal_date`,
    [`+${Math.max(1, days)} days`],
  );
}

/** Total recurring cost per month, comparing cycles on a common basis. */
export function monthlyRecurringCost(): number {
  const subs = all<Pick<SubscriptionRow, 'amount' | 'frequency'>>(
    "SELECT amount, frequency FROM subscriptions WHERE status = 'active'",
  );
  return money(subs.reduce((acc, s) => acc + monthlyEquivalent(s.amount, s.frequency), 0));
}

/**
 * Rolls an auto-renewing subscription forward past today and records the charge
 * as an expense, so recurring spend shows up in the P&L without manual entry.
 */
export function rollRenewal(id: number): { rolled: boolean; expenseId?: number } {
  const sub = findSubscription(id);
  if (!sub || !sub.renewal_date || sub.status !== 'active' || sub.auto_renew !== 1) {
    return { rolled: false };
  }
  const today = new Date().toISOString().slice(0, 10);
  if (sub.renewal_date > today) return { rolled: false };

  const step =
    sub.frequency === 'yearly' ? '+1 year'
    : sub.frequency === 'quarterly' ? '+3 months'
    : sub.frequency === 'monthly' ? '+1 month'
    : null;
  if (!step) return { rolled: false };

  const expenseId = createExpense({
    label: `${sub.service_name} (renouvellement)`,
    category: sub.category === 'hosting' ? 'hosting' : sub.category === 'ai' ? 'software' : 'software',
    amount: sub.amount,
    currency: sub.currency,
    spentAt: sub.renewal_date,
    supplier: sub.service_name,
    isRecurring: true,
    notes: `Généré automatiquement depuis l’abonnement #${sub.id}.`,
  });

  // Advance repeatedly in case several cycles elapsed while nothing ran.
  run(
    `UPDATE subscriptions SET renewal_date = date(renewal_date, ?), updated_at = datetime('now')
     WHERE id = ?`,
    [step, id],
  );
  return { rolled: true, expenseId };
}
