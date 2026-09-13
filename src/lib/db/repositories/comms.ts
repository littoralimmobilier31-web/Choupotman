import { all, one, run, scalar } from '../client';
import type {
  ContactSubmissionRow, MessageRow, MessageStatus, MessageTemplateRow,
  NotificationKind, NotificationRow,
} from '../types';
import { indexEntity, removeFromIndex } from './search';
import { safeJson, toJson } from '@/lib/utils';

/**
 * Messaging, notifications and public form submissions.
 *
 * `messages` doubles as the outbox: when SMTP is not configured a message is
 * stored with status `queued` and is visible in the admin, so an email is never
 * silently lost — it is explicitly waiting to be sent.
 */

// ── Templates ────────────────────────────────────────────────────────────

/** Keys the automation engine and the AI assistant refer to by name. */
export const TEMPLATE_KEYS = [
  'payment_reminder', 'delivery', 'feedback_request', 'meeting_confirmation',
  'new_revision', 'project_end', 'new_lead', 'form_confirmation',
  'quote_sent', 'invoice_sent', 'payment_received', 'appointment',
] as const;

export type TemplateKey = (typeof TEMPLATE_KEYS)[number];

export function listMessageTemplates(): MessageTemplateRow[] {
  return all<MessageTemplateRow>('SELECT * FROM message_templates ORDER BY is_system DESC, name');
}

export function findMessageTemplate(key: string): MessageTemplateRow | null {
  return one<MessageTemplateRow>('SELECT * FROM message_templates WHERE key = ?', [key]);
}

export function findMessageTemplateById(id: number): MessageTemplateRow | null {
  return one<MessageTemplateRow>('SELECT * FROM message_templates WHERE id = ?', [id]);
}

export function upsertMessageTemplate(input: {
  key: string; name: string; subject?: string | null; body: string;
  channel?: MessageTemplateRow['channel']; locale?: string; description?: string | null; isSystem?: boolean;
}): number {
  run(
    `INSERT INTO message_templates (key, name, channel, subject, body, locale, description, is_system)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       name = excluded.name, channel = excluded.channel, subject = excluded.subject,
       body = excluded.body, locale = excluded.locale, description = excluded.description,
       updated_at = datetime('now')`,
    [
      input.key, input.name, input.channel ?? 'email', input.subject ?? null, input.body,
      input.locale ?? 'fr', input.description ?? null, input.isSystem ? 1 : 0,
    ],
  );
  return one<{ id: number }>('SELECT id FROM message_templates WHERE key = ?', [input.key])?.id ?? 0;
}

export function deleteMessageTemplate(id: number): void {
  run('DELETE FROM message_templates WHERE id = ? AND is_system = 0', [id]);
}

/**
 * Substitutes {{variables}} from a whitelist.
 *
 * The distinction that matters: a key **present** in the map is substituted even
 * when its value is empty (an address the client never gave should print as
 * nothing, not as `{{client_address}}`), while a key **absent** from the map is
 * left visibly intact — so a typo in a template shows up as `{{clientname}}` in
 * the preview instead of silently producing a document with a hole in it.
 */
export function renderTemplate(
  body: string,
  variables: Record<string, string | number | null | undefined>,
): string {
  return body.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, key: string) => {
    if (!Object.prototype.hasOwnProperty.call(variables, key)) return match;
    const value = variables[key];
    return value === null || value === undefined ? '' : String(value);
  });
}

/** Placeholder names present in a template — powers the variable helper in the UI. */
export function templateVariables(body: string): string[] {
  const found = new Set<string>();
  for (const match of body.matchAll(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g)) {
    if (match[1]) found.add(match[1]);
  }
  return [...found].sort();
}

// ── Messages / outbox ────────────────────────────────────────────────────

export type MessageWithMeta = MessageRow & {
  client_name: string | null;
  project_title: string | null;
  invoice_number: string | null;
};

const MESSAGE_SELECT = `
  SELECT m.*, c.name AS client_name, p.title AS project_title, i.number AS invoice_number
  FROM messages m
  LEFT JOIN clients c ON c.id = m.client_id
  LEFT JOIN projects p ON p.id = m.project_id
  LEFT JOIN invoices i ON i.id = m.invoice_id
`;

export function findMessage(id: number): MessageWithMeta | null {
  return one<MessageWithMeta>(`${MESSAGE_SELECT} WHERE m.id = ?`, [id]);
}

export function listMessages(filter: {
  status?: MessageStatus | 'all';
  clientId?: number;
  projectId?: number;
  direction?: MessageRow['direction'];
  search?: string;
  limit?: number;
  offset?: number;
} = {}): MessageWithMeta[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status && filter.status !== 'all') { where.push('m.status = ?'); params.push(filter.status); }
  if (filter.clientId) { where.push('m.client_id = ?'); params.push(filter.clientId); }
  if (filter.projectId) { where.push('m.project_id = ?'); params.push(filter.projectId); }
  if (filter.direction) { where.push('m.direction = ?'); params.push(filter.direction); }
  if (filter.search) {
    where.push('(m.subject LIKE ? OR m.body LIKE ? OR m.to_address LIKE ? OR m.to_name LIKE ?)');
    const like = `%${filter.search}%`;
    params.push(like, like, like, like);
  }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(filter.limit ?? 100, filter.offset ?? 0);
  return all<MessageWithMeta>(
    `${MESSAGE_SELECT} ${clause} ORDER BY m.created_at DESC, m.id DESC LIMIT ? OFFSET ?`,
    params,
  );
}

export function countMessages(status?: MessageStatus): number {
  return status
    ? scalar<number>('SELECT COUNT(*) AS c FROM messages WHERE status = ?', [status], 0)
    : scalar<number>('SELECT COUNT(*) AS c FROM messages', [], 0);
}

export type MessageInput = {
  direction?: MessageRow['direction'];
  channel?: MessageRow['channel'];
  templateKey?: string | null;
  clientId?: number | null;
  projectId?: number | null;
  leadId?: number | null;
  invoiceId?: number | null;
  toName?: string | null;
  toAddress?: string | null;
  fromAddress?: string | null;
  subject?: string | null;
  body?: string | null;
  status?: MessageStatus;
  isDemo?: boolean;
  createdBy?: number | null;
};

export function createMessage(input: MessageInput): number {
  const result = run(
    `INSERT INTO messages
      (direction, channel, template_key, client_id, project_id, lead_id, invoice_id,
       to_name, to_address, from_address, subject, body, status, is_demo, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.direction ?? 'outbound', input.channel ?? 'email', input.templateKey ?? null,
      input.clientId ?? null, input.projectId ?? null, input.leadId ?? null,
      input.invoiceId ?? null, input.toName ?? null, input.toAddress ?? null,
      input.fromAddress ?? null, input.subject ?? null, input.body ?? null,
      input.status ?? 'draft', input.isDemo ? 1 : 0, input.createdBy ?? null,
    ],
  );
  const id = Number(result.lastInsertRowid);
  indexEntity({
    type: 'message', id, title: input.subject ?? '(sans objet)',
    subtitle: input.toName ?? input.toAddress, body: input.body,
    url: `/espace-admin/messages/${id}`,
  });
  return id;
}

export function updateMessage(
  id: number,
  patch: { subject?: string | null; body?: string | null; status?: MessageStatus; error?: string | null; toAddress?: string | null },
): void {
  const map: Record<string, unknown> = {
    subject: patch.subject, body: patch.body, status: patch.status,
    error: patch.error, to_address: patch.toAddress,
  };
  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(value);
  }
  if (patch.status === 'sent') fields.push(`sent_at = COALESCE(sent_at, datetime('now'))`);
  if (fields.length === 0) return;
  params.push(id);
  run(`UPDATE messages SET ${fields.join(', ')} WHERE id = ?`, params);
}

export function markMessageSent(id: number): void {
  run(`UPDATE messages SET status = 'sent', sent_at = datetime('now'), error = NULL WHERE id = ?`, [id]);
}

export function markMessageFailed(id: number, error: string): void {
  run(`UPDATE messages SET status = 'failed', error = ? WHERE id = ?`, [error.slice(0, 500), id]);
}

export function deleteMessage(id: number): void {
  run('DELETE FROM messages WHERE id = ?', [id]);
  removeFromIndex('message', id);
}

export function listQueuedMessages(limit = 50): MessageRow[] {
  return all<MessageRow>(
    `SELECT * FROM messages WHERE status = 'queued' ORDER BY created_at LIMIT ?`,
    [limit],
  );
}

// ── Notifications ────────────────────────────────────────────────────────

export type NotificationInput = {
  userId?: number | null;
  kind: NotificationKind;
  title: string;
  body?: string | null;
  severity?: NotificationRow['severity'];
  url?: string | null;
  entityType?: string | null;
  entityId?: number | null;
  /** Set to stop the automation engine re-notifying the same fact each run. */
  dedupeKey?: string | null;
};

/**
 * Creates a notification. With a `dedupeKey`, an existing row wins and nothing
 * is inserted — which is what makes the daily deadline/overdue sweeps safe to
 * run as often as you like.
 */
export function notify(input: NotificationInput): number | null {
  if (input.dedupeKey) {
    const existing = one<{ id: number }>('SELECT id FROM notifications WHERE dedupe_key = ?', [input.dedupeKey]);
    if (existing) return null;
  }
  const result = run(
    `INSERT INTO notifications (user_id, kind, title, body, severity, url, entity_type, entity_id, dedupe_key)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId ?? null, input.kind, input.title, input.body ?? null,
      input.severity ?? 'info', input.url ?? null, input.entityType ?? null,
      input.entityId ?? null, input.dedupeKey ?? null,
    ],
  );
  return Number(result.lastInsertRowid);
}

/** Notifications for a user, including the broadcast ones (user_id IS NULL). */
export function listNotifications(options: { userId?: number; unreadOnly?: boolean; limit?: number } = {}): NotificationRow[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (options.userId) { where.push('(user_id = ? OR user_id IS NULL)'); params.push(options.userId); }
  if (options.unreadOnly) where.push('read_at IS NULL');
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(options.limit ?? 50);
  return all<NotificationRow>(
    `SELECT * FROM notifications ${clause} ORDER BY created_at DESC, id DESC LIMIT ?`,
    params,
  );
}

export function countUnreadNotifications(userId?: number): number {
  return userId
    ? scalar<number>(
        'SELECT COUNT(*) AS c FROM notifications WHERE read_at IS NULL AND (user_id = ? OR user_id IS NULL)',
        [userId], 0,
      )
    : scalar<number>('SELECT COUNT(*) AS c FROM notifications WHERE read_at IS NULL', [], 0);
}

export function markNotificationRead(id: number): void {
  run(`UPDATE notifications SET read_at = datetime('now') WHERE id = ? AND read_at IS NULL`, [id]);
}

export function markAllNotificationsRead(userId?: number): number {
  const result = userId
    ? run(
        `UPDATE notifications SET read_at = datetime('now')
         WHERE read_at IS NULL AND (user_id = ? OR user_id IS NULL)`,
        [userId],
      )
    : run(`UPDATE notifications SET read_at = datetime('now') WHERE read_at IS NULL`);
  return result.changes;
}

export function deleteNotification(id: number): void {
  run('DELETE FROM notifications WHERE id = ?', [id]);
}

export function pruneNotifications(olderThanDays = 90): number {
  return run(
    `DELETE FROM notifications WHERE read_at IS NOT NULL AND created_at < datetime('now', ?)`,
    [`-${olderThanDays} days`],
  ).changes;
}

// ── Contact submissions ──────────────────────────────────────────────────

export type ContactSubmission = ContactSubmissionRow & { payloadData: Record<string, unknown> };

export function listContactSubmissions(filter: {
  status?: ContactSubmissionRow['status'] | 'all';
  source?: ContactSubmissionRow['source'];
  limit?: number;
  offset?: number;
} = {}): ContactSubmission[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status && filter.status !== 'all') { where.push('status = ?'); params.push(filter.status); }
  if (filter.source) { where.push('source = ?'); params.push(filter.source); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(filter.limit ?? 100, filter.offset ?? 0);
  return all<ContactSubmissionRow>(
    `SELECT * FROM contact_submissions ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    params,
  ).map((row) => ({ ...row, payloadData: safeJson<Record<string, unknown>>(row.payload, {}) }));
}

export function findContactSubmission(id: number): ContactSubmission | null {
  const row = one<ContactSubmissionRow>('SELECT * FROM contact_submissions WHERE id = ?', [id]);
  return row ? { ...row, payloadData: safeJson<Record<string, unknown>>(row.payload, {}) } : null;
}

export function createContactSubmission(input: {
  name: string;
  email: string;
  phone?: string | null;
  company?: string | null;
  service?: string | null;
  budget?: string | null;
  deadline?: string | null;
  message?: string | null;
  fileId?: number | null;
  locale?: string;
  source?: ContactSubmissionRow['source'];
  payload?: unknown;
  ip?: string | null;
  userAgent?: string | null;
}): number {
  const result = run(
    `INSERT INTO contact_submissions
      (name, email, phone, company, service, budget, deadline, message, file_id,
       locale, source, payload, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.name, input.email, input.phone ?? null, input.company ?? null,
      input.service ?? null, input.budget ?? null, input.deadline ?? null,
      input.message ?? null, input.fileId ?? null, input.locale ?? 'fr',
      input.source ?? 'contact_form',
      input.payload === undefined ? null : toJson(input.payload),
      input.ip ?? null, input.userAgent ?? null,
    ],
  );
  return Number(result.lastInsertRowid);
}

export function linkSubmissionToLead(submissionId: number, leadId: number): void {
  run(`UPDATE contact_submissions SET lead_id = ?, status = 'converted' WHERE id = ?`, [leadId, submissionId]);
}

export function markSubmissionRead(id: number): void {
  run(`UPDATE contact_submissions SET status = 'read' WHERE id = ? AND status = 'new'`, [id]);
}

export function markSubmissionSpam(id: number): void {
  run(`UPDATE contact_submissions SET status = 'spam' WHERE id = ?`, [id]);
}

export function countNewSubmissions(): number {
  return scalar<number>("SELECT COUNT(*) AS c FROM contact_submissions WHERE status = 'new'", [], 0);
}

export function deleteContactSubmission(id: number): void {
  run('DELETE FROM contact_submissions WHERE id = ?', [id]);
}
