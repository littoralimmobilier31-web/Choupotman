import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { checklistUpdateSchema } from '@/lib/validation/admin';
import * as projectsRepo from '@/lib/db/repositories/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'tasks.update', schema: checklistUpdateSchema },
    async ({ body, log }) => {
      const item = projectsRepo.findChecklistItem(id);
      if (!item) return notFound('Sous-tâche introuvable.');

      if (body.is_done !== undefined) projectsRepo.toggleChecklistItem(id, body.is_done);
      if (body.label !== undefined) projectsRepo.renameChecklistItem(id, body.label);

      // Ticking a box is high-frequency and low-consequence: only a rename or a
      // state change is worth an audit line, and never one per keystroke.
      log({
        action: 'update',
        entityType: 'checklist_item',
        entityId: id,
        entityLabel: body.label ?? item.label,
        summary:
          body.is_done !== undefined
            ? `Sous-tâche ${body.is_done ? 'cochée' : 'décochée'} : ${body.label ?? item.label}`
            : `Sous-tâche renommée : ${body.label ?? item.label}`,
      });

      return ok({ id, checklist: projectsRepo.listChecklist(item.task_id) });
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'tasks.update' }, async ({ log }) => {
    const item = projectsRepo.findChecklistItem(id);
    if (!item) return notFound('Sous-tâche introuvable.');

    projectsRepo.deleteChecklistItem(id);

    log({
      action: 'delete',
      entityType: 'checklist_item',
      entityId: id,
      entityLabel: item.label,
      summary: `Sous-tâche supprimée : ${item.label}`,
    });

    return ok({ deleted: true, checklist: projectsRepo.listChecklist(item.task_id) });
  })(request);
}
