import { all, one, run, scalar, transaction } from '../client';
import type {
  ContractRow, ContractTemplateRow, DiscountType, InvoiceItemRow, InvoiceRow,
  InvoiceStatus, PaymentMethod, PaymentRow, QuoteItemRow, QuoteRow, QuoteStatus,
} from '../types';
import { indexEntity, removeFromIndex } from './search';
import { nextReference } from './projects';
import { balanceDue, computeTotals, lineTotal, money } from '@/lib/money';
import { toJson } from '@/lib/utils';
import { getSettingNumber, getSetting } from './settings';

/**
 * Quotes, invoices, payments and contracts.
 *
 * Stored totals are authoritative: `recalcQuote` / `recalcInvoice` are the only
 * writers, and every mutation of a line item goes through them. That keeps a
 * historical document stable even after prices or the VAT rate change.
 */

export const QUOTE_STATUSES: { key: QuoteStatus; label: string; tone: string }[] = [
  { key: 'draft', label: 'Brouillon', tone: 'neutral' },
  { key: 'sent', label: 'Envoyé', tone: 'info' },
  { key: 'accepted', label: 'Accepté', tone: 'success' },
  { key: 'refused', label: 'Refusé', tone: 'danger' },
  { key: 'expired', label: 'Expiré', tone: 'warning' },
  { key: 'archived', label: 'Archivé', tone: 'outline' },
];

export const INVOICE_STATUSES: { key: InvoiceStatus; label: string; tone: string }[] = [
  { key: 'draft', label: 'Brouillon', tone: 'neutral' },
  { key: 'sent', label: 'Envoyée', tone: 'info' },
  { key: 'partially_paid', label: 'Partiellement payée', tone: 'warning' },
  { key: 'paid', label: 'Payée', tone: 'success' },
  { key: 'overdue', label: 'En retard', tone: 'danger' },
  { key: 'cancelled', label: 'Annulée', tone: 'outline' },
];

export const PAYMENT_METHODS: { key: PaymentMethod; label: string }[] = [
  { key: 'cash', label: 'Espèces' },
  { key: 'transfer', label: 'Virement' },
  { key: 'ccp', label: 'CCP' },
  { key: 'card', label: 'Carte' },
  { key: 'other', label: 'Autre' },
];

/** Statuses that represent real money owed, used consistently in every KPI. */
export const UNPAID_STATUSES: InvoiceStatus[] = ['sent', 'partially_paid', 'overdue'];

export function quoteStatusLabel(status: string): string {
  return QUOTE_STATUSES.find((s) => s.key === status)?.label ?? status;
}
export function invoiceStatusLabel(status: string): string {
  return INVOICE_STATUSES.find((s) => s.key === status)?.label ?? status;
}
export function paymentMethodLabel(method: string): string {
  return PAYMENT_METHODS.find((m) => m.key === method)?.label ?? method;
}

export function defaultTaxRate(): number {
  return getSettingNumber('finance.tax_rate', 0);
}
export function defaultCurrency(): string {
  return getSetting('finance.currency', 'DZD');
}

export type LineItemInput = {
  id?: number;
  service_id?: number | null;
  label: string;
  description?: string | null;
  quantity?: number;
  unit?: string;
  unit_price?: number;
  discount?: number;
};

// ── Quotes ───────────────────────────────────────────────────────────────

export type QuoteWithMeta = QuoteRow & {
  client_name: string | null;
  client_company: string | null;
  project_title: string | null;
  item_count: number;
};

const QUOTE_SELECT = `
  SELECT q.*, c.name AS client_name, c.company AS client_company, p.title AS project_title,
    (SELECT COUNT(*) FROM quote_items qi WHERE qi.quote_id = q.id) AS item_count
  FROM quotes q
  LEFT JOIN clients c ON c.id = q.client_id
  LEFT JOIN projects p ON p.id = q.project_id
`;

export function findQuote(id: number): QuoteWithMeta | null {
  return one<QuoteWithMeta>(`${QUOTE_SELECT} WHERE q.id = ?`, [id]);
}

export function findQuoteByNumber(number: string): QuoteWithMeta | null {
  return one<QuoteWithMeta>(`${QUOTE_SELECT} WHERE q.number = ?`, [number]);
}

export function listQuoteItems(quoteId: number): QuoteItemRow[] {
  return all<QuoteItemRow>('SELECT * FROM quote_items WHERE quote_id = ? ORDER BY position, id', [quoteId]);
}

export type QuoteFilter = {
  status?: QuoteStatus | 'all';
  clientId?: number;
  projectId?: number;
  search?: string;
  limit?: number;
  offset?: number;
};

export function listQuotes(filter: QuoteFilter = {}): QuoteWithMeta[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status && filter.status !== 'all') { where.push('q.status = ?'); params.push(filter.status); }
  if (filter.clientId) { where.push('q.client_id = ?'); params.push(filter.clientId); }
  if (filter.projectId) { where.push('q.project_id = ?'); params.push(filter.projectId); }
  if (filter.search) {
    where.push('(q.number LIKE ? OR q.title LIKE ? OR c.name LIKE ?)');
    const like = `%${filter.search}%`;
    params.push(like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(filter.limit ?? 100, filter.offset ?? 0);
  return all<QuoteWithMeta>(
    `${QUOTE_SELECT} ${clause} ORDER BY q.issue_date DESC, q.id DESC LIMIT ? OFFSET ?`,
    params,
  );
}

export function countQuotes(status?: QuoteStatus): number {
  return status
    ? scalar<number>('SELECT COUNT(*) AS c FROM quotes WHERE status = ?', [status], 0)
    : scalar<number>('SELECT COUNT(*) AS c FROM quotes', [], 0);
}

export type QuoteInput = {
  client_id?: number | null;
  project_id?: number | null;
  lead_id?: number | null;
  title?: string | null;
  status?: QuoteStatus;
  issue_date?: string;
  valid_until?: string | null;
  currency?: string;
  discount_type?: DiscountType;
  discount_value?: number;
  tax_rate?: number;
  delivery_terms?: string | null;
  payment_terms?: string | null;
  conditions?: string | null;
  notes?: string | null;
  locale?: string;
  is_demo?: boolean;
  created_by?: number | null;
  items?: LineItemInput[];
};

export function createQuote(input: QuoteInput): number {
  return transaction(() => {
    const number = nextReference('DEV', 'quotes', 'number');
    const result = run(
      `INSERT INTO quotes
        (number, client_id, project_id, lead_id, title, status, issue_date, valid_until,
         currency, discount_type, discount_value, tax_rate, delivery_terms, payment_terms,
         conditions, notes, locale, is_demo, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        number, input.client_id ?? null, input.project_id ?? null, input.lead_id ?? null,
        input.title ?? null, input.status ?? 'draft',
        input.issue_date ?? new Date().toISOString().slice(0, 10),
        input.valid_until ?? null, input.currency ?? defaultCurrency(),
        input.discount_type ?? 'none', money(input.discount_value ?? 0),
        input.tax_rate ?? defaultTaxRate(), input.delivery_terms ?? null,
        input.payment_terms ?? getSetting('finance.payment_terms', ''),
        input.conditions ?? getSetting('finance.quote_conditions', ''),
        input.notes ?? null, input.locale ?? 'fr', input.is_demo ? 1 : 0, input.created_by ?? null,
      ],
    );
    const id = Number(result.lastInsertRowid);
    if (input.items?.length) replaceQuoteItems(id, input.items);
    else recalcQuote(id);
    reindexQuote(id);
    return id;
  });
}

export function updateQuote(id: number, patch: Partial<QuoteInput>): void {
  const map: Record<string, unknown> = {
    client_id: patch.client_id, project_id: patch.project_id, lead_id: patch.lead_id,
    title: patch.title, status: patch.status, issue_date: patch.issue_date,
    valid_until: patch.valid_until, currency: patch.currency,
    discount_type: patch.discount_type,
    discount_value: patch.discount_value === undefined ? undefined : money(patch.discount_value),
    tax_rate: patch.tax_rate, delivery_terms: patch.delivery_terms,
    payment_terms: patch.payment_terms, conditions: patch.conditions, notes: patch.notes,
    locale: patch.locale,
  };
  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(value);
  }
  if (patch.status === 'sent') fields.push(`sent_at = COALESCE(sent_at, datetime('now'))`);
  if (patch.status === 'accepted') fields.push(`accepted_at = COALESCE(accepted_at, datetime('now'))`);

  if (fields.length > 0) {
    params.push(id);
    run(`UPDATE quotes SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params);
  }
  // `!== undefined` rather than truthiness: an explicitly empty array means
  // "remove every line", which is a legitimate edit.
  if (patch.items !== undefined) replaceQuoteItems(id, patch.items);
  else recalcQuote(id);
  reindexQuote(id);
}

export function replaceQuoteItems(quoteId: number, items: LineItemInput[]): void {
  transaction(() => {
    run('DELETE FROM quote_items WHERE quote_id = ?', [quoteId]);
    items.forEach((item, index) => {
      run(
        `INSERT INTO quote_items
          (quote_id, service_id, label, description, quantity, unit, unit_price, discount, line_total, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          quoteId, item.service_id ?? null, item.label, item.description ?? null,
          item.quantity ?? 1, item.unit ?? 'forfait', money(item.unit_price ?? 0),
          item.discount ?? 0, lineTotal(item), index,
        ],
      );
    });
    recalcQuote(quoteId);
  });
}

/** Single writer for a quote's stored totals. */
export function recalcQuote(quoteId: number): void {
  const quote = one<QuoteRow>('SELECT * FROM quotes WHERE id = ?', [quoteId]);
  if (!quote) return;
  const items = listQuoteItems(quoteId);
  const totals = computeTotals(items, {
    discountType: quote.discount_type,
    discountValue: quote.discount_value,
    taxRate: quote.tax_rate,
  });
  run(
    `UPDATE quotes SET subtotal = ?, discount_total = ?, tax_total = ?, total = ?,
       updated_at = datetime('now') WHERE id = ?`,
    [totals.subtotal, totals.discount_total, totals.tax_total, totals.total, quoteId],
  );
}

export function deleteQuote(id: number): void {
  run('DELETE FROM quotes WHERE id = ?', [id]);
  removeFromIndex('quote', id);
}

/** Duplicates a quote as a fresh draft with a new number. */
export function duplicateQuote(id: number, createdBy?: number | null): number | null {
  const quote = one<QuoteRow>('SELECT * FROM quotes WHERE id = ?', [id]);
  if (!quote) return null;
  const items = listQuoteItems(id);
  return createQuote({
    client_id: quote.client_id,
    project_id: quote.project_id,
    title: quote.title ? `${quote.title} (copie)` : null,
    currency: quote.currency,
    discount_type: quote.discount_type,
    discount_value: quote.discount_value,
    tax_rate: quote.tax_rate,
    delivery_terms: quote.delivery_terms,
    payment_terms: quote.payment_terms,
    conditions: quote.conditions,
    notes: quote.notes,
    locale: quote.locale,
    created_by: createdBy ?? null,
    items: items.map((i) => ({
      service_id: i.service_id, label: i.label, description: i.description,
      quantity: i.quantity, unit: i.unit, unit_price: i.unit_price, discount: i.discount,
    })),
  });
}

function reindexQuote(id: number): void {
  const quote = findQuote(id);
  if (!quote) return;
  indexEntity({
    type: 'quote',
    id,
    title: quote.number,
    subtitle: [quote.title, quote.client_name, quoteStatusLabel(quote.status)].filter(Boolean).join(' · '),
    body: quote.notes,
    url: `/espace-admin/devis/${id}`,
  });
}

// ── Invoices ─────────────────────────────────────────────────────────────

export type InvoiceWithMeta = InvoiceRow & {
  client_name: string | null;
  client_company: string | null;
  project_title: string | null;
  item_count: number;
  payment_count: number;
  days_overdue: number;
};

const INVOICE_SELECT = `
  SELECT i.*, c.name AS client_name, c.company AS client_company, p.title AS project_title,
    (SELECT COUNT(*) FROM invoice_items ii WHERE ii.invoice_id = i.id) AS item_count,
    (SELECT COUNT(*) FROM payments pay WHERE pay.invoice_id = i.id) AS payment_count,
    CASE
      WHEN i.due_date IS NOT NULL AND i.status IN ('sent','partially_paid','overdue')
        THEN CAST(julianday('now') - julianday(i.due_date) AS INTEGER)
      ELSE 0
    END AS days_overdue
  FROM invoices i
  LEFT JOIN clients c ON c.id = i.client_id
  LEFT JOIN projects p ON p.id = i.project_id
`;

export function findInvoice(id: number): InvoiceWithMeta | null {
  return one<InvoiceWithMeta>(`${INVOICE_SELECT} WHERE i.id = ?`, [id]);
}

export function findInvoiceByNumber(number: string): InvoiceWithMeta | null {
  return one<InvoiceWithMeta>(`${INVOICE_SELECT} WHERE i.number = ?`, [number]);
}

export function listInvoiceItems(invoiceId: number): InvoiceItemRow[] {
  return all<InvoiceItemRow>(
    'SELECT * FROM invoice_items WHERE invoice_id = ? ORDER BY position, id',
    [invoiceId],
  );
}

export type InvoiceFilter = {
  status?: InvoiceStatus | 'all' | 'unpaid';
  clientId?: number;
  projectId?: number;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export function listInvoices(filter: InvoiceFilter = {}): InvoiceWithMeta[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status === 'unpaid') {
    where.push(`i.status IN (${UNPAID_STATUSES.map(() => '?').join(',')})`);
    params.push(...UNPAID_STATUSES);
  } else if (filter.status && filter.status !== 'all') {
    where.push('i.status = ?');
    params.push(filter.status);
  }
  if (filter.clientId) { where.push('i.client_id = ?'); params.push(filter.clientId); }
  if (filter.projectId) { where.push('i.project_id = ?'); params.push(filter.projectId); }
  if (filter.from) { where.push('i.issue_date >= ?'); params.push(filter.from); }
  if (filter.to) { where.push('i.issue_date <= ?'); params.push(filter.to); }
  if (filter.search) {
    where.push('(i.number LIKE ? OR i.title LIKE ? OR c.name LIKE ?)');
    const like = `%${filter.search}%`;
    params.push(like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(filter.limit ?? 100, filter.offset ?? 0);
  return all<InvoiceWithMeta>(
    `${INVOICE_SELECT} ${clause} ORDER BY i.issue_date DESC, i.id DESC LIMIT ? OFFSET ?`,
    params,
  );
}

export function countInvoices(status?: InvoiceStatus | 'unpaid'): number {
  if (status === 'unpaid') {
    return scalar<number>(
      `SELECT COUNT(*) AS c FROM invoices WHERE status IN (${UNPAID_STATUSES.map(() => '?').join(',')})`,
      UNPAID_STATUSES, 0,
    );
  }
  return status
    ? scalar<number>('SELECT COUNT(*) AS c FROM invoices WHERE status = ?', [status], 0)
    : scalar<number>('SELECT COUNT(*) AS c FROM invoices', [], 0);
}

export type InvoiceInput = {
  client_id?: number | null;
  project_id?: number | null;
  quote_id?: number | null;
  title?: string | null;
  status?: InvoiceStatus;
  kind?: InvoiceRow['kind'];
  issue_date?: string;
  due_date?: string | null;
  currency?: string;
  discount_type?: DiscountType;
  discount_value?: number;
  tax_rate?: number;
  payment_terms?: string | null;
  notes?: string | null;
  locale?: string;
  is_demo?: boolean;
  created_by?: number | null;
  items?: LineItemInput[];
};

export function createInvoice(input: InvoiceInput): number {
  return transaction(() => {
    const number = nextReference('FAC', 'invoices', 'number');
    const dueDays = getSettingNumber('finance.payment_due_days', 15);
    const issueDate = input.issue_date ?? new Date().toISOString().slice(0, 10);
    const dueDate =
      input.due_date ??
      new Date(new Date(issueDate).getTime() + dueDays * 86400000).toISOString().slice(0, 10);

    const result = run(
      `INSERT INTO invoices
        (number, client_id, project_id, quote_id, title, status, kind, issue_date, due_date,
         currency, discount_type, discount_value, tax_rate, payment_terms, notes, locale,
         is_demo, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        number, input.client_id ?? null, input.project_id ?? null, input.quote_id ?? null,
        input.title ?? null, input.status ?? 'draft', input.kind ?? 'standard', issueDate, dueDate,
        input.currency ?? defaultCurrency(), input.discount_type ?? 'none',
        money(input.discount_value ?? 0), input.tax_rate ?? defaultTaxRate(),
        input.payment_terms ?? getSetting('finance.payment_terms', ''), input.notes ?? null,
        input.locale ?? 'fr', input.is_demo ? 1 : 0, input.created_by ?? null,
      ],
    );
    const id = Number(result.lastInsertRowid);
    if (input.items?.length) replaceInvoiceItems(id, input.items);
    else recalcInvoice(id);
    reindexInvoice(id);
    return id;
  });
}

export function updateInvoice(id: number, patch: Partial<InvoiceInput>): void {
  const map: Record<string, unknown> = {
    client_id: patch.client_id, project_id: patch.project_id, quote_id: patch.quote_id,
    title: patch.title, status: patch.status, kind: patch.kind, issue_date: patch.issue_date,
    due_date: patch.due_date, currency: patch.currency, discount_type: patch.discount_type,
    discount_value: patch.discount_value === undefined ? undefined : money(patch.discount_value),
    tax_rate: patch.tax_rate, payment_terms: patch.payment_terms, notes: patch.notes,
    locale: patch.locale,
  };
  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(value);
  }
  if (patch.status === 'sent') fields.push(`sent_at = COALESCE(sent_at, datetime('now'))`);

  if (fields.length > 0) {
    params.push(id);
    run(`UPDATE invoices SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params);
  }
  // `!== undefined` rather than truthiness: an explicitly empty array means
  // "remove every line", which is a legitimate edit on a draft.
  if (patch.items !== undefined) replaceInvoiceItems(id, patch.items);
  else recalcInvoice(id);
  reindexInvoice(id);
}

export function replaceInvoiceItems(invoiceId: number, items: LineItemInput[]): void {
  transaction(() => {
    run('DELETE FROM invoice_items WHERE invoice_id = ?', [invoiceId]);
    items.forEach((item, index) => {
      run(
        `INSERT INTO invoice_items
          (invoice_id, service_id, label, description, quantity, unit, unit_price, discount, line_total, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          invoiceId, item.service_id ?? null, item.label, item.description ?? null,
          item.quantity ?? 1, item.unit ?? 'forfait', money(item.unit_price ?? 0),
          item.discount ?? 0, lineTotal(item), index,
        ],
      );
    });
    recalcInvoice(invoiceId);
  });
}

/**
 * Single writer for an invoice's stored totals, paid amount, balance and status.
 *
 * Status is derived here rather than set by hand: draft and cancelled are
 * terminal choices the user makes, everything else follows from the numbers and
 * the due date, so an invoice can never show "paid" with a balance outstanding.
 */
export function recalcInvoice(invoiceId: number): void {
  const invoice = one<InvoiceRow>('SELECT * FROM invoices WHERE id = ?', [invoiceId]);
  if (!invoice) return;

  const items = listInvoiceItems(invoiceId);
  const totals = computeTotals(items, {
    discountType: invoice.discount_type,
    discountValue: invoice.discount_value,
    taxRate: invoice.tax_rate,
  });

  const paid = money(
    scalar<number>(
      `SELECT COALESCE(SUM(amount), 0) AS s FROM payments WHERE invoice_id = ? AND status = 'confirmed'`,
      [invoiceId], 0,
    ),
  );
  const balance = balanceDue(totals.total, paid);

  let status = invoice.status;
  if (status !== 'draft' && status !== 'cancelled') {
    if (totals.total > 0 && balance <= 0) status = 'paid';
    else if (paid > 0) status = 'partially_paid';
    else status = 'sent';

    // Overdue overrides the unpaid states, but never a fully paid invoice.
    if (status !== 'paid' && invoice.due_date && invoice.due_date < new Date().toISOString().slice(0, 10)) {
      status = 'overdue';
    }
  }

  run(
    `UPDATE invoices SET subtotal = ?, discount_total = ?, tax_total = ?, total = ?,
       amount_paid = ?, balance_due = ?, status = ?,
       paid_at = CASE WHEN ? = 'paid' THEN COALESCE(paid_at, datetime('now')) ELSE NULL END,
       updated_at = datetime('now')
     WHERE id = ?`,
    [
      totals.subtotal, totals.discount_total, totals.tax_total, totals.total,
      paid, balance, status, status, invoiceId,
    ],
  );
}

export function deleteInvoice(id: number): void {
  run('DELETE FROM invoices WHERE id = ?', [id]);
  removeFromIndex('invoice', id);
}

export function cancelInvoice(id: number): void {
  run(`UPDATE invoices SET status = 'cancelled', updated_at = datetime('now') WHERE id = ?`, [id]);
}

/** Converts an accepted quote into a draft invoice, copying every line. */
/** The invoice generated from a quote, if one exists. */
export function invoiceForQuote(quoteId: number): InvoiceWithMeta | null {
  return one<InvoiceWithMeta>(`${INVOICE_SELECT} WHERE i.quote_id = ? ORDER BY i.id LIMIT 1`, [quoteId]);
}

export function invoiceFromQuote(quoteId: number, createdBy?: number | null): number | null {
  const quote = one<QuoteRow>('SELECT * FROM quotes WHERE id = ?', [quoteId]);
  if (!quote) return null;
  const items = listQuoteItems(quoteId);
  return createInvoice({
    client_id: quote.client_id,
    project_id: quote.project_id,
    quote_id: quote.id,
    title: quote.title,
    currency: quote.currency,
    discount_type: quote.discount_type,
    discount_value: quote.discount_value,
    tax_rate: quote.tax_rate,
    payment_terms: quote.payment_terms,
    notes: quote.notes,
    locale: quote.locale,
    created_by: createdBy ?? null,
    items: items.map((i) => ({
      service_id: i.service_id, label: i.label, description: i.description,
      quantity: i.quantity, unit: i.unit, unit_price: i.unit_price, discount: i.discount,
    })),
  });
}

/** Marks overdue invoices; run by the daily automation. */
export function refreshOverdueInvoices(): number {
  const result = run(
    `UPDATE invoices
     SET status = 'overdue', updated_at = datetime('now')
     WHERE status IN ('sent','partially_paid')
       AND due_date IS NOT NULL
       AND due_date < date('now')
       AND balance_due > 0`,
  );
  return result.changes;
}

function reindexInvoice(id: number): void {
  const invoice = findInvoice(id);
  if (!invoice) return;
  indexEntity({
    type: 'invoice',
    id,
    title: invoice.number,
    subtitle: [invoice.title, invoice.client_name, invoiceStatusLabel(invoice.status)].filter(Boolean).join(' · '),
    body: invoice.notes,
    url: `/espace-admin/factures/${id}`,
  });
}

// ── Payments ─────────────────────────────────────────────────────────────

export type PaymentWithMeta = PaymentRow & {
  invoice_number: string | null;
  client_name: string | null;
  project_title: string | null;
};

export function listPayments(filter: {
  invoiceId?: number; clientId?: number; projectId?: number;
  from?: string; to?: string; limit?: number; offset?: number;
} = {}): PaymentWithMeta[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.invoiceId) { where.push('pay.invoice_id = ?'); params.push(filter.invoiceId); }
  if (filter.clientId) { where.push('pay.client_id = ?'); params.push(filter.clientId); }
  if (filter.projectId) { where.push('pay.project_id = ?'); params.push(filter.projectId); }
  if (filter.from) { where.push('pay.paid_at >= ?'); params.push(filter.from); }
  if (filter.to) { where.push('pay.paid_at <= ?'); params.push(filter.to); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(filter.limit ?? 100, filter.offset ?? 0);
  return all<PaymentWithMeta>(
    `SELECT pay.*, i.number AS invoice_number, c.name AS client_name, p.title AS project_title
     FROM payments pay
     LEFT JOIN invoices i ON i.id = pay.invoice_id
     LEFT JOIN clients c ON c.id = pay.client_id
     LEFT JOIN projects p ON p.id = pay.project_id
     ${clause} ORDER BY pay.paid_at DESC, pay.id DESC LIMIT ? OFFSET ?`,
    params,
  );
}

export function findPayment(id: number): PaymentRow | null {
  return one<PaymentRow>('SELECT * FROM payments WHERE id = ?', [id]);
}

/**
 * Records a payment. The invoice's client/project are inherited when not given,
 * so a payment can never end up detached from the client it belongs to, and the
 * invoice totals are refreshed in the same transaction.
 */
export function createPayment(input: {
  invoiceId?: number | null;
  clientId?: number | null;
  projectId?: number | null;
  amount: number;
  currency?: string;
  method?: PaymentMethod;
  reference?: string | null;
  paidAt?: string;
  status?: PaymentRow['status'];
  notes?: string | null;
  isDemo?: boolean;
  recordedBy?: number | null;
}): number {
  return transaction(() => {
    let clientId = input.clientId ?? null;
    let projectId = input.projectId ?? null;
    let currency = input.currency;

    if (input.invoiceId) {
      const invoice = one<InvoiceRow>('SELECT * FROM invoices WHERE id = ?', [input.invoiceId]);
      if (invoice) {
        clientId = clientId ?? invoice.client_id;
        projectId = projectId ?? invoice.project_id;
        currency = currency ?? invoice.currency;
      }
    }

    const result = run(
      `INSERT INTO payments
        (invoice_id, client_id, project_id, amount, currency, method, reference, paid_at, status, notes, is_demo, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.invoiceId ?? null, clientId, projectId, money(input.amount),
        currency ?? defaultCurrency(), input.method ?? 'transfer', input.reference ?? null,
        input.paidAt ?? new Date().toISOString().slice(0, 10), input.status ?? 'confirmed',
        input.notes ?? null, input.isDemo ? 1 : 0, input.recordedBy ?? null,
      ],
    );
    if (input.invoiceId) recalcInvoice(input.invoiceId);
    return Number(result.lastInsertRowid);
  });
}

export function updatePayment(
  id: number,
  patch: { amount?: number; method?: PaymentMethod; reference?: string | null; paid_at?: string; status?: PaymentRow['status']; notes?: string | null },
): void {
  const payment = findPayment(id);
  if (!payment) return;
  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(key === 'amount' ? money(Number(value)) : value);
  }
  if (fields.length === 0) return;
  params.push(id);
  run(`UPDATE payments SET ${fields.join(', ')} WHERE id = ?`, params);
  if (payment.invoice_id) recalcInvoice(payment.invoice_id);
}

export function deletePayment(id: number): void {
  const payment = findPayment(id);
  run('DELETE FROM payments WHERE id = ?', [id]);
  if (payment?.invoice_id) recalcInvoice(payment.invoice_id);
}

// ── Contracts ────────────────────────────────────────────────────────────

export type ContractWithMeta = ContractRow & {
  client_name: string | null;
  project_title: string | null;
};

export function findContract(id: number): ContractWithMeta | null {
  return one<ContractWithMeta>(
    `SELECT ct.*, c.name AS client_name, p.title AS project_title
     FROM contracts ct
     LEFT JOIN clients c ON c.id = ct.client_id
     LEFT JOIN projects p ON p.id = ct.project_id
     WHERE ct.id = ?`,
    [id],
  );
}

export function listContracts(filter: { clientId?: number; projectId?: number; status?: string; limit?: number } = {}): ContractWithMeta[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.clientId) { where.push('ct.client_id = ?'); params.push(filter.clientId); }
  if (filter.projectId) { where.push('ct.project_id = ?'); params.push(filter.projectId); }
  if (filter.status) { where.push('ct.status = ?'); params.push(filter.status); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(filter.limit ?? 100);
  return all<ContractWithMeta>(
    `SELECT ct.*, c.name AS client_name, p.title AS project_title
     FROM contracts ct
     LEFT JOIN clients c ON c.id = ct.client_id
     LEFT JOIN projects p ON p.id = ct.project_id
     ${clause} ORDER BY ct.issue_date DESC, ct.id DESC LIMIT ?`,
    params,
  );
}

export function createContract(input: {
  templateId?: number | null;
  clientId?: number | null;
  projectId?: number | null;
  title: string;
  body: string;
  variables?: Record<string, string>;
  startDate?: string | null;
  deliveryDate?: string | null;
  amount?: number;
  currency?: string;
  locale?: string;
  isDemo?: boolean;
  createdBy?: number | null;
}): number {
  return transaction(() => {
    const number = nextReference('CTR', 'contracts', 'number');
    const result = run(
      `INSERT INTO contracts
        (number, template_id, client_id, project_id, title, body, variables,
         start_date, delivery_date, amount, currency, locale, is_demo, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        number, input.templateId ?? null, input.clientId ?? null, input.projectId ?? null,
        input.title, input.body, input.variables ? toJson(input.variables) : null,
        input.startDate ?? null, input.deliveryDate ?? null, money(input.amount ?? 0),
        input.currency ?? defaultCurrency(), input.locale ?? 'fr',
        input.isDemo ? 1 : 0, input.createdBy ?? null,
      ],
    );
    const id = Number(result.lastInsertRowid);
    indexEntity({
      type: 'contract', id, title: number, subtitle: input.title, body: null,
      url: `/espace-admin/contrats/${id}`,
    });
    return id;
  });
}

export function updateContract(
  id: number,
  patch: { title?: string; body?: string; status?: ContractRow['status']; amount?: number; start_date?: string | null; delivery_date?: string | null },
): void {
  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(key === 'amount' ? money(Number(value)) : value);
  }
  if (patch.status === 'signed') fields.push(`signed_at = COALESCE(signed_at, datetime('now'))`);
  if (fields.length === 0) return;
  params.push(id);
  run(`UPDATE contracts SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params);
}

export function deleteContract(id: number): void {
  run('DELETE FROM contracts WHERE id = ?', [id]);
  removeFromIndex('contract', id);
}

export function listContractTemplates(): ContractTemplateRow[] {
  return all<ContractTemplateRow>('SELECT * FROM contract_templates ORDER BY is_default DESC, name');
}

export function findContractTemplate(id: number): ContractTemplateRow | null {
  return one<ContractTemplateRow>('SELECT * FROM contract_templates WHERE id = ?', [id]);
}

export function defaultContractTemplate(): ContractTemplateRow | null {
  return (
    one<ContractTemplateRow>('SELECT * FROM contract_templates WHERE is_default = 1 LIMIT 1') ??
    one<ContractTemplateRow>('SELECT * FROM contract_templates ORDER BY id LIMIT 1')
  );
}

export function upsertContractTemplate(input: {
  id?: number; name: string; description?: string | null; body: string;
  locale?: string; isDefault?: boolean;
}): number {
  return transaction(() => {
    let id = input.id;
    if (id) {
      run(
        `UPDATE contract_templates SET name = ?, description = ?, body = ?, locale = ?,
           is_default = ?, updated_at = datetime('now') WHERE id = ?`,
        [input.name, input.description ?? null, input.body, input.locale ?? 'fr', input.isDefault ? 1 : 0, id],
      );
    } else {
      const result = run(
        `INSERT INTO contract_templates (name, description, body, locale, is_default)
         VALUES (?, ?, ?, ?, ?)`,
        [input.name, input.description ?? null, input.body, input.locale ?? 'fr', input.isDefault ? 1 : 0],
      );
      id = Number(result.lastInsertRowid);
    }
    // Only one default at a time.
    if (input.isDefault) run('UPDATE contract_templates SET is_default = 0 WHERE id != ?', [id]);
    return id;
  });
}

export function deleteContractTemplate(id: number): void {
  run('DELETE FROM contract_templates WHERE id = ?', [id]);
}
