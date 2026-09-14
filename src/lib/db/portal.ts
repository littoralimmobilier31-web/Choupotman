import 'server-only';
import { all, one } from '@/lib/db/client';
import type {
  ClientRow, ClientUserRow, FileRow, InvoiceRow, ProjectEventRow, ProjectRow, QuoteRow,
} from '@/lib/db/types';

/**
 * Every read the client portal is allowed to make.
 *
 * The portal's one security property is that a signed-in client sees their own
 * data and nothing else. Enforcing that at each call site would mean getting it
 * right dozens of times; enforcing it here means getting it right once. Every
 * function in this file takes the `client_id` as its first argument and every
 * query filters on it — there is no unscoped variant to reach for by mistake.
 *
 * Files are stricter still: only those explicitly marked client-visible are
 * returned, so internal working files never leak through a project the client
 * legitimately owns.
 */

export function portalClient(clientId: number): ClientRow | null {
  return one<ClientRow>('SELECT * FROM clients WHERE id = ?', [clientId]);
}

export type PortalProject = ProjectRow & {
  task_count: number;
  done_count: number;
  open_revisions: number;
};

export function portalProjects(clientId: number): PortalProject[] {
  return all<PortalProject>(
    `SELECT p.*,
       (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
       (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS done_count,
       (SELECT COUNT(*) FROM revisions r WHERE r.project_id = p.id AND r.status IN ('open','in_progress')) AS open_revisions
     FROM projects p
     WHERE p.client_id = ? AND p.status != 'prospect'
     ORDER BY
       CASE p.status WHEN 'in_progress' THEN 0 WHEN 'in_review' THEN 1 WHEN 'awaiting_client' THEN 2
                     WHEN 'planning' THEN 3 WHEN 'completed' THEN 4 ELSE 5 END,
       p.delivery_date IS NULL, p.delivery_date, p.id DESC`,
    [clientId],
  );
}

export function portalProject(clientId: number, projectId: number): PortalProject | null {
  return one<PortalProject>(
    `SELECT p.*,
       (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
       (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS done_count,
       (SELECT COUNT(*) FROM revisions r WHERE r.project_id = p.id AND r.status IN ('open','in_progress')) AS open_revisions
     FROM projects p
     WHERE p.id = ? AND p.client_id = ? AND p.status != 'prospect'`,
    [projectId, clientId],
  );
}

/**
 * Stages, not tasks.
 *
 * A client wants to know where the project stands, not to read the internal
 * task list — which carries notes, estimates and assignees that are none of
 * their business. Progress per stage answers the question without exposing it.
 */
export function portalStages(clientId: number, projectId: number): {
  id: number; name: string; status: string; position: number;
  due_date: string | null; task_count: number; done_count: number;
}[] {
  return all(
    `SELECT s.id, s.name, s.status, s.position, s.due_date,
       (SELECT COUNT(*) FROM tasks t WHERE t.stage_id = s.id) AS task_count,
       (SELECT COUNT(*) FROM tasks t WHERE t.stage_id = s.id AND t.status = 'done') AS done_count
     FROM project_stages s
     JOIN projects p ON p.id = s.project_id
     WHERE s.project_id = ? AND p.client_id = ?
     ORDER BY s.position, s.id`,
    [projectId, clientId],
  );
}

/**
 * The client-facing timeline.
 *
 * Internal event kinds are excluded rather than filtered by hand at the call
 * site: a client sees milestones, deliveries, their own feedback and their
 * invoices — not task churn or AI notes.
 */
const CLIENT_EVENT_KINDS = ['created', 'status', 'stage', 'feedback', 'revision', 'invoice', 'payment', 'brief', 'quote', 'contract'];

export function portalTimeline(clientId: number, projectId: number, limit = 60): ProjectEventRow[] {
  return all<ProjectEventRow>(
    `SELECT e.* FROM project_events e
     JOIN projects p ON p.id = e.project_id
     WHERE e.project_id = ? AND p.client_id = ?
       AND e.kind IN (${CLIENT_EVENT_KINDS.map(() => '?').join(',')})
     ORDER BY e.created_at DESC, e.id DESC
     LIMIT ?`,
    [projectId, clientId, ...CLIENT_EVENT_KINDS, limit],
  );
}

export type PortalInvoice = InvoiceRow & { project_title: string | null };

export function portalInvoices(clientId: number): PortalInvoice[] {
  return all<PortalInvoice>(
    `SELECT i.*, p.title AS project_title
     FROM invoices i
     LEFT JOIN projects p ON p.id = i.project_id
     WHERE i.client_id = ? AND i.status != 'draft'
     ORDER BY i.issue_date DESC, i.id DESC`,
    [clientId],
  );
}

export function portalInvoice(clientId: number, invoiceId: number): PortalInvoice | null {
  return one<PortalInvoice>(
    `SELECT i.*, p.title AS project_title
     FROM invoices i
     LEFT JOIN projects p ON p.id = i.project_id
     WHERE i.id = ? AND i.client_id = ? AND i.status != 'draft'`,
    [invoiceId, clientId],
  );
}

export type PortalQuote = QuoteRow & { project_title: string | null };

export function portalQuotes(clientId: number): PortalQuote[] {
  return all<PortalQuote>(
    `SELECT q.*, p.title AS project_title
     FROM quotes q
     LEFT JOIN projects p ON p.id = q.project_id
     WHERE q.client_id = ? AND q.status NOT IN ('draft','archived')
     ORDER BY q.issue_date DESC, q.id DESC`,
    [clientId],
  );
}

export function portalQuote(clientId: number, quoteId: number): PortalQuote | null {
  return one<PortalQuote>(
    `SELECT q.*, p.title AS project_title
     FROM quotes q
     LEFT JOIN projects p ON p.id = q.project_id
     WHERE q.id = ? AND q.client_id = ? AND q.status NOT IN ('draft','archived')`,
    [quoteId, clientId],
  );
}

export type PortalFile = FileRow & { project_title: string | null; folder_name: string | null };

/**
 * Only files explicitly marked visible to the client.
 *
 * A file reaches the client two ways: attached to them directly, or attached to
 * one of their projects. Both sides of that test compare against the *caller's*
 * client id — comparing the file's client to its project's client would be true
 * for everyone's files and would leak the lot.
 */
const FILE_SCOPE = 'f.is_client_visible = 1 AND (f.client_id = ? OR p.client_id = ?)';

export function portalFiles(clientId: number, projectId?: number): PortalFile[] {
  const params: unknown[] = [clientId, clientId];
  let projectClause = '';
  if (projectId) {
    projectClause = 'AND f.project_id = ?';
    params.push(projectId);
  }

  return all<PortalFile>(
    `SELECT f.*, p.title AS project_title, fo.name AS folder_name
     FROM files f
     LEFT JOIN projects p ON p.id = f.project_id
     LEFT JOIN file_folders fo ON fo.id = f.folder_id
     WHERE ${FILE_SCOPE} ${projectClause}
     ORDER BY f.created_at DESC`,
    params,
  );
}

export function portalFile(clientId: number, fileId: number): PortalFile | null {
  return one<PortalFile>(
    `SELECT f.*, p.title AS project_title, fo.name AS folder_name
     FROM files f
     LEFT JOIN projects p ON p.id = f.project_id
     LEFT JOIN file_folders fo ON fo.id = f.folder_id
     WHERE f.id = ? AND ${FILE_SCOPE}`,
    [fileId, clientId, clientId],
  );
}

export function portalRevisions(clientId: number, projectId: number) {
  return all<{
    id: number; index_number: number; title: string | null; description: string | null;
    status: string; is_extra: 0 | 1; extra_cost: number; currency: string; created_at: string;
  }>(
    `SELECT r.id, r.index_number, r.title, r.description, r.status, r.is_extra,
            r.extra_cost, r.currency, r.created_at
     FROM revisions r
     JOIN projects p ON p.id = r.project_id
     WHERE r.project_id = ? AND p.client_id = ?
     ORDER BY r.index_number DESC`,
    [projectId, clientId],
  );
}

export function portalFeedback(clientId: number, projectId: number) {
  return all<{
    id: number; comment: string | null; rating: number | null; decision: string;
    status: string; author_label: string | null; created_at: string;
  }>(
    `SELECT f.id, f.comment, f.rating, f.decision, f.status, f.author_label, f.created_at
     FROM feedback f
     JOIN projects p ON p.id = f.project_id
     WHERE f.project_id = ? AND p.client_id = ?
     ORDER BY f.created_at DESC
     LIMIT 50`,
    [projectId, clientId],
  );
}

/** Headline numbers for the portal home. */
export function portalSummary(clientId: number): {
  activeProjects: number;
  completedProjects: number;
  outstanding: number;
  overdueCount: number;
  currency: string;
  awaitingClient: number;
} {
  const projects = portalProjects(clientId);
  const invoices = portalInvoices(clientId).filter((invoice) => invoice.status !== 'cancelled');
  const client = portalClient(clientId);
  const today = new Date().toISOString().slice(0, 10);

  return {
    activeProjects: projects.filter((p) => !['completed', 'archived'].includes(p.status)).length,
    completedProjects: projects.filter((p) => p.status === 'completed').length,
    outstanding: Math.round(invoices.reduce((acc, i) => acc + i.balance_due, 0) * 100) / 100,
    overdueCount: invoices.filter(
      (invoice) => invoice.balance_due > 0 && invoice.due_date !== null && invoice.due_date < today,
    ).length,
    currency: client?.currency ?? 'DZD',
    awaitingClient: projects.filter((p) => p.status === 'awaiting_client').length,
  };
}

export function portalDisplayName(clientUser: ClientUserRow, client: ClientRow | null): string {
  return clientUser.full_name ?? client?.company ?? client?.name ?? clientUser.email;
}
