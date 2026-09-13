import { all, run, scalar } from '../client';
import type { ActivityLogRow } from '../types';
import { toJson } from '@/lib/utils';

/**
 * Audit trail.
 *
 * Every state-changing operation calls `logActivity`. `actor_label` is
 * denormalised so the log stays readable after a user row is deleted, and
 * `metadata` carries a before/after diff for financial and status changes.
 */

export type ActivityAction =
  | 'login' | 'logout' | 'login_failed' | 'password_changed' | 'password_reset'
  | 'create' | 'update' | 'delete' | 'status_change'
  | 'send' | 'payment' | 'invoice' | 'quote' | 'contract'
  | 'ai.action' | 'automation' | 'backup' | 'restore' | 'export';

export type LogInput = {
  userId?: number | null;
  actorLabel?: string | null;
  action: ActivityAction | (string & {});
  entityType?: string | null;
  entityId?: number | null;
  entityLabel?: string | null;
  summary?: string | null;
  metadata?: unknown;
  ip?: string | null;
};

export function logActivity(input: LogInput): void {
  run(
    `INSERT INTO activity_logs
      (user_id, actor_label, action, entity_type, entity_id, entity_label, summary, metadata, ip_address)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.userId ?? null,
      input.actorLabel ?? null,
      input.action,
      input.entityType ?? null,
      input.entityId ?? null,
      input.entityLabel ?? null,
      input.summary ?? null,
      input.metadata === undefined ? null : toJson(input.metadata),
      input.ip ?? null,
    ],
  );
}

/**
 * Diff helper: records only the fields that actually changed, so an audit entry
 * for "updated invoice" shows the two numbers that moved rather than 30 columns.
 */
export function diffFields<T extends Record<string, unknown>>(
  before: T | null | undefined,
  after: Partial<T>,
  watch?: (keyof T & string)[],
): Record<string, { from: unknown; to: unknown }> {
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  const keys = watch ?? (Object.keys(after) as (keyof T & string)[]);
  for (const key of keys) {
    const from = before?.[key];
    const to = after[key];
    if (to === undefined) continue;
    // Loose comparison: SQLite hands back 1 where the form sends true.
    if (String(from ?? '') !== String(to ?? '')) diff[key] = { from: from ?? null, to: to ?? null };
  }
  return diff;
}

export type ActivityFilter = {
  userId?: number;
  action?: string;
  entityType?: string;
  entityId?: number;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
};

export function listActivity(filter: ActivityFilter = {}): ActivityLogRow[] {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filter.userId) { where.push('user_id = ?'); params.push(filter.userId); }
  if (filter.action) { where.push('action = ?'); params.push(filter.action); }
  if (filter.entityType) { where.push('entity_type = ?'); params.push(filter.entityType); }
  if (filter.entityId) { where.push('entity_id = ?'); params.push(filter.entityId); }
  if (filter.from) { where.push('created_at >= ?'); params.push(filter.from); }
  if (filter.to) { where.push('created_at <= ?'); params.push(filter.to); }
  if (filter.search) {
    where.push('(summary LIKE ? OR entity_label LIKE ? OR actor_label LIKE ?)');
    const like = `%${filter.search}%`;
    params.push(like, like, like);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(filter.limit ?? 50, filter.offset ?? 0);

  return all<ActivityLogRow>(
    `SELECT * FROM activity_logs ${clause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    params,
  );
}

export function countActivity(filter: ActivityFilter = {}): number {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.userId) { where.push('user_id = ?'); params.push(filter.userId); }
  if (filter.action) { where.push('action = ?'); params.push(filter.action); }
  if (filter.entityType) { where.push('entity_type = ?'); params.push(filter.entityType); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return scalar<number>(`SELECT COUNT(*) AS c FROM activity_logs ${clause}`, params, 0);
}

/** Distinct action values present in the log — powers the filter dropdown. */
export function listActivityActions(): string[] {
  return all<{ action: string }>(
    'SELECT DISTINCT action FROM activity_logs ORDER BY action',
  ).map((r) => r.action);
}

/** Retention: the audit trail is not meant to grow without bound. */
export function pruneActivity(olderThanDays = 365): number {
  const result = run(
    `DELETE FROM activity_logs WHERE created_at < datetime('now', ?)`,
    [`-${Math.max(1, olderThanDays)} days`],
  );
  return result.changes;
}
