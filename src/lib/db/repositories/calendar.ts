import { all, one, run } from '../client';
import type { CalendarEventKind, CalendarEventRow } from '../types';

/**
 * Unified calendar.
 *
 * Only real events (meetings, reminders) live in `calendar_events`. Project
 * deliveries, task deadlines, invoice due dates, revision requests and
 * subscription renewals are *projected* from their source tables by
 * `getCalendarEntries`. Duplicating them into the calendar table would let the
 * two drift apart the first time someone changed a delivery date; projecting
 * them means the calendar is correct by construction.
 */

export type CalendarSource = 'event' | 'project' | 'task' | 'invoice' | 'revision' | 'subscription';

export type CalendarEntry = {
  id: string;
  source: CalendarSource;
  sourceId: number;
  title: string;
  description: string | null;
  kind: CalendarEventKind;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  url: string | null;
  color: string | null;
  projectId: number | null;
  clientId: number | null;
  /** True when the date is in the past and the item is still open. */
  overdue: boolean;
};

export const EVENT_KINDS: { key: CalendarEventKind; label: string; slot: number }[] = [
  { key: 'meeting', label: 'Réunion', slot: 0 },
  { key: 'delivery', label: 'Livraison', slot: 1 },
  { key: 'deadline', label: 'Deadline', slot: 3 },
  { key: 'task', label: 'Tâche', slot: 2 },
  { key: 'payment', label: 'Paiement', slot: 4 },
  { key: 'revision', label: 'Révision', slot: 5 },
  { key: 'reminder', label: 'Rappel', slot: 1 },
  { key: 'other', label: 'Autre', slot: 0 },
];

export function eventKindLabel(kind: string): string {
  return EVENT_KINDS.find((k) => k.key === kind)?.label ?? kind;
}

export function eventKindSlot(kind: string): number {
  return EVENT_KINDS.find((k) => k.key === kind)?.slot ?? 0;
}

// ── Stored events ────────────────────────────────────────────────────────

export function findEvent(id: number): CalendarEventRow | null {
  return one<CalendarEventRow>('SELECT * FROM calendar_events WHERE id = ?', [id]);
}

export function listEvents(range: { from: string; to: string }): CalendarEventRow[] {
  return all<CalendarEventRow>(
    `SELECT * FROM calendar_events
     WHERE status != 'cancelled' AND starts_at >= ? AND starts_at <= ?
     ORDER BY starts_at`,
    [range.from, range.to],
  );
}

export function createEvent(input: {
  title: string;
  description?: string | null;
  kind?: CalendarEventKind;
  startsAt: string;
  endsAt?: string | null;
  allDay?: boolean;
  location?: string | null;
  url?: string | null;
  clientId?: number | null;
  projectId?: number | null;
  taskId?: number | null;
  color?: string | null;
  isDemo?: boolean;
  createdBy?: number | null;
}): number {
  const result = run(
    `INSERT INTO calendar_events
      (title, description, kind, starts_at, ends_at, all_day, location, url,
       client_id, project_id, task_id, color, is_demo, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.title, input.description ?? null, input.kind ?? 'meeting', input.startsAt,
      input.endsAt ?? null, input.allDay ? 1 : 0, input.location ?? null, input.url ?? null,
      input.clientId ?? null, input.projectId ?? null, input.taskId ?? null,
      input.color ?? null, input.isDemo ? 1 : 0, input.createdBy ?? null,
    ],
  );
  return Number(result.lastInsertRowid);
}

export function updateEvent(
  id: number,
  patch: {
    title?: string; description?: string | null; kind?: CalendarEventKind;
    starts_at?: string; ends_at?: string | null; all_day?: boolean;
    location?: string | null; status?: CalendarEventRow['status']; color?: string | null;
    url?: string | null; client_id?: number | null; project_id?: number | null;
  },
): void {
  const map: Record<string, unknown> = {
    title: patch.title, description: patch.description, kind: patch.kind,
    starts_at: patch.starts_at, ends_at: patch.ends_at, location: patch.location,
    status: patch.status, color: patch.color, url: patch.url,
    client_id: patch.client_id, project_id: patch.project_id,
  };
  if (patch.all_day !== undefined) map.all_day = patch.all_day ? 1 : 0;
  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(value);
  }
  if (fields.length === 0) return;
  params.push(id);
  run(`UPDATE calendar_events SET ${fields.join(', ')} WHERE id = ?`, params);
}

export function deleteEvent(id: number): void {
  run('DELETE FROM calendar_events WHERE id = ?', [id]);
}

// ── Projection ───────────────────────────────────────────────────────────

/**
 * Everything happening in a date range, from every source, as one sorted list.
 * `from`/`to` are inclusive date strings (YYYY-MM-DD).
 */
export function getCalendarEntries(range: { from: string; to: string }): CalendarEntry[] {
  const today = new Date().toISOString().slice(0, 10);
  const entries: CalendarEntry[] = [];

  for (const event of listEvents({ from: range.from, to: `${range.to}T23:59:59.999Z` })) {
    entries.push({
      id: `event-${event.id}`,
      source: 'event',
      sourceId: event.id,
      title: event.title,
      description: event.description,
      kind: event.kind,
      startsAt: event.starts_at,
      endsAt: event.ends_at,
      allDay: event.all_day === 1,
      url: event.project_id ? `/espace-admin/projets/${event.project_id}` : '/espace-admin/calendrier',
      color: event.color,
      projectId: event.project_id,
      clientId: event.client_id,
      overdue: false,
    });
  }

  for (const project of all<{ id: number; title: string; delivery_date: string; status: string; client_id: number | null; color: string | null }>(
    `SELECT id, title, delivery_date, status, client_id, color FROM projects
     WHERE delivery_date IS NOT NULL AND delivery_date BETWEEN ? AND ?
       AND status NOT IN ('archived')`,
    [range.from, range.to],
  )) {
    entries.push({
      id: `project-${project.id}`,
      source: 'project',
      sourceId: project.id,
      title: `Livraison — ${project.title}`,
      description: null,
      kind: 'delivery',
      startsAt: `${project.delivery_date}T09:00:00.000Z`,
      endsAt: null,
      allDay: true,
      url: `/espace-admin/projets/${project.id}`,
      color: project.color,
      projectId: project.id,
      clientId: project.client_id,
      overdue: project.delivery_date < today && project.status !== 'completed',
    });
  }

  for (const task of all<{ id: number; title: string; due_date: string; status: string; project_id: number | null }>(
    `SELECT id, title, due_date, status, project_id FROM tasks
     WHERE due_date IS NOT NULL AND due_date BETWEEN ? AND ?`,
    [range.from, range.to],
  )) {
    entries.push({
      id: `task-${task.id}`,
      source: 'task',
      sourceId: task.id,
      title: task.title,
      description: null,
      kind: 'task',
      startsAt: `${task.due_date}T10:00:00.000Z`,
      endsAt: null,
      allDay: true,
      url: task.project_id ? `/espace-admin/projets/${task.project_id}?tache=${task.id}` : '/espace-admin/taches',
      color: null,
      projectId: task.project_id,
      clientId: null,
      overdue: task.due_date < today && task.status !== 'done',
    });
  }

  for (const invoice of all<{ id: number; number: string; due_date: string; status: string; balance_due: number; client_id: number | null; project_id: number | null }>(
    `SELECT id, number, due_date, status, balance_due, client_id, project_id FROM invoices
     WHERE due_date IS NOT NULL AND due_date BETWEEN ? AND ? AND status != 'cancelled'`,
    [range.from, range.to],
  )) {
    entries.push({
      id: `invoice-${invoice.id}`,
      source: 'invoice',
      sourceId: invoice.id,
      title: `Échéance ${invoice.number}`,
      description: null,
      kind: 'payment',
      startsAt: `${invoice.due_date}T12:00:00.000Z`,
      endsAt: null,
      allDay: true,
      url: `/espace-admin/factures/${invoice.id}`,
      color: null,
      projectId: invoice.project_id,
      clientId: invoice.client_id,
      overdue: invoice.due_date < today && invoice.balance_due > 0,
    });
  }

  for (const revision of all<{ id: number; index_number: number; project_id: number; requested_at: string; status: string; title: string | null }>(
    `SELECT id, index_number, project_id, requested_at, status, title FROM revisions
     WHERE date(requested_at) BETWEEN ? AND ?`,
    [range.from, range.to],
  )) {
    entries.push({
      id: `revision-${revision.id}`,
      source: 'revision',
      sourceId: revision.id,
      title: revision.title ?? `Révision #${revision.index_number}`,
      description: null,
      kind: 'revision',
      startsAt: revision.requested_at,
      endsAt: null,
      allDay: false,
      url: `/espace-admin/projets/${revision.project_id}`,
      color: null,
      projectId: revision.project_id,
      clientId: null,
      overdue: false,
    });
  }

  for (const sub of all<{ id: number; service_name: string; renewal_date: string; amount: number; currency: string }>(
    `SELECT id, service_name, renewal_date, amount, currency FROM subscriptions
     WHERE status = 'active' AND renewal_date IS NOT NULL AND renewal_date BETWEEN ? AND ?`,
    [range.from, range.to],
  )) {
    entries.push({
      id: `subscription-${sub.id}`,
      source: 'subscription',
      sourceId: sub.id,
      title: `Renouvellement — ${sub.service_name}`,
      description: `${sub.amount} ${sub.currency}`,
      kind: 'reminder',
      startsAt: `${sub.renewal_date}T08:00:00.000Z`,
      endsAt: null,
      allDay: true,
      url: '/espace-admin/abonnements',
      color: null,
      projectId: null,
      clientId: null,
      overdue: sub.renewal_date < today,
    });
  }

  return entries.sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/** Groups entries by YYYY-MM-DD for month and week grids. */
export function groupEntriesByDay(entries: CalendarEntry[]): Record<string, CalendarEntry[]> {
  const grouped: Record<string, CalendarEntry[]> = {};
  for (const entry of entries) {
    const key = entry.startsAt.slice(0, 10);
    (grouped[key] ??= []).push(entry);
  }
  return grouped;
}

/** Next N upcoming entries — the dashboard's "what's coming" panel. */
export function upcomingEntries(days = 14, limit = 12): CalendarEntry[] {
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
  return getCalendarEntries({ from, to }).slice(0, limit);
}

/** Anything already late — drives the red counters and the daily automation. */
export function overdueEntries(limit = 20): CalendarEntry[] {
  const from = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
  const to = new Date().toISOString().slice(0, 10);
  return getCalendarEntries({ from, to })
    .filter((e) => e.overdue)
    .slice(0, limit);
}
