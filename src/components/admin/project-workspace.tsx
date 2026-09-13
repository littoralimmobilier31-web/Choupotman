'use client';

import * as React from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Circle, Loader2, Plus, Sparkles, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { SegmentTabs } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/misc';
import { Kanban, QuickAddTask, type KanbanColumnData } from './kanban';
import { TaskDrawer, NewTaskModal, type TaskStage } from './task-modals';
import { useAction } from './use-resource-form';
import { formatShortDate } from '@/lib/i18n/format';
import type { TaskStatus } from '@/lib/db/types';

/**
 * Interactive part of the project hub: the board, the stage list, the task
 * drawer and the AI analysis panel.
 *
 * Kept in one client component so the three share task state — closing the
 * drawer after a change refreshes the board without a full page reload.
 */

type Stage = TaskStage;

const STAGE_TONES: Record<string, 'neutral' | 'brand' | 'success' | 'danger'> = {
  todo: 'neutral', in_progress: 'brand', done: 'success', blocked: 'danger',
};

const STAGE_LABELS: Record<string, string> = {
  todo: 'À faire', in_progress: 'En cours', done: 'Terminée', blocked: 'Bloquée',
};

export function ProjectWorkspace({
  csrf,
  projectId,
  projectTitle,
  stages,
  kanban,
  assignees,
  canUpdate,
  canCreate,
  canDelete,
  canUseAi,
}: {
  csrf: string;
  projectId: number;
  projectTitle: string;
  stages: Stage[];
  kanban: KanbanColumnData[];
  assignees: { id: number; label: string }[];
  canUpdate: boolean;
  canCreate: boolean;
  canDelete: boolean;
  canUseAi: boolean;
}) {
  const router = useRouter();
  const [view, setView] = React.useState<'board' | 'stages'>('board');
  const [addingIn, setAddingIn] = React.useState<TaskStatus | null>(null);

  // Which task is open lives in `?tache=` (see TaskDrawerHost), so a task can be
  // linked to from a notification or the command palette.
  const openTaskId = Number.parseInt(useSearchParams().get('tache') ?? '', 10) || null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <SegmentTabs
          items={[
            { key: 'board', label: 'Kanban', count: kanban.reduce((a, c) => a + c.tasks.length, 0) },
            { key: 'stages', label: 'Étapes', count: stages.length },
          ]}
          active={view}
          onChange={(key) => setView(key as 'board' | 'stages')}
          className="flex-1"
        />
        {canUseAi && <AiAnalyzeButton csrf={csrf} projectId={projectId} projectTitle={projectTitle} />}
      </div>

      {canCreate && (
        <QuickAddTask csrf={csrf} projectId={projectId} defaultStatus="todo" onCreated={() => router.refresh()} />
      )}

      {view === 'board' ? (
        <Kanban
          columns={kanban}
          csrf={csrf}
          canUpdate={canUpdate}
          canCreate={canCreate}
          onAddTask={(status) => setAddingIn(status)}
        />
      ) : (
        <StageList csrf={csrf} projectId={projectId} stages={stages} canUpdate={canUpdate} canCreate={canCreate} />
      )}

      {openTaskId !== null && (
        <TaskDrawer
          csrf={csrf}
          taskId={openTaskId}
          stages={stages}
          assignees={assignees}
          canUpdate={canUpdate}
          canDelete={canDelete}
          onChanged={() => router.refresh()}
          onClose={() => router.push(`/espace-admin/projets/${projectId}`, { scroll: false })}
        />
      )}

      {addingIn !== null && (
        <NewTaskModal
          csrf={csrf}
          projectId={projectId}
          stages={stages}
          assignees={assignees}
          defaultStatus={addingIn}
          onCreated={() => router.refresh()}
          onClose={() => setAddingIn(null)}
        />
      )}
    </div>
  );
}

// ── Stages ───────────────────────────────────────────────────────────────

function StageList({
  csrf,
  projectId,
  stages,
  canUpdate,
  canCreate,
}: {
  csrf: string;
  projectId: number;
  stages: Stage[];
  canUpdate: boolean;
  canCreate: boolean;
}) {
  const { run, busy } = useAction(csrf);
  const [newName, setNewName] = React.useState('');

  return (
    <div className="space-y-3">
      {stages.length === 0 && (
        <p className="rounded-lg border border-dashed border-line px-4 py-8 text-center text-[0.8125rem] text-fg-muted">
          Aucune étape. Créez-en une pour découper la production.
        </p>
      )}

      {stages.map((stage) => {
        const percent = stage.task_count > 0 ? Math.round((stage.done_count / stage.task_count) * 100) : 0;
        return (
          <Card key={stage.id}>
            <CardBody className="flex flex-wrap items-center gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <h4 className="text-[0.875rem] font-semibold text-fg">{stage.name}</h4>
                  <Badge tone={STAGE_TONES[stage.status] ?? 'neutral'}>
                    {STAGE_LABELS[stage.status] ?? stage.status}
                  </Badge>
                  {stage.due_date && (
                    <span className="text-[0.6875rem] text-fg-subtle">
                      échéance {formatShortDate(stage.due_date, 'fr')}
                    </span>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <Progress
                    className="flex-1"
                    value={percent}
                    tone={percent === 100 ? 'success' : 'accent'}
                  />
                  <span className="shrink-0 text-[0.6875rem] tabular-nums text-fg-subtle">
                    {stage.done_count}/{stage.task_count}
                  </span>
                </div>
              </div>

              {canUpdate && (
                <Select
                  value={stage.status}
                  onChange={(event) =>
                    run(`/api/etapes/${stage.id}`, {
                      method: 'PATCH',
                      body: { status: event.target.value },
                      success: 'Étape mise à jour.',
                    })
                  }
                  aria-label={`Statut de l’étape ${stage.name}`}
                  className="w-auto min-w-32"
                  disabled={busy}
                >
                  {Object.entries(STAGE_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              )}
            </CardBody>
          </Card>
        );
      })}

      {canCreate && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            if (newName.trim().length < 2) return;
            const result = await run('/api/etapes', {
              method: 'POST',
              body: { project_id: projectId, name: newName.trim() },
              success: 'Étape créée.',
            });
            if (result) setNewName('');
          }}
          className="flex gap-2"
        >
          <Input
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            placeholder="Nouvelle étape…"
            maxLength={120}
            aria-label="Nom de la nouvelle étape"
          />
          <Button type="submit" size="md" disabled={busy || newName.trim().length < 2}>
            <Plus className="size-4" />
            Ajouter
          </Button>
        </form>
      )}
    </div>
  );
}


// ── AI analysis ──────────────────────────────────────────────────────────

type Analysis = {
  summary: string;
  risks: string[];
  actions: string[];
  priorities: string[];
  nextStep: string;
  source: 'ai' | 'rules';
};

/**
 * "✨ Analyser avec IA".
 *
 * Calls the server, which grounds the analysis in the project's real data
 * (progress, deadlines, revisions, feedback, payments). When no API key is
 * configured the server answers from the same data with deterministic rules, and
 * the panel says so — the feature works either way, and never pretends.
 */
function AiAnalyzeButton({
  csrf,
  projectId,
  projectTitle,
}: {
  csrf: string;
  projectId: number;
  projectTitle: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [analysis, setAnalysis] = React.useState<Analysis | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function analyse() {
    setOpen(true);
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/ia/generer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ task: 'project_analysis', projectId, csrf }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        analysis?: Analysis;
      };
      if (!response.ok) throw new Error(payload.error ?? 'Analyse impossible.');
      setAnalysis(payload.analysis ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analyse impossible.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button variant="subtle" size="sm" onClick={analyse}>
        <Sparkles className="size-4" />
        Analyser avec IA
      </Button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Analyse du projet"
        description={projectTitle}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              Fermer
            </Button>
            <Button onClick={analyse} disabled={loading}>
              {loading ? 'Analyse…' : 'Relancer'}
            </Button>
          </>
        }
      >
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-10">
            <Loader2 className="size-6 animate-spin text-accent" />
            <p className="text-[0.8125rem] text-fg-muted">Lecture de l’avancement, des échéances et des paiements…</p>
          </div>
        ) : error ? (
          <p className="rounded-lg bg-danger-soft px-3 py-2.5 text-[0.8125rem] text-danger" role="alert">
            {error}
          </p>
        ) : analysis ? (
          <div className="space-y-5">
            {analysis.source === 'rules' && (
              <p className="rounded-lg bg-info-soft px-3 py-2 text-[0.6875rem] leading-relaxed text-info">
                Analyse produite par le moteur de règles intégré (aucune clé API IA configurée). Les
                constats sont calculés à partir des données réelles du projet.
              </p>
            )}

            <section>
              <h4 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-subtle">Résumé</h4>
              <p className="mt-1.5 whitespace-pre-line text-[0.875rem] leading-relaxed text-fg">{analysis.summary}</p>
            </section>

            {analysis.risks.length > 0 && (
              <AnalysisList title="Risques" items={analysis.risks} tone="danger" />
            )}
            {analysis.priorities.length > 0 && (
              <AnalysisList title="Priorités" items={analysis.priorities} tone="warning" />
            )}
            {analysis.actions.length > 0 && (
              <AnalysisList title="Actions recommandées" items={analysis.actions} tone="accent" />
            )}

            {analysis.nextStep && (
              <section className="rounded-lg border border-accent/30 bg-accent-soft px-4 py-3">
                <h4 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-accent">
                  Prochaine action
                </h4>
                <p className="mt-1 text-[0.875rem] font-medium text-fg">{analysis.nextStep}</p>
              </section>
            )}
          </div>
        ) : null}
      </Modal>
    </>
  );
}

function AnalysisList({
  title,
  items,
  tone,
}: {
  title: string;
  items: string[];
  tone: 'danger' | 'warning' | 'accent';
}) {
  const dot = { danger: 'bg-danger', warning: 'bg-warning', accent: 'bg-accent' }[tone];
  return (
    <section>
      <h4 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-subtle">{title}</h4>
      <ul className="mt-1.5 space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2.5 text-[0.8125rem] leading-relaxed text-fg-muted">
            <span className={cn('mt-1.5 size-1.5 shrink-0 rounded-full', dot)} aria-hidden />
            {item}
          </li>
        ))}
      </ul>
    </section>
  );
}

export { CheckCircle2, Circle };
