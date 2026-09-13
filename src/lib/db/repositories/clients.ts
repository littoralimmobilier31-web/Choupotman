import { all, one, run, scalar, transaction } from '../client';
import type { ClientRow, ClientStatus, ClientUserRow, InvoiceRow, PaymentRow, ProjectRow } from '../types';
import { indexEntity, removeFromIndex } from './search';
import { safeJson, toJson } from '@/lib/utils';
import { money } from '@/lib/money';

/** CRM — client records plus their portal accounts and financial roll-ups. */

/** `null` is accepted so a cleared field can be sent from a form without a cast. */
export type SocialLinks = {
  linkedin?: string | null;
  instagram?: string | null;
  facebook?: string | null;
  x?: string | null;
  youtube?: string | null;
  tiktok?: string | null;
  behance?: string | null;
};

export type Client = ClientRow & { social: SocialLinks };

function hydrate(row: ClientRow): Client {
  return { ...row, social: safeJson<SocialLinks>(row.social_links, {}) };
}

export function findClient(id: number): Client | null {
  const row = one<ClientRow>('SELECT * FROM clients WHERE id = ?', [id]);
  return row ? hydrate(row) : null;
}

export type ClientFilter = {
  search?: string;
  status?: ClientStatus | 'all';
  country?: string;
  includeDemo?: boolean;
  limit?: number;
  offset?: number;
  sort?: 'name' | 'recent' | 'revenue';
};

/**
 * Client list with the numbers the CRM table shows, computed in SQL so a page
 * with 200 clients is still one query rather than 200 round-trips.
 */
export type ClientListItem = Client & {
  project_count: number;
  active_project_count: number;
  invoice_count: number;
  total_revenue: number;
  outstanding: number;
  last_activity_at: string | null;
};

export function listClients(filter: ClientFilter = {}): ClientListItem[] {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filter.search) {
    where.push('(c.name LIKE ? OR c.company LIKE ? OR c.email LIKE ? OR c.phone LIKE ?)');
    const like = `%${filter.search}%`;
    params.push(like, like, like, like);
  }
  if (filter.status && filter.status !== 'all') {
    where.push('c.status = ?');
    params.push(filter.status);
  } else if (!filter.status) {
    where.push("c.status != 'archived'");
  }
  if (filter.country) { where.push('c.country = ?'); params.push(filter.country); }
  if (!filter.includeDemo) { /* demo rows are shown by default; flag is for exports */ }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order =
    filter.sort === 'revenue' ? 'total_revenue DESC'
    : filter.sort === 'recent' ? 'c.created_at DESC'
    : 'c.name COLLATE NOCASE';

  params.push(filter.limit ?? 100, filter.offset ?? 0);

  const rows = all<ClientRow & Omit<ClientListItem, keyof Client>>(
    `SELECT c.*,
       (SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id) AS project_count,
       (SELECT COUNT(*) FROM projects p WHERE p.client_id = c.id
          AND p.status IN ('planning','in_progress','in_review','awaiting_client')) AS active_project_count,
       (SELECT COUNT(*) FROM invoices i WHERE i.client_id = c.id AND i.status != 'cancelled') AS invoice_count,
       COALESCE((SELECT SUM(pay.amount) FROM payments pay
          WHERE pay.client_id = c.id AND pay.status = 'confirmed'), 0) AS total_revenue,
       COALESCE((SELECT SUM(i.balance_due) FROM invoices i
          WHERE i.client_id = c.id AND i.status IN ('sent','partially_paid','overdue')), 0) AS outstanding,
       (SELECT MAX(x.at) FROM (
          SELECT MAX(p.updated_at) AS at FROM projects p WHERE p.client_id = c.id
          UNION ALL SELECT MAX(i.updated_at) FROM invoices i WHERE i.client_id = c.id
          UNION ALL SELECT MAX(m.created_at) FROM messages m WHERE m.client_id = c.id
       ) x) AS last_activity_at
     FROM clients c
     ${clause}
     ORDER BY ${order}
     LIMIT ? OFFSET ?`,
    params,
  );

  return rows.map((row) => ({ ...hydrate(row), ...row, social: safeJson<SocialLinks>(row.social_links, {}) }));
}

export function countClients(filter: ClientFilter = {}): number {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.search) {
    where.push('(name LIKE ? OR company LIKE ? OR email LIKE ?)');
    const like = `%${filter.search}%`;
    params.push(like, like, like);
  }
  if (filter.status && filter.status !== 'all') { where.push('status = ?'); params.push(filter.status); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return scalar<number>(`SELECT COUNT(*) AS c FROM clients ${clause}`, params, 0);
}

export type ClientInput = {
  name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  country?: string | null;
  city?: string | null;
  address?: string | null;
  website?: string | null;
  social?: SocialLinks;
  tax_id?: string | null;
  currency?: string;
  preferred_locale?: string;
  status?: ClientStatus;
  source?: string | null;
  notes?: string | null;
  is_demo?: boolean;
  created_by?: number | null;
};

export function createClient(input: ClientInput): number {
  const result = run(
    `INSERT INTO clients
      (name, company, email, phone, whatsapp, country, city, address, website, social_links,
       tax_id, currency, preferred_locale, status, source, notes, is_demo, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.name.trim(), input.company ?? null, input.email ?? null, input.phone ?? null,
      input.whatsapp ?? null, input.country ?? null, input.city ?? null, input.address ?? null,
      input.website ?? null, input.social ? toJson(input.social) : null, input.tax_id ?? null,
      input.currency ?? 'DZD', input.preferred_locale ?? 'fr', input.status ?? 'active',
      input.source ?? null, input.notes ?? null, input.is_demo ? 1 : 0, input.created_by ?? null,
    ],
  );
  const id = Number(result.lastInsertRowid);
  reindexClient(id);
  return id;
}

export function updateClient(id: number, patch: Partial<ClientInput>): void {
  const map: Record<string, unknown> = {
    name: patch.name, company: patch.company, email: patch.email, phone: patch.phone,
    whatsapp: patch.whatsapp, country: patch.country, city: patch.city, address: patch.address,
    website: patch.website, tax_id: patch.tax_id, currency: patch.currency,
    preferred_locale: patch.preferred_locale, status: patch.status, source: patch.source,
    notes: patch.notes,
  };
  if (patch.social !== undefined) map.social_links = toJson(patch.social);

  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(value);
  }
  if (fields.length === 0) return;
  params.push(id);
  run(`UPDATE clients SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params);
  reindexClient(id);
}

export function deleteClient(id: number): void {
  run('DELETE FROM clients WHERE id = ?', [id]);
  removeFromIndex('client', id);
}

export function archiveClient(id: number): void {
  run(`UPDATE clients SET status = 'archived', updated_at = datetime('now') WHERE id = ?`, [id]);
}

function reindexClient(id: number): void {
  const client = findClient(id);
  if (!client) return;
  indexEntity({
    type: 'client',
    id,
    title: client.name,
    subtitle: client.company ?? client.email ?? client.city,
    body: [client.notes, client.email, client.phone, client.city, client.country].filter(Boolean).join(' · '),
    url: `/espace-admin/clients/${id}`,
  });
}

// ── Client 360 view ──────────────────────────────────────────────────────

export type ClientDossier = {
  client: Client;
  projects: ProjectRow[];
  invoices: InvoiceRow[];
  payments: PaymentRow[];
  totals: {
    revenue: number;
    invoiced: number;
    outstanding: number;
    overdue: number;
    projectCount: number;
    completedProjects: number;
    averageProjectValue: number;
  };
};

/** Everything the client detail page shows, gathered in one place. */
export function getClientDossier(id: number): ClientDossier | null {
  const client = findClient(id);
  if (!client) return null;

  const projects = all<ProjectRow>(
    'SELECT * FROM projects WHERE client_id = ? ORDER BY created_at DESC',
    [id],
  );
  const invoices = all<InvoiceRow>(
    'SELECT * FROM invoices WHERE client_id = ? ORDER BY issue_date DESC, id DESC',
    [id],
  );
  const payments = all<PaymentRow>(
    'SELECT * FROM payments WHERE client_id = ? ORDER BY paid_at DESC',
    [id],
  );

  const revenue = money(
    payments.filter((p) => p.status === 'confirmed').reduce((acc, p) => acc + p.amount, 0),
  );
  const billable = invoices.filter((i) => i.status !== 'cancelled' && i.status !== 'draft');
  const invoiced = money(billable.reduce((acc, i) => acc + i.total, 0));
  const outstanding = money(billable.reduce((acc, i) => acc + i.balance_due, 0));
  const overdue = money(
    invoices.filter((i) => i.status === 'overdue').reduce((acc, i) => acc + i.balance_due, 0),
  );
  const completed = projects.filter((p) => p.status === 'completed').length;

  return {
    client,
    projects,
    invoices,
    payments,
    totals: {
      revenue,
      invoiced,
      outstanding,
      overdue,
      projectCount: projects.length,
      completedProjects: completed,
      averageProjectValue: projects.length ? money(invoiced / projects.length) : 0,
    },
  };
}

/** Distinct countries present, for the filter dropdown. */
export function clientCountries(): string[] {
  return all<{ country: string }>(
    "SELECT DISTINCT country FROM clients WHERE country IS NOT NULL AND country != '' ORDER BY country",
  ).map((r) => r.country);
}

/** Lightweight options list for <select> controls. */
export function clientOptions(): { id: number; label: string; currency: string }[] {
  return all<{ id: number; name: string; company: string | null; currency: string }>(
    "SELECT id, name, company, currency FROM clients WHERE status != 'archived' ORDER BY name COLLATE NOCASE",
  ).map((r) => ({
    id: r.id,
    label: r.company ? `${r.name} — ${r.company}` : r.name,
    currency: r.currency,
  }));
}

// ── Portal accounts ──────────────────────────────────────────────────────

export function listClientUsers(clientId: number): ClientUserRow[] {
  return all<ClientUserRow>('SELECT * FROM client_users WHERE client_id = ? ORDER BY email', [clientId]);
}

export function findClientUserByEmail(email: string): ClientUserRow | null {
  return one<ClientUserRow>('SELECT * FROM client_users WHERE lower(email) = lower(?)', [email.trim()]);
}

export function findClientUser(id: number): ClientUserRow | null {
  return one<ClientUserRow>('SELECT * FROM client_users WHERE id = ?', [id]);
}

export function createClientUser(input: {
  clientId: number;
  email: string;
  fullName?: string | null;
  passwordHash?: string | null;
  inviteTokenHash?: string | null;
  inviteExpiresAt?: string | null;
  locale?: string;
}): number {
  const result = run(
    `INSERT INTO client_users
      (client_id, email, full_name, password_hash, invite_token_hash, invite_expires_at, locale)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.clientId, input.email.trim().toLowerCase(), input.fullName ?? null,
      input.passwordHash ?? null, input.inviteTokenHash ?? null, input.inviteExpiresAt ?? null,
      input.locale ?? 'fr',
    ],
  );
  return Number(result.lastInsertRowid);
}

export function setClientUserPassword(id: number, passwordHash: string): void {
  run(
    `UPDATE client_users
     SET password_hash = ?, must_change_password = 0, invite_token_hash = NULL, invite_expires_at = NULL
     WHERE id = ?`,
    [passwordHash, id],
  );
}

export function findClientUserByInvite(tokenHash: string): ClientUserRow | null {
  return one<ClientUserRow>(
    `SELECT * FROM client_users
     WHERE invite_token_hash = ? AND (invite_expires_at IS NULL OR invite_expires_at > ?)`,
    [tokenHash, new Date().toISOString()],
  );
}

export function markClientUserLogin(id: number): void {
  run(`UPDATE client_users SET last_login_at = datetime('now') WHERE id = ?`, [id]);
}

export function deactivateClientUser(id: number): void {
  transaction((db) => {
    db.prepare('UPDATE client_users SET is_active = 0 WHERE id = ?').run(id);
    db.prepare(`UPDATE client_sessions SET revoked_at = datetime('now') WHERE client_user_id = ?`).run(id);
  });
}
