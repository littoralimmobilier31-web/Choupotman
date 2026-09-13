'use client';

import * as React from 'react';
import Link from 'next/link';
import { ExternalLink, ListChecks, Loader2, Plus, Send, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea, Checkbox } from '@/components/ui/field';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useAction } from './use-resource-form';
import { formatRelative } from '@/lib/i18n/format';
import type { TaskStatus } from '@/lib/db/types';

/**
 * Task drawer and creation modal.
 *
 * Shared by the project hub and the global board, which is why the drawer can
 * work without being handed a stage list: on the global board a task may belong
 * to any project, so it loads that project's stages itself.
 */

export type TaskStage = {
  id: number;
  name: string;
  status: string;
  position: number;
  due_date: string | null;
  task_count: number;
  done_count: number;
};

type TaskDetail = {
  task: {
    id: number;
    title: string;
    description: string | null;
    status: TaskStatus;
    priority: string;
    due_date: string | null;
    estimate_hours: number | null;
    spent_hours: number;
    project_id: number | null;
    stage_id: number | null;
    assignee_id: number | null;
    project_title: string | null;
    stage_name: string | null;
  };
  checklist: { id: number; label: string; is_done: 0 | 1 }[];
  comments: { id: number; body: string; author_label: string | null; created_at: string }[];
};

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'todo', label: 'À faire' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'review', label: 'En revue' },
  { value: 'done', label: 'Terminé' },
  { value: 'blocked', label: 'Bloqué' },
];

const PRIORITY_OPTIONS = [
  { value: 'low', label: 'Basse' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'high', label: 'Haute' },
  { value: 'urgent', label: 'Urgente' },
];

export function TaskDrawer({
  csrf,
  taskId,
  stages,
  assignees,
  canUpdate,
  canDelete,
  onClose,
  onChanged,
}: {
  csrf: string;
  taskId: number;
  /** Omit on the global board: the drawer then loads the right project's stages. */
  stages?: TaskStage[];
  assignees: { id: number; label: string }[];
  canUpdate: boolean;
  canDelete: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const { run, busy } = useAction(csrf);
  const [detail, setDetail] = React.useState<TaskDetail | null>(null);
  const [loaded, setLoaded] = React.useState<TaskStage[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [checklistLabel, setChecklistLabel] = React.useState('');
  const [comment, setComment] = React.useState('');

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/taches/${taskId}`);
      if (response.ok) setDetail((await response.json()) as TaskDetail);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  React.useEffect(() => { load(); }, [load]);

  const task = detail?.task;
  const projectId = task?.project_id ?? null;

  // Only fetched when the caller did not supply the list (global board).
  React.useEffect(() => {
    if (stages !== undefined || projectId === null) return;
    let active = true;
    fetch(`/api/etapes?projet=${projectId}`)
      .then((response) => (response.ok ? response.json() : null))
      .then((payload: { items?: TaskStage[] } | null) => {
        if (active && payload?.items) setLoaded(payload.items);
      })
      .catch(() => { /* the stage select simply stays empty */ });
    return () => { active = false; };
  }, [stages, projectId]);

  const stageOptions = stages ?? loaded;

  const update = async (patch: Record<string, unknown>) => {
    await run(`/api/taches/${taskId}`, { method: 'PATCH', body: patch, silent: true });
    await load();
    onChanged?.();
  };

  const checklistDone = detail?.checklist.filter((item) => item.is_done === 1).length ?? 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={task?.title ?? 'Tâche'}
      description={[task?.project_title, task?.stage_name].filter(Boolean).join(' · ') || undefined}
      size="lg"
      footer={
        <>
          {canDelete && (
            <Button
              variant="ghost"
              className="me-auto text-danger hover:bg-danger-soft"
              onClick={() => setConfirmDelete(true)}
            >
              <Trash2 className="size-4" />
              Supprimer
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
        </>
      }
    >
      {loading && !task ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="size-5 animate-spin text-fg-subtle" />
        </div>
      ) : !task ? (
        <p className="py-8 text-center text-[0.8125rem] text-fg-muted">Tâche introuvable.</p>
      ) : (
        <div className="space-y-5">
          {/* On the global board the project is the useful next stop. */}
          {stages === undefined && projectId !== null && (
            <Link
              href={`/espace-admin/projets/${projectId}`}
              className="inline-flex items-center gap-1.5 text-[0.75rem] font-medium text-accent hover:underline"
            >
              <ExternalLink className="size-3.5" />
              Ouvrir le projet
            </Link>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Statut" htmlFor="td-status">
              <Select
                id="td-status"
                value={task.status}
                disabled={!canUpdate || busy}
                onChange={(event) => update({ status: event.target.value })}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Priorité" htmlFor="td-priority">
              <Select
                id="td-priority"
                value={task.priority}
                disabled={!canUpdate || busy}
                onChange={(event) => update({ priority: event.target.value })}
              >
                {PRIORITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
            </Field>
            {(stageOptions.length > 0 || task.stage_id !== null) && (
              <Field label="Étape" htmlFor="td-stage">
                <Select
                  id="td-stage"
                  value={task.stage_id ? String(task.stage_id) : ''}
                  disabled={!canUpdate || busy}
                  onChange={(event) => update({ stage_id: event.target.value ? Number(event.target.value) : null })}
                >
                  <option value="">Aucune</option>
                  {stageOptions.map((stage) => (
                    <option key={stage.id} value={stage.id}>
                      {stage.name}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field label="Responsable" htmlFor="td-assignee">
              <Select
                id="td-assignee"
                value={task.assignee_id ? String(task.assignee_id) : ''}
                disabled={!canUpdate || busy}
                onChange={(event) => update({ assignee_id: event.target.value ? Number(event.target.value) : null })}
              >
                <option value="">Non assignée</option>
                {assignees.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Échéance" htmlFor="td-due">
              <Input
                id="td-due"
                type="date"
                defaultValue={task.due_date ?? ''}
                disabled={!canUpdate || busy}
                onBlur={(event) => update({ due_date: event.target.value || null })}
              />
            </Field>
            <Field label="Temps passé (h)" htmlFor="td-spent">
              <Input
                id="td-spent"
                type="number"
                min={0}
                step="0.25"
                defaultValue={task.spent_hours}
                disabled={!canUpdate || busy}
                onBlur={(event) => update({ spent_hours: Number(event.target.value) || 0 })}
                className="tabular-nums"
              />
            </Field>
          </div>

          <Field label="Description" htmlFor="td-description">
            <Textarea
              id="td-description"
              rows={4}
              defaultValue={task.description ?? ''}
              disabled={!canUpdate || busy}
              maxLength={4000}
              onBlur={(event) => update({ description: event.target.value || null })}
            />
          </Field>

          {/* Checklist */}
          <div>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h4 className="flex items-center gap-2 text-[0.8125rem] font-semibold text-fg">
                <ListChecks className="size-4 text-fg-subtle" />
                Checklist
              </h4>
              {(detail?.checklist.length ?? 0) > 0 && (
                <span className="text-[0.6875rem] tabular-nums text-fg-subtle">
                  {checklistDone}/{detail?.checklist.length}
                </span>
              )}
            </div>

            <ul className="space-y-1.5">
              {detail?.checklist.map((item) => (
                <li key={item.id} className="flex items-center gap-2.5">
                  <Checkbox
                    checked={item.is_done === 1}
                    disabled={!canUpdate}
                    onChange={async (event) => {
                      await run(`/api/checklist/${item.id}`, {
                        method: 'PATCH',
                        body: { is_done: event.target.checked },
                        silent: true,
                      });
                      await load();
                    }}
                    aria-label={item.label}
                  />
                  <span className={cn('flex-1 text-[0.8125rem]', item.is_done === 1 ? 'text-fg-subtle line-through' : 'text-fg')}>
                    {item.label}
                  </span>
                  {canUpdate && (
                    <button
                      type="button"
                      onClick={async () => {
                        await run(`/api/checklist/${item.id}`, { method: 'DELETE', silent: true });
                        await load();
                      }}
                      aria-label={`Supprimer « ${item.label} »`}
                      className="rounded p-0.5 text-fg-subtle transition-colors hover:text-danger"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>

            {canUpdate && (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (checklistLabel.trim().length < 1) return;
                  await run('/api/checklist', {
                    method: 'POST',
                    body: { task_id: taskId, label: checklistLabel.trim() },
                    silent: true,
                  });
                  setChecklistLabel('');
                  await load();
                }}
                className="mt-2.5 flex gap-2"
              >
                <Input
                  value={checklistLabel}
                  onChange={(event) => setChecklistLabel(event.target.value)}
                  placeholder="Ajouter un point…"
                  maxLength={240}
                  aria-label="Nouveau point de checklist"
                  className="h-8 text-[0.8125rem]"
                />
                <Button type="submit" size="sm" variant="secondary" disabled={busy || checklistLabel.trim() === ''}>
                  <Plus className="size-3.5" />
                </Button>
              </form>
            )}
          </div>

          {/* Comments */}
          <div>
            <h4 className="mb-2 text-[0.8125rem] font-semibold text-fg">
              Commentaires {detail && detail.comments.length > 0 ? `(${detail.comments.length})` : ''}
            </h4>

            <ul className="space-y-2.5">
              {detail?.comments.map((item) => (
                <li key={item.id} className="rounded-lg bg-surface-sunken px-3 py-2.5">
                  <p className="whitespace-pre-line text-[0.8125rem] leading-relaxed text-fg">{item.body}</p>
                  <p className="mt-1.5 text-[0.625rem] text-fg-subtle">
                    {[item.author_label, formatRelative(item.created_at, 'fr')].filter(Boolean).join(' · ')}
                  </p>
                </li>
              ))}
              {detail?.comments.length === 0 && (
                <li className="text-[0.75rem] text-fg-subtle">Aucun commentaire.</li>
              )}
            </ul>

            {canUpdate && (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (comment.trim().length < 1) return;
                  await run('/api/commentaires', {
                    method: 'POST',
                    body: { task_id: taskId, body: comment.trim() },
                    silent: true,
                  });
                  setComment('');
                  await load();
                }}
                className="mt-2.5 flex gap-2"
              >
                <Textarea
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  rows={2}
                  placeholder="Écrire un commentaire…"
                  maxLength={4000}
                  aria-label="Nouveau commentaire"
                  className="text-[0.8125rem]"
                />
                <Button type="submit" size="sm" disabled={busy || comment.trim() === ''} className="self-end">
                  <Send className="size-3.5 rtl:-scale-x-100" />
                </Button>
              </form>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          await run(`/api/taches/${taskId}`, { method: 'DELETE', success: 'Tâche supprimée.' });
          onChanged?.();
          onClose();
        }}
        title="Supprimer cette tâche ?"
        message="La checklist, les commentaires et les pièces jointes associés seront également supprimés."
        confirmLabel="Supprimer"
      />
    </Modal>
  );
}

export function NewTaskModal({
  csrf,
  projectId,
  projects,
  stages = [],
  assignees,
  defaultStatus,
  onClose,
  onCreated,
}: {
  csrf: string;
  /** Fixed project (project hub), or null to let the user pick one. */
  projectId?: number | null;
  /** Offered when `projectId` is null — the global board. */
  projects?: { id: number; label: string }[];
  stages?: TaskStage[];
  assignees: { id: number; label: string }[];
  defaultStatus: TaskStatus;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const { run, busy } = useAction(csrf);
  const [values, setValues] = React.useState({
    title: '',
    description: '',
    status: defaultStatus,
    priority: 'medium',
    project_id: projectId ? String(projectId) : '',
    stage_id: '',
    assignee_id: '',
    due_date: '',
  });

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const pickProject = projectId === null || projectId === undefined;

  return (
    <Modal
      open
      onClose={onClose}
      title="Nouvelle tâche"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={busy || values.title.trim().length < 2}
            onClick={async () => {
              const result = await run('/api/taches', {
                method: 'POST',
                body: {
                  project_id: values.project_id ? Number(values.project_id) : null,
                  title: values.title.trim(),
                  description: values.description || null,
                  status: values.status,
                  priority: values.priority,
                  stage_id: values.stage_id ? Number(values.stage_id) : null,
                  assignee_id: values.assignee_id ? Number(values.assignee_id) : null,
                  due_date: values.due_date || null,
                },
                success: 'Tâche créée.',
              });
              if (result) {
                onCreated?.();
                onClose();
              }
            }}
          >
            Créer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Titre" required htmlFor="nt-title">
          <Input id="nt-title" value={values.title} onChange={(e) => set('title', e.target.value)} maxLength={200} autoFocus />
        </Field>
        <Field label="Description" htmlFor="nt-desc">
          <Textarea id="nt-desc" rows={3} value={values.description} onChange={(e) => set('description', e.target.value)} maxLength={4000} />
        </Field>

        {pickProject && (
          <Field
            label="Projet"
            htmlFor="nt-project"
            hint="Laissez vide pour une tâche personnelle, hors projet."
          >
            <Select id="nt-project" value={values.project_id} onChange={(e) => set('project_id', e.target.value)}>
              <option value="">Aucun projet</option>
              {(projects ?? []).map((project) => (
                <option key={project.id} value={project.id}>
                  {project.label}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Statut" htmlFor="nt-status">
            <Select id="nt-status" value={values.status} onChange={(e) => set('status', e.target.value as TaskStatus)}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priorité" htmlFor="nt-priority">
            <Select id="nt-priority" value={values.priority} onChange={(e) => set('priority', e.target.value)}>
              {PRIORITY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>
          {stages.length > 0 && (
            <Field label="Étape" htmlFor="nt-stage">
              <Select id="nt-stage" value={values.stage_id} onChange={(e) => set('stage_id', e.target.value)}>
                <option value="">Aucune</option>
                {stages.map((stage) => (
                  <option key={stage.id} value={stage.id}>
                    {stage.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}
          <Field label="Responsable" htmlFor="nt-assignee">
            <Select id="nt-assignee" value={values.assignee_id} onChange={(e) => set('assignee_id', e.target.value)}>
              <option value="">Non assignée</option>
              {assignees.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Échéance" htmlFor="nt-due" className="sm:col-span-2">
            <Input id="nt-due" type="date" value={values.due_date} onChange={(e) => set('due_date', e.target.value)} />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
