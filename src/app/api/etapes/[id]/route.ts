import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { stageUpdateSchema } from '@/lib/validation/admin';
import * as projectsRepo from '@/lib/db/repositories/projects';
import { diffFields } from '@/lib/db/repositories/activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const STAGE_STATUS_LABELS: Record<string, string> = {
  todo: 'À faire', in_progress: 'En cours', done: 'Terminée', blocked: 'Bloquée',
};

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'projects.update', schema: stageUpdateSchema },
    async ({ body, user, log }) => {
      const before = projectsRepo.findStage(id);
      if (!before) return notFound('Étape introuvable.');

      projectsRepo.updateStage(id, {
        name: body.name,
        description: body.description ?? undefined,
        status: body.status,
        due_date: body.due_date ?? undefined,
        position: body.position,
      });

      // Closing a stage is a milestone the client-facing timeline should show.
      if (body.status !== undefined && body.status !== before.status) {
        projectsRepo.addProjectEvent({
          projectId: before.project_id,
          kind: 'stage',
          title: `Étape « ${body.name ?? before.name} » : ${STAGE_STATUS_LABELS[body.status] ?? body.status}`,
          actorLabel: user.full_name ?? user.username,
          entityType: 'stage',
          entityId: id,
        });
      }

      log({
        action: body.status !== undefined && body.status !== before.status ? 'status_change' : 'update',
        entityType: 'stage',
        entityId: id,
        entityLabel: body.name ?? before.name,
        summary: `Étape modifiée : ${body.name ?? before.name}`,
        metadata: {
          changes: diffFields(before as unknown as Record<string, unknown>, body as Record<string, unknown>),
        },
      });

      return ok({ id, stages: projectsRepo.listStages(before.project_id) });
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'projects.update' }, async ({ request: req, user, log }) => {
    const stage = projectsRepo.findStage(id);
    if (!stage) return notFound('Étape introuvable.');

    // Deleting a stage must never delete the work inside it. The tasks keep
    // existing with `stage_id = NULL` (the schema's ON DELETE SET NULL), so
    // warn instead of silently detaching a stage that still holds tasks.
    const stages = projectsRepo.listStages(stage.project_id);
    const current = stages.find((s) => s.id === id);
    const force = new URL(req.url).searchParams.get('force') === '1';
    if (current && current.task_count > 0 && !force) {
      return Response.json(
        {
          error: `Cette étape contient ${current.task_count} tâche(s). Elles seront conservées mais détachées de toute étape.`,
          requiresConfirmation: true,
          taskCount: current.task_count,
        },
        { status: 409 },
      );
    }

    projectsRepo.deleteStage(id);
    projectsRepo.addProjectEvent({
      projectId: stage.project_id,
      kind: 'stage',
      title: `Étape supprimée : ${stage.name}`,
      actorLabel: user.full_name ?? user.username,
    });

    log({
      action: 'delete',
      entityType: 'stage',
      entityId: id,
      entityLabel: stage.name,
      summary: `Étape supprimée : ${stage.name}`,
    });

    return ok({ deleted: true, stages: projectsRepo.listStages(stage.project_id) });
  })(request);
}
