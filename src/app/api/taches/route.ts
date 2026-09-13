import { createHandler, list, ok } from '@/lib/api/handler';
import { taskSchema } from '@/lib/validation/admin';
import * as projectsRepo from '@/lib/db/repositories/projects';
import { emit } from '@/lib/automation/engine';
import type { Priority, TaskStatus } from '@/lib/db/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createHandler({ permission: 'tasks.view' }, async ({ request }) => {
  const url = new URL(request.url);
  const filter = {
    projectId: Number.parseInt(url.searchParams.get('projet') ?? '', 10) || undefined,
    stageId: Number.parseInt(url.searchParams.get('etape') ?? '', 10) || undefined,
    status: (url.searchParams.get('statut') as TaskStatus | 'all' | 'open') ?? undefined,
    assigneeId: Number.parseInt(url.searchParams.get('assigne') ?? '', 10) || undefined,
    priority: (url.searchParams.get('priorite') as Priority) ?? undefined,
    search: url.searchParams.get('q') ?? undefined,
    overdueOnly: url.searchParams.get('retard') === '1',
    limit: Math.min(500, Number.parseInt(url.searchParams.get('limit') ?? '300', 10) || 300),
  };

  // `?vue=kanban` returns the board grouped by column, ready to render.
  if (url.searchParams.get('vue') === 'kanban') {
    return Response.json({ ok: true, columns: projectsRepo.getKanban(filter) });
  }

  return list(projectsRepo.listTasks(filter), { total: projectsRepo.countTasks(filter) });
});

export const POST = createHandler(
  { permission: 'tasks.create', schema: taskSchema },
  async ({ body, user, log }) => {
    const id = projectsRepo.createTask({
      project_id: body.project_id ?? null,
      stage_id: body.stage_id ?? null,
      title: body.title,
      description: body.description ?? null,
      assignee_id: body.assignee_id ?? null,
      priority: body.priority,
      status: body.status,
      due_date: body.due_date ?? null,
      estimate_hours: body.estimate_hours ?? null,
      created_by: user.id,
    });

    if (body.project_id) {
      projectsRepo.addProjectEvent({
        projectId: body.project_id,
        kind: 'task',
        title: `Tâche créée : ${body.title}`,
        actorLabel: user.full_name ?? user.username,
        entityType: 'task',
        entityId: id,
      });
    }

    // A task created directly as done still needs the progress recalculation.
    if (body.status === 'done') emit('task.completed', { taskId: id, actorLabel: user.username });

    log({
      action: 'create',
      entityType: 'task',
      entityId: id,
      entityLabel: body.title,
      summary: `Tâche créée : ${body.title}`,
    });

    return ok({ id }, 201);
  },
);
