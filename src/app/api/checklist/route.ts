import { createHandler, ok, notFound } from '@/lib/api/handler';
import { checklistSchema } from '@/lib/validation/admin';
import * as projectsRepo from '@/lib/db/repositories/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Checklist items belong to a task and carry no permission of their own: whoever
 * may update the task may tick its boxes, which is why both verbs check
 * `tasks.update` rather than a separate resource.
 */
export const POST = createHandler(
  { permission: 'tasks.update', schema: checklistSchema },
  async ({ body, log }) => {
    const task = projectsRepo.findTask(body.task_id);
    if (!task) return notFound('Tâche introuvable.');

    const id = projectsRepo.addChecklistItem(body.task_id, body.label);

    log({
      action: 'create',
      entityType: 'checklist_item',
      entityId: id,
      entityLabel: body.label,
      summary: `Sous-tâche ajoutée à « ${task.title} » : ${body.label}`,
    });

    return ok({ id, checklist: projectsRepo.listChecklist(body.task_id) }, 201);
  },
);
