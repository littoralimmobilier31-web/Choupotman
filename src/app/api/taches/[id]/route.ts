import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { taskSchema, taskMoveSchema, patchOf } from '@/lib/validation/admin';
import * as projectsRepo from '@/lib/db/repositories/projects';
import { emit } from '@/lib/automation/engine';
import { diffFields } from '@/lib/db/repositories/activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'tasks.view' }, async () => {
    const task = projectsRepo.findTask(id);
    if (!task) return notFound('Tâche introuvable.');
    return Response.json({
      ok: true,
      task,
      checklist: projectsRepo.listChecklist(id),
      comments: projectsRepo.listTaskComments(id),
    });
  })(request);
}

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'tasks.update', schema: patchOf(taskSchema) },
    async ({ body, user, log }) => {
      const before = projectsRepo.findTask(id);
      if (!before) return notFound('Tâche introuvable.');

      projectsRepo.updateTask(id, {
        project_id: body.project_id,
        stage_id: body.stage_id,
        title: body.title,
        description: body.description,
        assignee_id: body.assignee_id,
        priority: body.priority,
        status: body.status,
        due_date: body.due_date,
        estimate_hours: body.estimate_hours,
        spent_hours: body.spent_hours,
      });

      // Completion drives progress recalculation and stage closing.
      if (body.status === 'done' && before.status !== 'done') {
        emit('task.completed', { taskId: id, actorLabel: user.username });
        if (before.project_id) {
          projectsRepo.addProjectEvent({
            projectId: before.project_id,
            kind: 'task',
            title: `Tâche terminée : ${before.title}`,
            actorLabel: user.full_name ?? user.username,
            entityType: 'task',
            entityId: id,
          });
        }
      }

      log({
        action: 'update',
        entityType: 'task',
        entityId: id,
        entityLabel: body.title ?? before.title,
        summary: `Tâche modifiée : ${body.title ?? before.title}`,
        metadata: {
          changes: diffFields(before as unknown as Record<string, unknown>, body as Record<string, unknown>),
        },
      });

      return ok({ id, task: projectsRepo.findTask(id) });
    },
  )(request);
}

/** PUT — kanban drag & drop: set the column and the order within it. */
export async function PUT(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'tasks.update', schema: taskMoveSchema },
    async ({ body, user, log }) => {
      const before = projectsRepo.findTask(id);
      if (!before) return notFound('Tâche introuvable.');

      projectsRepo.moveTask(id, body.status, body.position);

      if (body.status === 'done' && before.status !== 'done') {
        emit('task.completed', { taskId: id, actorLabel: user.username });
      }

      log({
        action: 'status_change',
        entityType: 'task',
        entityId: id,
        entityLabel: before.title,
        summary: `Tâche déplacée : ${projectsRepo.taskStatusLabel(before.status)} → ${projectsRepo.taskStatusLabel(body.status)}`,
        metadata: { from: before.status, to: body.status, position: body.position },
      });

      return ok({ id });
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'tasks.delete' }, async ({ log }) => {
    const task = projectsRepo.findTask(id);
    if (!task) return notFound('Tâche introuvable.');

    projectsRepo.deleteTask(id);
    log({
      action: 'delete',
      entityType: 'task',
      entityId: id,
      entityLabel: task.title,
      summary: `Tâche supprimée : ${task.title}`,
    });
    return ok({ deleted: true });
  })(request);
}
