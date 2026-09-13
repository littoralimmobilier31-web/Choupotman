'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle, CalendarDays, CheckSquare, GripVertical, MessageSquare,
  Paperclip, Plus, User,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/field';
import { Avatar } from '@/components/ui/misc';
import { formatShortDate } from '@/lib/i18n/format';
import { useAction } from './use-resource-form';
import type { Priority, TaskStatus } from '@/lib/db/types';

/**
 * Kanban board.
 *
 * Drag & drop uses the platform HTML5 API — no dependency, and it degrades
 * honestly: every card also carries a status `<select>`, which is the path used
 * on touch devices and by keyboard/screen-reader users, where dragging is not
 * available. Moves are optimistic and roll back if the request fails.
 */

export type KanbanTask = {
  id: number;
  title: string;
  status: TaskStatus;
  priority: Priority;
  position: number;
  due_date: string | null;
  project_id: number | null;
  project_title: string | null;
  stage_name: string | null;
  assignee_name: string | null;
  checklist_total: number;
  checklist_done: number;
  comment_count: number;
  file_count: number;
};

export type KanbanColumnData = {
  status: TaskStatus;
  label: string;
  tone: string;
  tasks: KanbanTask[];
};

const PRIORITY_TONES: Record<Priority, 'neutral' | 'info' | 'warning' | 'danger'> = {
  low: 'neutral', medium: 'info', high: 'warning', urgent: 'danger',
};

const PRIORITY_LABELS: Record<Priority, string> = {
  low: 'Basse', medium: 'Moyenne', high: 'Haute', urgent: 'Urgente',
};

const COLUMN_ACCENTS: Record<string, string> = {
  todo: 'border-t-ink-400',
  in_progress: 'border-t-accent',
  review: 'border-t-warning',
  done: 'border-t-success',
  blocked: 'border-t-danger',
};

export function Kanban({
  columns: initialColumns,
  csrf,
  canUpdate,
  canCreate,
  onAddTask,
  showProject = false,
  basePath,
}: {
  columns: KanbanColumnData[];
  csrf: string;
  canUpdate: boolean;
  canCreate: boolean;
  /** Called with the target column when "+" is pressed. */
  onAddTask?: (status: TaskStatus) => void;
  showProject?: boolean;
  /**
   * Where a card links. Given, every card points at `${basePath}?tache=<id>` so
   * the surrounding page opens its own drawer; omitted, a card belonging to a
   * project links to that project's hub.
   */
  basePath?: string;
}) {
  const { run } = useAction(csrf);
  const [columns, setColumns] = React.useState(initialColumns);
  const [dragging, setDragging] = React.useState<number | null>(null);
  const [dragOver, setDragOver] = React.useState<TaskStatus | null>(null);

  // Re-sync when the server sends new data (after a refresh).
  React.useEffect(() => setColumns(initialColumns), [initialColumns]);

  const move = React.useCallback(
    async (taskId: number, target: TaskStatus, position?: number) => {
      const source = columns.find((column) => column.tasks.some((task) => task.id === taskId));
      const task = source?.tasks.find((t) => t.id === taskId);
      if (!task || !source) return;
      if (source.status === target && position === undefined) return;

      const previous = columns;
      const index = position ?? (columns.find((c) => c.status === target)?.tasks.length ?? 0);

      // Optimistic move so the board feels immediate.
      setColumns((current) =>
        current.map((column) => {
          if (column.status === source.status) {
            return { ...column, tasks: column.tasks.filter((t) => t.id !== taskId) };
          }
          if (column.status === target) {
            const next = [...column.tasks];
            next.splice(index, 0, { ...task, status: target });
            return { ...column, tasks: next };
          }
          return column;
        }),
      );

      const result = await run(`/api/taches/${taskId}`, {
        method: 'PUT',
        body: { status: target, position: index },
        silent: true,
      });

      // The request failed: put the board back where it was.
      if (!result) setColumns(previous);
    },
    [columns, run],
  );

  return (
    <div className="hide-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
      {columns.map((column) => (
        <section
          key={column.status}
          className={cn(
            'flex w-[17.5rem] shrink-0 flex-col rounded-[var(--radius-card)] border border-line border-t-2 bg-surface-sunken/40',
            COLUMN_ACCENTS[column.status] ?? 'border-t-line-strong',
            dragOver === column.status && 'ring-2 ring-accent/40',
          )}
          onDragOver={(event) => {
            if (!canUpdate || dragging === null) return;
            event.preventDefault();
            setDragOver(column.status);
          }}
          onDragLeave={() => setDragOver((current) => (current === column.status ? null : current))}
          onDrop={(event) => {
            event.preventDefault();
            setDragOver(null);
            if (dragging !== null) move(dragging, column.status);
            setDragging(null);
          }}
        >
          <header className="flex items-center justify-between gap-2 px-3 py-2.5">
            <h3 className="flex items-center gap-2 text-[0.8125rem] font-semibold text-fg">
              {column.label}
              <span className="rounded-full bg-surface-raised px-1.5 py-0.5 text-[0.625rem] tabular-nums text-fg-subtle">
                {column.tasks.length}
              </span>
            </h3>
            {canCreate && onAddTask && (
              <button
                type="button"
                onClick={() => onAddTask(column.status)}
                aria-label={`Ajouter une tâche dans « ${column.label} »`}
                className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
              >
                <Plus className="size-3.5" />
              </button>
            )}
          </header>

          <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
            {column.tasks.length === 0 && (
              <p className="px-1 py-6 text-center text-[0.6875rem] text-fg-subtle">
                {canUpdate ? 'Déposez une tâche ici' : 'Aucune tâche'}
              </p>
            )}

            {column.tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                canUpdate={canUpdate}
                showProject={showProject}
                dragging={dragging === task.id}
                onDragStart={() => setDragging(task.id)}
                onDragEnd={() => { setDragging(null); setDragOver(null); }}
                onStatusChange={(next) => move(task.id, next)}
                columns={columns}
                basePath={basePath}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function TaskCard({
  task,
  canUpdate,
  showProject,
  dragging,
  onDragStart,
  onDragEnd,
  onStatusChange,
  columns,
  basePath,
}: {
  task: KanbanTask;
  canUpdate: boolean;
  showProject: boolean;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onStatusChange: (status: TaskStatus) => void;
  columns: KanbanColumnData[];
  basePath?: string;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const late = task.due_date !== null && task.due_date < today && task.status !== 'done';
  const href = basePath
    ? `${basePath}?tache=${task.id}`
    : task.project_id
      ? `/espace-admin/projets/${task.project_id}?tache=${task.id}`
      : `/espace-admin/taches?tache=${task.id}`;

  return (
    <article
      draggable={canUpdate}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(task.id));
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        'group rounded-lg border border-line bg-surface-raised p-3 shadow-soft transition-[opacity,box-shadow,transform]',
        canUpdate && 'cursor-grab active:cursor-grabbing hover:shadow-raised',
        dragging && 'opacity-40',
      )}
    >
      <div className="flex items-start gap-2">
        {canUpdate && (
          <GripVertical className="mt-0.5 size-3.5 shrink-0 text-line-strong opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
        )}
        <Link href={href} className="min-w-0 flex-1 text-[0.8125rem] font-medium leading-snug text-fg hover:text-accent">
          {task.title}
        </Link>
      </div>

      {showProject && task.project_title && (
        <p className="mt-1.5 truncate text-[0.625rem] text-fg-subtle">{task.project_title}</p>
      )}
      {!showProject && task.stage_name && (
        <p className="mt-1.5 truncate text-[0.625rem] text-fg-subtle">{task.stage_name}</p>
      )}

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <Badge tone={PRIORITY_TONES[task.priority]}>{PRIORITY_LABELS[task.priority]}</Badge>
        {task.due_date && (
          <Badge tone={late ? 'danger' : 'outline'}>
            {late ? <AlertTriangle className="size-3" /> : <CalendarDays className="size-3" />}
            {formatShortDate(task.due_date, 'fr')}
          </Badge>
        )}
      </div>

      {(task.checklist_total > 0 || task.comment_count > 0 || task.file_count > 0 || task.assignee_name) && (
        <div className="mt-2.5 flex items-center gap-3 border-t border-line pt-2 text-[0.625rem] text-fg-subtle">
          {task.checklist_total > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <CheckSquare className="size-3" />
              {task.checklist_done}/{task.checklist_total}
            </span>
          )}
          {task.comment_count > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <MessageSquare className="size-3" />
              {task.comment_count}
            </span>
          )}
          {task.file_count > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Paperclip className="size-3" />
              {task.file_count}
            </span>
          )}
          {task.assignee_name && (
            <span className="ms-auto inline-flex items-center gap-1" title={task.assignee_name}>
              <Avatar name={task.assignee_name} size={18} />
            </span>
          )}
        </div>
      )}

      {/* Accessible / touch fallback for moving between columns. */}
      {canUpdate && (
        <Select
          value={task.status}
          onChange={(event) => onStatusChange(event.target.value as TaskStatus)}
          aria-label={`Changer le statut de « ${task.title} »`}
          className="mt-2 h-7 text-[0.6875rem] lg:hidden"
        >
          {columns.map((column) => (
            <option key={column.status} value={column.status}>
              {column.label}
            </option>
          ))}
        </Select>
      )}
    </article>
  );
}

/** Inline "new task" row used above the board. */
export function QuickAddTask({
  csrf,
  projectId,
  stageId,
  defaultStatus = 'todo',
  onCreated,
}: {
  csrf: string;
  projectId?: number | null;
  stageId?: number | null;
  defaultStatus?: TaskStatus;
  onCreated?: () => void;
}) {
  const { run, busy } = useAction(csrf);
  const [title, setTitle] = React.useState('');
  const inputRef = React.useRef<HTMLInputElement>(null);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    const value = title.trim();
    if (value.length < 2 || busy) return;

    const result = await run('/api/taches', {
      method: 'POST',
      body: {
        title: value,
        project_id: projectId ?? null,
        stage_id: stageId ?? null,
        status: defaultStatus,
        priority: 'medium',
      },
      success: 'Tâche créée.',
    });

    if (result) {
      setTitle('');
      inputRef.current?.focus();
      onCreated?.();
    }
  }

  return (
    <form onSubmit={create} className="flex gap-2">
      <input
        ref={inputRef}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Ajouter une tâche…"
        maxLength={200}
        aria-label="Nouvelle tâche"
        className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface-raised px-3 text-[0.8125rem] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      />
      <Button type="submit" size="sm" disabled={busy || title.trim().length < 2}>
        <Plus className="size-3.5" />
        Ajouter
      </Button>
    </form>
  );
}

export { User };
