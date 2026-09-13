import { createHandler, ok, notFound } from '@/lib/api/handler';
import { commentSchema } from '@/lib/validation/admin';
import * as projectsRepo from '@/lib/db/repositories/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Internal task comments. These are never shown in the client portal — client
 * input goes through project feedback, which is a separate, visible channel.
 */
export const POST = createHandler(
  { permission: 'tasks.update', schema: commentSchema },
  async ({ body, user, log }) => {
    const task = projectsRepo.findTask(body.task_id);
    if (!task) return notFound('Tâche introuvable.');

    const id = projectsRepo.addTaskComment({
      taskId: body.task_id,
      body: body.body,
      userId: user.id,
      authorLabel: user.full_name ?? user.username,
    });

    log({
      action: 'create',
      entityType: 'task_comment',
      entityId: id,
      entityLabel: task.title,
      summary: `Commentaire ajouté sur « ${task.title} »`,
    });

    return ok({ id, comments: projectsRepo.listTaskComments(body.task_id) }, 201);
  },
);
