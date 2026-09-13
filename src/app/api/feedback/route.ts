import { createHandler, list, ok, notFound } from '@/lib/api/handler';
import { feedbackSchema } from '@/lib/validation/admin';
import * as projectsRepo from '@/lib/db/repositories/projects';
import { emit } from '@/lib/automation/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createHandler({ permission: 'feedback.view' }, async ({ request }) => {
  const url = new URL(request.url);
  const filter = {
    projectId: Number.parseInt(url.searchParams.get('projet') ?? '', 10) || undefined,
    clientId: Number.parseInt(url.searchParams.get('client') ?? '', 10) || undefined,
    status: url.searchParams.get('statut') ?? undefined,
    decision: url.searchParams.get('decision') ?? undefined,
    limit: Math.min(500, Number.parseInt(url.searchParams.get('limit') ?? '200', 10) || 200),
  };
  return list(projectsRepo.listFeedbackWithMeta(filter), {
    total: projectsRepo.countFeedback({ status: filter.status, decision: filter.decision }),
  });
});

export const POST = createHandler(
  { permission: 'feedback.create', schema: feedbackSchema },
  async ({ body, user, log }) => {
    const project = projectsRepo.findProject(body.project_id);
    if (!project) return notFound('Projet introuvable.');

    const id = projectsRepo.createFeedback({
      projectId: body.project_id,
      clientId: body.client_id ?? project.client_id,
      stageId: body.stage_id ?? null,
      taskId: body.task_id ?? null,
      authorLabel: body.author_label ?? user.full_name ?? user.username,
      comment: body.comment ?? null,
      rating: body.rating ?? null,
      decision: body.decision,
      source: body.source,
    });

    projectsRepo.addProjectEvent({
      projectId: body.project_id,
      kind: 'feedback',
      title:
        body.decision === 'approved'
          ? 'Validation client'
          : body.decision === 'changes_requested'
            ? 'Modifications demandées'
            : 'Retour client',
      body: body.comment ?? null,
      actorLabel: body.author_label ?? user.full_name ?? user.username,
      entityType: 'feedback',
      entityId: id,
    });

    const outcomes = emit('feedback.received', { projectId: body.project_id, feedbackId: id });
    // An approval can close the project, so it is a second, distinct event.
    if (body.decision === 'approved') {
      outcomes.push(...emit('feedback.approved', { projectId: body.project_id, feedbackId: id }));
    }

    log({
      action: 'create',
      entityType: 'feedback',
      entityId: id,
      entityLabel: project.title,
      summary: `Feedback enregistré sur ${project.title} (${body.decision})`,
      metadata: { automations: outcomes },
    });

    return ok({ id }, 201);
  },
);
