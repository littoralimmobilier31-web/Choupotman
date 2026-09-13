import { all, one, run, scalar, transaction } from '../client';
import type {
  ChecklistItemRow, FeedbackRow, Priority, ProjectEventKind, ProjectEventRow,
  ProjectRow, ProjectStageRow, ProjectStatus, RevisionRow, StageStatus,
  TaskCommentRow, TaskRow, TaskStatus,
} from '../types';
import { indexEntity, removeFromIndex } from './search';
import { slugify, toJson, percent } from '@/lib/utils';
import { money } from '@/lib/money';

/** Projects, stages, tasks, timeline, revisions and feedback. */

export const PROJECT_STATUSES: { key: ProjectStatus; label: string; tone: string }[] = [
  { key: 'prospect', label: 'Prospect', tone: 'neutral' },
  { key: 'planning', label: 'Planification', tone: 'info' },
  { key: 'in_progress', label: 'En cours', tone: 'brand' },
  { key: 'in_review', label: 'En révision', tone: 'warning' },
  { key: 'awaiting_client', label: 'En attente client', tone: 'warning' },
  { key: 'completed', label: 'Terminé', tone: 'success' },
  { key: 'archived', label: 'Archivé', tone: 'outline' },
];

export const ACTIVE_STATUSES: ProjectStatus[] = ['planning', 'in_progress', 'in_review', 'awaiting_client'];

export const TASK_STATUSES: { key: TaskStatus; label: string; tone: string }[] = [
  { key: 'todo', label: 'À faire', tone: 'neutral' },
  { key: 'in_progress', label: 'En cours', tone: 'brand' },
  { key: 'review', label: 'En revue', tone: 'warning' },
  { key: 'done', label: 'Terminé', tone: 'success' },
  { key: 'blocked', label: 'Bloqué', tone: 'danger' },
];

export const PRIORITIES: { key: Priority; label: string; tone: string }[] = [
  { key: 'low', label: 'Basse', tone: 'neutral' },
  { key: 'medium', label: 'Moyenne', tone: 'info' },
  { key: 'high', label: 'Haute', tone: 'warning' },
  { key: 'urgent', label: 'Urgente', tone: 'danger' },
];

/** Default stage names applied to a new project by the automation engine. */
export const DEFAULT_STAGES = ['Discovery', 'Planning', 'Design', 'Development', 'Testing', 'Revision', 'Delivery'];

export function projectStatusLabel(status: string): string {
  return PROJECT_STATUSES.find((s) => s.key === status)?.label ?? status;
}

export function taskStatusLabel(status: string): string {
  return TASK_STATUSES.find((s) => s.key === status)?.label ?? status;
}

export function priorityLabel(priority: string): string {
  return PRIORITIES.find((p) => p.key === priority)?.label ?? priority;
}

// ── Reference numbers ────────────────────────────────────────────────────

/**
 * Sequential per-year reference (PRJ-2026-0007).
 *
 * Derived from the highest existing number for the year rather than a counter
 * row, so it stays correct after a restore or a manual insert. Called inside the
 * creating transaction, which makes the read-then-write atomic.
 */
export function nextReference(prefix: string, table: string, column: string): string {
  const year = new Date().getFullYear();
  const like = `${prefix}-${year}-%`;
  const last = scalar<string | null>(
    `SELECT MAX(${column}) AS m FROM ${table} WHERE ${column} LIKE ?`,
    [like],
    null,
  );
  const lastSeq = last ? Number.parseInt(last.split('-').pop() ?? '0', 10) : 0;
  const next = Number.isFinite(lastSeq) ? lastSeq + 1 : 1;
  return `${prefix}-${year}-${String(next).padStart(4, '0')}`;
}

function uniqueProjectSlug(title: string): string {
  const base = slugify(title) || 'projet';
  let candidate = base;
  let n = 2;
  while (scalar<number>('SELECT COUNT(*) AS c FROM projects WHERE slug = ?', [candidate], 0) > 0) {
    candidate = `${base}-${n}`;
    n += 1;
  }
  return candidate;
}

// ── Projects ─────────────────────────────────────────────────────────────

export type ProjectWithClient = ProjectRow & {
  client_name: string | null;
  client_company: string | null;
  category_name: string | null;
  task_count: number;
  done_task_count: number;
  open_revision_count: number;
  invoiced_total: number;
  paid_total: number;
};

const PROJECT_SELECT = `
  SELECT p.*,
    c.name AS client_name,
    c.company AS client_company,
    cat.name AS category_name,
    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id) AS task_count,
    (SELECT COUNT(*) FROM tasks t WHERE t.project_id = p.id AND t.status = 'done') AS done_task_count,
    (SELECT COUNT(*) FROM revisions r WHERE r.project_id = p.id AND r.status IN ('open','in_progress')) AS open_revision_count,
    COALESCE((SELECT SUM(i.total) FROM invoices i WHERE i.project_id = p.id AND i.status != 'cancelled'), 0) AS invoiced_total,
    COALESCE((SELECT SUM(i.amount_paid) FROM invoices i WHERE i.project_id = p.id AND i.status != 'cancelled'), 0) AS paid_total
  FROM projects p
  LEFT JOIN clients c ON c.id = p.client_id
  LEFT JOIN categories cat ON cat.id = p.category_id
`;

export function findProject(id: number): ProjectWithClient | null {
  return one<ProjectWithClient>(`${PROJECT_SELECT} WHERE p.id = ?`, [id]);
}

export function findProjectBySlug(slug: string): ProjectWithClient | null {
  return one<ProjectWithClient>(`${PROJECT_SELECT} WHERE p.slug = ?`, [slug]);
}

export type ProjectFilter = {
  status?: ProjectStatus | 'all' | 'active';
  clientId?: number;
  categoryId?: number;
  priority?: Priority;
  search?: string;
  overdueOnly?: boolean;
  limit?: number;
  offset?: number;
  sort?: 'recent' | 'delivery' | 'budget' | 'title';
};

export function listProjects(filter: ProjectFilter = {}): ProjectWithClient[] {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filter.status === 'active') {
    where.push(`p.status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})`);
    params.push(...ACTIVE_STATUSES);
  } else if (filter.status && filter.status !== 'all') {
    where.push('p.status = ?');
    params.push(filter.status);
  } else if (!filter.status) {
    where.push("p.status != 'archived'");
  }

  if (filter.clientId) { where.push('p.client_id = ?'); params.push(filter.clientId); }
  if (filter.categoryId) { where.push('p.category_id = ?'); params.push(filter.categoryId); }
  if (filter.priority) { where.push('p.priority = ?'); params.push(filter.priority); }
  if (filter.overdueOnly) {
    where.push(`p.delivery_date IS NOT NULL AND p.delivery_date < date('now') AND p.status NOT IN ('completed','archived')`);
  }
  if (filter.search) {
    where.push('(p.title LIKE ? OR p.reference LIKE ? OR p.description LIKE ? OR c.name LIKE ?)');
    const like = `%${filter.search}%`;
    params.push(like, like, like, like);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const order =
    filter.sort === 'delivery' ? 'p.delivery_date IS NULL, p.delivery_date ASC'
    : filter.sort === 'budget' ? 'p.budget DESC'
    : filter.sort === 'title' ? 'p.title COLLATE NOCASE'
    : 'p.updated_at DESC';

  params.push(filter.limit ?? 100, filter.offset ?? 0);
  return all<ProjectWithClient>(`${PROJECT_SELECT} ${clause} ORDER BY ${order} LIMIT ? OFFSET ?`, params);
}

export function countProjects(filter: ProjectFilter = {}): number {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status === 'active') {
    where.push(`status IN (${ACTIVE_STATUSES.map(() => '?').join(',')})`);
    params.push(...ACTIVE_STATUSES);
  } else if (filter.status && filter.status !== 'all') {
    where.push('status = ?');
    params.push(filter.status);
  }
  if (filter.clientId) { where.push('client_id = ?'); params.push(filter.clientId); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return scalar<number>(`SELECT COUNT(*) AS c FROM projects ${clause}`, params, 0);
}

export type ProjectInput = {
  title: string;
  client_id?: number | null;
  category_id?: number | null;
  description?: string | null;
  status?: ProjectStatus;
  priority?: Priority;
  budget?: number;
  currency?: string;
  start_date?: string | null;
  delivery_date?: string | null;
  revisions_included?: number;
  revision_extra_cost?: number;
  notes?: string | null;
  color?: string | null;
  is_demo?: boolean;
  created_by?: number | null;
};

export function createProject(input: ProjectInput): number {
  return transaction(() => {
    const reference = nextReference('PRJ', 'projects', 'reference');
    const slug = uniqueProjectSlug(input.title);
    const result = run(
      `INSERT INTO projects
        (reference, title, slug, client_id, category_id, description, status, priority,
         budget, currency, start_date, delivery_date, revisions_included, revision_extra_cost,
         notes, color, is_demo, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        reference, input.title.trim(), slug, input.client_id ?? null, input.category_id ?? null,
        input.description ?? null, input.status ?? 'planning', input.priority ?? 'medium',
        money(input.budget ?? 0), input.currency ?? 'DZD', input.start_date ?? null,
        input.delivery_date ?? null, input.revisions_included ?? 3,
        money(input.revision_extra_cost ?? 0), input.notes ?? null, input.color ?? null,
        input.is_demo ? 1 : 0, input.created_by ?? null,
      ],
    );
    const id = Number(result.lastInsertRowid);
    reindexProject(id);
    return id;
  });
}

export function updateProject(id: number, patch: Partial<ProjectInput>): void {
  const map: Record<string, unknown> = {
    title: patch.title, client_id: patch.client_id, category_id: patch.category_id,
    description: patch.description, status: patch.status, priority: patch.priority,
    budget: patch.budget === undefined ? undefined : money(patch.budget),
    currency: patch.currency, start_date: patch.start_date, delivery_date: patch.delivery_date,
    revisions_included: patch.revisions_included,
    revision_extra_cost: patch.revision_extra_cost === undefined ? undefined : money(patch.revision_extra_cost),
    notes: patch.notes, color: patch.color,
  };

  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(value);
  }
  // Completion is a derived fact, not a free-form field.
  if (patch.status === 'completed') fields.push(`completed_at = COALESCE(completed_at, datetime('now'))`);
  if (patch.status && patch.status !== 'completed') fields.push('completed_at = NULL');

  if (fields.length === 0) return;
  params.push(id);
  run(`UPDATE projects SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params);
  reindexProject(id);
}

export function deleteProject(id: number): void {
  run('DELETE FROM projects WHERE id = ?', [id]);
  removeFromIndex('project', id);
}

function reindexProject(id: number): void {
  const project = findProject(id);
  if (!project) return;
  indexEntity({
    type: 'project',
    id,
    title: project.title,
    subtitle: [project.reference, project.client_name].filter(Boolean).join(' · '),
    body: [project.description, project.notes].filter(Boolean).join(' '),
    url: `/espace-admin/projets/${id}`,
  });
}

/**
 * Recomputes `progress` from task completion. Stored rather than derived on read
 * so lists and dashboards can sort and aggregate on it cheaply.
 */
export function recalcProjectProgress(projectId: number): number {
  const row = one<{ total: number; done: number }>(
    `SELECT COUNT(*) AS total, SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END) AS done
     FROM tasks WHERE project_id = ?`,
    [projectId],
  );
  const total = row?.total ?? 0;
  const done = row?.done ?? 0;
  const progress = total > 0 ? percent(done, total) : 0;
  run(`UPDATE projects SET progress = ?, updated_at = datetime('now') WHERE id = ?`, [progress, projectId]);
  return progress;
}

// ── Stages ───────────────────────────────────────────────────────────────

export function listStages(projectId: number): (ProjectStageRow & { task_count: number; done_count: number })[] {
  return all(
    `SELECT s.*,
       (SELECT COUNT(*) FROM tasks t WHERE t.stage_id = s.id) AS task_count,
       (SELECT COUNT(*) FROM tasks t WHERE t.stage_id = s.id AND t.status = 'done') AS done_count
     FROM project_stages s WHERE s.project_id = ? ORDER BY s.position, s.id`,
    [projectId],
  );
}

export function findStage(id: number): ProjectStageRow | null {
  return one<ProjectStageRow>('SELECT * FROM project_stages WHERE id = ?', [id]);
}

export function createStage(input: {
  projectId: number; name: string; description?: string | null;
  position?: number; dueDate?: string | null;
}): number {
  const position = input.position ?? (scalar<number>(
    'SELECT COALESCE(MAX(position), -1) + 1 AS p FROM project_stages WHERE project_id = ?',
    [input.projectId], 0,
  ));
  const result = run(
    `INSERT INTO project_stages (project_id, name, description, position, due_date)
     VALUES (?, ?, ?, ?, ?)`,
    [input.projectId, input.name, input.description ?? null, position, input.dueDate ?? null],
  );
  return Number(result.lastInsertRowid);
}

export function updateStage(
  id: number,
  patch: { name?: string; description?: string | null; status?: StageStatus; position?: number; due_date?: string | null },
): void {
  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(value);
  }
  if (patch.status === 'done') fields.push(`completed_at = COALESCE(completed_at, datetime('now'))`);
  if (patch.status === 'in_progress') fields.push(`started_at = COALESCE(started_at, datetime('now'))`);
  if (fields.length === 0) return;
  params.push(id);
  run(`UPDATE project_stages SET ${fields.join(', ')} WHERE id = ?`, params);
}

export function deleteStage(id: number): void {
  run('DELETE FROM project_stages WHERE id = ?', [id]);
}

/** Creates the default pipeline for a project, skipping any stage that exists. */
export function createDefaultStages(projectId: number, names: string[] = DEFAULT_STAGES): number {
  return transaction(() => {
    const existing = new Set(
      all<{ name: string }>('SELECT name FROM project_stages WHERE project_id = ?', [projectId]).map((r) => r.name),
    );
    let created = 0;
    names.forEach((name, index) => {
      if (existing.has(name)) return;
      run(
        'INSERT INTO project_stages (project_id, name, position) VALUES (?, ?, ?)',
        [projectId, name, index],
      );
      created += 1;
    });
    return created;
  });
}

// ── Tasks ────────────────────────────────────────────────────────────────

export type TaskWithMeta = TaskRow & {
  project_title: string | null;
  project_reference: string | null;
  stage_name: string | null;
  assignee_name: string | null;
  checklist_total: number;
  checklist_done: number;
  comment_count: number;
  file_count: number;
};

const TASK_SELECT = `
  SELECT t.*,
    p.title AS project_title,
    p.reference AS project_reference,
    s.name AS stage_name,
    COALESCE(u.full_name, u.username) AS assignee_name,
    (SELECT COUNT(*) FROM task_checklist_items ci WHERE ci.task_id = t.id) AS checklist_total,
    (SELECT COUNT(*) FROM task_checklist_items ci WHERE ci.task_id = t.id AND ci.is_done = 1) AS checklist_done,
    (SELECT COUNT(*) FROM task_comments tc WHERE tc.task_id = t.id) AS comment_count,
    (SELECT COUNT(*) FROM files f WHERE f.entity_type = 'task' AND f.entity_id = t.id) AS file_count
  FROM tasks t
  LEFT JOIN projects p ON p.id = t.project_id
  LEFT JOIN project_stages s ON s.id = t.stage_id
  LEFT JOIN users u ON u.id = t.assignee_id
`;

export function findTask(id: number): TaskWithMeta | null {
  return one<TaskWithMeta>(`${TASK_SELECT} WHERE t.id = ?`, [id]);
}

export type TaskFilter = {
  projectId?: number;
  stageId?: number;
  status?: TaskStatus | 'all' | 'open';
  assigneeId?: number;
  priority?: Priority;
  search?: string;
  dueBefore?: string;
  overdueOnly?: boolean;
  limit?: number;
  offset?: number;
};

export function listTasks(filter: TaskFilter = {}): TaskWithMeta[] {
  const where: string[] = [];
  const params: unknown[] = [];

  if (filter.projectId) { where.push('t.project_id = ?'); params.push(filter.projectId); }
  if (filter.stageId) { where.push('t.stage_id = ?'); params.push(filter.stageId); }
  if (filter.status === 'open') where.push("t.status != 'done'");
  else if (filter.status && filter.status !== 'all') { where.push('t.status = ?'); params.push(filter.status); }
  if (filter.assigneeId) { where.push('t.assignee_id = ?'); params.push(filter.assigneeId); }
  if (filter.priority) { where.push('t.priority = ?'); params.push(filter.priority); }
  if (filter.dueBefore) { where.push('t.due_date IS NOT NULL AND t.due_date <= ?'); params.push(filter.dueBefore); }
  if (filter.overdueOnly) where.push(`t.due_date IS NOT NULL AND t.due_date < date('now') AND t.status != 'done'`);
  if (filter.search) {
    where.push('(t.title LIKE ? OR t.description LIKE ?)');
    const like = `%${filter.search}%`;
    params.push(like, like);
  }

  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(filter.limit ?? 300, filter.offset ?? 0);

  return all<TaskWithMeta>(
    `${TASK_SELECT} ${clause}
     ORDER BY
       CASE t.status WHEN 'blocked' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'review' THEN 2 WHEN 'todo' THEN 3 ELSE 4 END,
       t.position, t.due_date IS NULL, t.due_date, t.id DESC
     LIMIT ? OFFSET ?`,
    params,
  );
}

export function countTasks(filter: TaskFilter = {}): number {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.projectId) { where.push('project_id = ?'); params.push(filter.projectId); }
  if (filter.status === 'open') where.push("status != 'done'");
  else if (filter.status && filter.status !== 'all') { where.push('status = ?'); params.push(filter.status); }
  if (filter.assigneeId) { where.push('assignee_id = ?'); params.push(filter.assigneeId); }
  if (filter.overdueOnly) where.push(`due_date IS NOT NULL AND due_date < date('now') AND status != 'done'`);
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return scalar<number>(`SELECT COUNT(*) AS c FROM tasks ${clause}`, params, 0);
}

export type TaskInput = {
  project_id?: number | null;
  stage_id?: number | null;
  title: string;
  description?: string | null;
  assignee_id?: number | null;
  priority?: Priority;
  status?: TaskStatus;
  due_date?: string | null;
  estimate_hours?: number | null;
  position?: number;
  is_demo?: boolean;
  created_by?: number | null;
};

export function createTask(input: TaskInput): number {
  const id = transaction(() => {
    const position = input.position ?? scalar<number>(
      'SELECT COALESCE(MAX(position), -1) + 1 AS p FROM tasks WHERE status = ? AND project_id IS ?',
      [input.status ?? 'todo', input.project_id ?? null], 0,
    );
    const result = run(
      `INSERT INTO tasks
        (project_id, stage_id, title, description, assignee_id, priority, status,
         due_date, estimate_hours, position, is_demo, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.project_id ?? null, input.stage_id ?? null, input.title.trim(),
        input.description ?? null, input.assignee_id ?? null, input.priority ?? 'medium',
        input.status ?? 'todo', input.due_date ?? null, input.estimate_hours ?? null,
        position, input.is_demo ? 1 : 0, input.created_by ?? null,
      ],
    );
    return Number(result.lastInsertRowid);
  });
  if (input.project_id) recalcProjectProgress(input.project_id);
  reindexTask(id);
  return id;
}

export function updateTask(id: number, patch: Partial<TaskInput> & { spent_hours?: number }): void {
  const existing = one<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id]);
  if (!existing) return;

  const fields: string[] = [];
  const params: unknown[] = [];
  const map: Record<string, unknown> = {
    project_id: patch.project_id, stage_id: patch.stage_id, title: patch.title,
    description: patch.description, assignee_id: patch.assignee_id, priority: patch.priority,
    status: patch.status, due_date: patch.due_date, estimate_hours: patch.estimate_hours,
    position: patch.position, spent_hours: patch.spent_hours,
  };
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(value);
  }
  if (patch.status === 'done') fields.push(`completed_at = COALESCE(completed_at, datetime('now'))`);
  if (patch.status === 'in_progress') fields.push(`started_at = COALESCE(started_at, datetime('now'))`);
  if (patch.status && patch.status !== 'done') fields.push('completed_at = NULL');

  if (fields.length === 0) return;
  params.push(id);
  run(`UPDATE tasks SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params);

  const projectId = patch.project_id ?? existing.project_id;
  if (projectId) recalcProjectProgress(projectId);
  reindexTask(id);
}

/** Kanban drag & drop: sets the column and the order within it atomically. */
export function moveTask(id: number, status: TaskStatus, position: number): void {
  const task = one<TaskRow>('SELECT * FROM tasks WHERE id = ?', [id]);
  if (!task) return;

  transaction(() => {
    // Make room at the target index, then drop the task in.
    run(
      `UPDATE tasks SET position = position + 1
       WHERE status = ? AND position >= ? AND id != ? AND project_id IS ?`,
      [status, position, id, task.project_id ?? null],
    );
    const extra =
      status === 'done'
        ? `, completed_at = COALESCE(completed_at, datetime('now'))`
        : `, completed_at = NULL`;
    run(
      `UPDATE tasks SET status = ?, position = ?, updated_at = datetime('now')${extra} WHERE id = ?`,
      [status, position, id],
    );
  });

  if (task.project_id) recalcProjectProgress(task.project_id);
}

export function deleteTask(id: number): void {
  const task = one<TaskRow>('SELECT project_id FROM tasks WHERE id = ?', [id]);
  run('DELETE FROM tasks WHERE id = ?', [id]);
  removeFromIndex('task', id);
  if (task?.project_id) recalcProjectProgress(task.project_id);
}

function reindexTask(id: number): void {
  const task = findTask(id);
  if (!task) return;
  indexEntity({
    type: 'task',
    id,
    title: task.title,
    subtitle: [task.project_title, taskStatusLabel(task.status)].filter(Boolean).join(' · '),
    body: task.description,
    url: task.project_id ? `/espace-admin/projets/${task.project_id}?tache=${id}` : `/espace-admin/taches?tache=${id}`,
  });
}

/** Kanban board grouped by status. */
export type KanbanColumn = { status: TaskStatus; label: string; tone: string; tasks: TaskWithMeta[] };

export function getKanban(filter: TaskFilter = {}): KanbanColumn[] {
  const tasks = listTasks({ ...filter, status: 'all', limit: 500 });
  return TASK_STATUSES.map((status) => ({
    status: status.key,
    label: status.label,
    tone: status.tone,
    tasks: tasks
      .filter((t) => t.status === status.key)
      .sort((a, b) => a.position - b.position || a.id - b.id),
  }));
}

// ── Checklist & comments ─────────────────────────────────────────────────

export function listChecklist(taskId: number): ChecklistItemRow[] {
  return all<ChecklistItemRow>(
    'SELECT * FROM task_checklist_items WHERE task_id = ? ORDER BY position, id',
    [taskId],
  );
}

export function addChecklistItem(taskId: number, label: string): number {
  const position = scalar<number>(
    'SELECT COALESCE(MAX(position), -1) + 1 AS p FROM task_checklist_items WHERE task_id = ?',
    [taskId], 0,
  );
  const result = run(
    'INSERT INTO task_checklist_items (task_id, label, position) VALUES (?, ?, ?)',
    [taskId, label, position],
  );
  return Number(result.lastInsertRowid);
}

export function findChecklistItem(id: number): ChecklistItemRow | null {
  return one<ChecklistItemRow>('SELECT * FROM task_checklist_items WHERE id = ?', [id]);
}

export function toggleChecklistItem(id: number, done: boolean): void {
  run('UPDATE task_checklist_items SET is_done = ? WHERE id = ?', [done ? 1 : 0, id]);
}

export function renameChecklistItem(id: number, label: string): void {
  run('UPDATE task_checklist_items SET label = ? WHERE id = ?', [label, id]);
}

export function findTaskComment(id: number): TaskCommentRow | null {
  return one<TaskCommentRow>('SELECT * FROM task_comments WHERE id = ?', [id]);
}

export function deleteChecklistItem(id: number): void {
  run('DELETE FROM task_checklist_items WHERE id = ?', [id]);
}

export function listTaskComments(taskId: number): TaskCommentRow[] {
  return all<TaskCommentRow>(
    'SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at',
    [taskId],
  );
}

export function addTaskComment(input: {
  taskId: number; body: string; userId?: number | null; authorLabel?: string | null;
}): number {
  const result = run(
    'INSERT INTO task_comments (task_id, user_id, author_label, body) VALUES (?, ?, ?, ?)',
    [input.taskId, input.userId ?? null, input.authorLabel ?? null, input.body],
  );
  return Number(result.lastInsertRowid);
}

export function deleteTaskComment(id: number): void {
  run('DELETE FROM task_comments WHERE id = ?', [id]);
}

// ── Timeline ─────────────────────────────────────────────────────────────

export function addProjectEvent(input: {
  projectId: number;
  kind: ProjectEventKind;
  title: string;
  body?: string | null;
  actorLabel?: string | null;
  metadata?: unknown;
  entityType?: string | null;
  entityId?: number | null;
}): number {
  const result = run(
    `INSERT INTO project_events
      (project_id, kind, title, body, actor_label, metadata, entity_type, entity_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.projectId, input.kind, input.title, input.body ?? null, input.actorLabel ?? null,
      input.metadata === undefined ? null : toJson(input.metadata),
      input.entityType ?? null, input.entityId ?? null,
    ],
  );
  return Number(result.lastInsertRowid);
}

export function listProjectEvents(projectId: number, limit = 100): ProjectEventRow[] {
  return all<ProjectEventRow>(
    'SELECT * FROM project_events WHERE project_id = ? ORDER BY created_at DESC, id DESC LIMIT ?',
    [projectId, limit],
  );
}

// ── Revisions ────────────────────────────────────────────────────────────

export type RevisionSummary = {
  used: number;
  included: number;
  remaining: number;
  extras: number;
  extraCostTotal: number;
  overLimit: boolean;
};

export function getRevisionSummary(projectId: number): RevisionSummary {
  const project = one<Pick<ProjectRow, 'revisions_included'>>(
    'SELECT revisions_included FROM projects WHERE id = ?',
    [projectId],
  );
  const included = project?.revisions_included ?? 0;
  const row = one<{ used: number; extras: number; cost: number }>(
    `SELECT COUNT(*) AS used,
            SUM(CASE WHEN is_extra = 1 THEN 1 ELSE 0 END) AS extras,
            COALESCE(SUM(extra_cost), 0) AS cost
     FROM revisions WHERE project_id = ? AND status != 'rejected'`,
    [projectId],
  );
  const used = row?.used ?? 0;
  return {
    used,
    included,
    remaining: Math.max(0, included - used),
    extras: row?.extras ?? 0,
    extraCostTotal: money(row?.cost ?? 0),
    overLimit: used > included,
  };
}

export function listRevisions(projectId: number): RevisionRow[] {
  return all<RevisionRow>(
    'SELECT * FROM revisions WHERE project_id = ? ORDER BY index_number DESC',
    [projectId],
  );
}

export type RevisionWithMeta = RevisionRow & {
  project_title: string | null;
  project_reference: string | null;
  client_id: number | null;
  client_name: string | null;
  client_company: string | null;
  invoice_number: string | null;
};

/** Cross-project revision list, for the global "Révisions" screen. */
export function listRevisionsAcross(
  filter: { status?: string; projectId?: number; extraOnly?: boolean; unbilledOnly?: boolean; limit?: number } = {},
): RevisionWithMeta[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status && filter.status !== 'all') { where.push('r.status = ?'); params.push(filter.status); }
  if (filter.projectId) { where.push('r.project_id = ?'); params.push(filter.projectId); }
  if (filter.extraOnly) where.push('r.is_extra = 1');
  // Billable overflow that has not been invoiced yet: the money left on the table.
  if (filter.unbilledOnly) where.push('r.is_extra = 1 AND r.extra_cost > 0 AND r.extra_invoice_id IS NULL');
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(filter.limit ?? 200);

  return all<RevisionWithMeta>(
    `SELECT r.*,
       p.title AS project_title, p.reference AS project_reference,
       p.client_id AS client_id,
       c.name AS client_name, c.company AS client_company,
       i.number AS invoice_number
     FROM revisions r
     LEFT JOIN projects p ON p.id = r.project_id
     LEFT JOIN clients c ON c.id = p.client_id
     LEFT JOIN invoices i ON i.id = r.extra_invoice_id
     ${clause}
     ORDER BY r.created_at DESC, r.id DESC
     LIMIT ?`,
    params,
  );
}

export function countRevisions(filter: { status?: string; extraOnly?: boolean; unbilledOnly?: boolean } = {}): number {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status && filter.status !== 'all') { where.push('status = ?'); params.push(filter.status); }
  if (filter.extraOnly) where.push('is_extra = 1');
  if (filter.unbilledOnly) where.push('is_extra = 1 AND extra_cost > 0 AND extra_invoice_id IS NULL');
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return scalar<number>(`SELECT COUNT(*) AS c FROM revisions ${clause}`, params, 0);
}

/**
 * Records a revision and decides whether it exceeds the project's allowance.
 *
 * The counter and the is_extra decision are made in one transaction so two
 * concurrent requests cannot both claim the last included revision.
 */
export function createRevision(input: {
  projectId: number;
  title?: string | null;
  description?: string | null;
  requestedBy?: string | null;
  extraCostOverride?: number | null;
  isDemo?: boolean;
}): { id: number; indexNumber: number; isExtra: boolean; extraCost: number } {
  return transaction(() => {
    const project = one<Pick<ProjectRow, 'revisions_included' | 'revision_extra_cost' | 'currency'>>(
      'SELECT revisions_included, revision_extra_cost, currency FROM projects WHERE id = ?',
      [input.projectId],
    );
    const included = project?.revisions_included ?? 0;

    const used = scalar<number>(
      `SELECT COUNT(*) AS c FROM revisions WHERE project_id = ? AND status != 'rejected'`,
      [input.projectId], 0,
    );
    const indexNumber = used + 1;
    const isExtra = indexNumber > included;
    const extraCost = isExtra
      ? money(input.extraCostOverride ?? project?.revision_extra_cost ?? 0)
      : 0;

    const result = run(
      `INSERT INTO revisions
        (project_id, index_number, title, description, requested_by, is_extra, extra_cost, currency, is_demo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.projectId, indexNumber, input.title ?? `Révision #${indexNumber}`,
        input.description ?? null, input.requestedBy ?? 'client', isExtra ? 1 : 0,
        extraCost, project?.currency ?? 'DZD', input.isDemo ? 1 : 0,
      ],
    );

    return { id: Number(result.lastInsertRowid), indexNumber, isExtra, extraCost };
  });
}

export function updateRevision(
  id: number,
  patch: { status?: RevisionRow['status']; title?: string | null; description?: string | null; extra_cost?: number; extra_invoice_id?: number | null },
): void {
  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(key === 'extra_cost' ? money(Number(value)) : value);
  }
  if (patch.status === 'done') fields.push(`completed_at = COALESCE(completed_at, datetime('now'))`);
  if (fields.length === 0) return;
  params.push(id);
  run(`UPDATE revisions SET ${fields.join(', ')} WHERE id = ?`, params);
}

export function findRevision(id: number): RevisionRow | null {
  return one<RevisionRow>('SELECT * FROM revisions WHERE id = ?', [id]);
}

export function deleteRevision(id: number): void {
  run('DELETE FROM revisions WHERE id = ?', [id]);
}

// ── Feedback ─────────────────────────────────────────────────────────────

export function listFeedback(filter: { projectId?: number; status?: string; limit?: number } = {}): FeedbackRow[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.projectId) { where.push('project_id = ?'); params.push(filter.projectId); }
  if (filter.status) { where.push('status = ?'); params.push(filter.status); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(filter.limit ?? 100);
  return all<FeedbackRow>(
    `SELECT * FROM feedback ${clause} ORDER BY created_at DESC LIMIT ?`,
    params,
  );
}

export type FeedbackWithMeta = FeedbackRow & {
  project_title: string | null;
  project_reference: string | null;
  client_name: string | null;
  client_company: string | null;
  stage_name: string | null;
  task_title: string | null;
};

/** Cross-project feedback list, for the global "Feedback" screen. */
export function listFeedbackWithMeta(
  filter: { projectId?: number; clientId?: number; status?: string; decision?: string; limit?: number } = {},
): FeedbackWithMeta[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.projectId) { where.push('f.project_id = ?'); params.push(filter.projectId); }
  if (filter.clientId) { where.push('f.client_id = ?'); params.push(filter.clientId); }
  if (filter.status && filter.status !== 'all') { where.push('f.status = ?'); params.push(filter.status); }
  if (filter.decision) { where.push('f.decision = ?'); params.push(filter.decision); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(filter.limit ?? 200);

  return all<FeedbackWithMeta>(
    `SELECT f.*,
       p.title AS project_title, p.reference AS project_reference,
       c.name AS client_name, c.company AS client_company,
       s.name AS stage_name, t.title AS task_title
     FROM feedback f
     LEFT JOIN projects p ON p.id = f.project_id
     LEFT JOIN clients c ON c.id = f.client_id
     LEFT JOIN project_stages s ON s.id = f.stage_id
     LEFT JOIN tasks t ON t.id = f.task_id
     ${clause}
     ORDER BY f.created_at DESC, f.id DESC
     LIMIT ?`,
    params,
  );
}

export function countFeedback(filter: { status?: string; decision?: string } = {}): number {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.status && filter.status !== 'all') { where.push('status = ?'); params.push(filter.status); }
  if (filter.decision) { where.push('decision = ?'); params.push(filter.decision); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return scalar<number>(`SELECT COUNT(*) AS c FROM feedback ${clause}`, params, 0);
}

export function createFeedback(input: {
  projectId: number;
  clientId?: number | null;
  stageId?: number | null;
  taskId?: number | null;
  authorLabel?: string | null;
  comment?: string | null;
  rating?: number | null;
  decision?: FeedbackRow['decision'];
  source?: string;
  isDemo?: boolean;
}): number {
  const result = run(
    `INSERT INTO feedback
      (project_id, client_id, stage_id, task_id, author_label, comment, rating, decision, source, is_demo)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.projectId, input.clientId ?? null, input.stageId ?? null, input.taskId ?? null,
      input.authorLabel ?? null, input.comment ?? null, input.rating ?? null,
      input.decision ?? 'comment', input.source ?? 'portal', input.isDemo ? 1 : 0,
    ],
  );
  return Number(result.lastInsertRowid);
}

export function resolveFeedback(id: number): void {
  run(`UPDATE feedback SET status = 'resolved', resolved_at = datetime('now') WHERE id = ?`, [id]);
}

export function acknowledgeFeedback(id: number): void {
  run(`UPDATE feedback SET status = 'acknowledged' WHERE id = ?`, [id]);
}

export function findFeedback(id: number): FeedbackRow | null {
  return one<FeedbackRow>('SELECT * FROM feedback WHERE id = ?', [id]);
}

/** Options list for project pickers. */
export function projectOptions(): { id: number; label: string; currency: string; client_id: number | null }[] {
  return all<{ id: number; title: string; reference: string; currency: string; client_id: number | null }>(
    `SELECT id, title, reference, currency, client_id FROM projects
     WHERE status != 'archived' ORDER BY updated_at DESC`,
  ).map((r) => ({ id: r.id, label: `${r.reference} — ${r.title}`, currency: r.currency, client_id: r.client_id }));
}
