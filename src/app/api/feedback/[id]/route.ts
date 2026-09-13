import { z } from 'zod';
import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import * as projectsRepo from '@/lib/db/repositories/projects';
import { emit } from '@/lib/automation/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Feedback is client-authored: the admin does not rewrite it, only triages it.
 * Hence a status-only endpoint rather than a full update.
 */
const triageSchema = z.object({
  csrf: z.string().optional(),
  status: z.enum(['new', 'acknowledged', 'resolved']),
});

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'feedback.update', schema: triageSchema },
    async ({ body, user, log }) => {
      const feedback = projectsRepo.findFeedback(id);
      if (!feedback) return notFound('Feedback introuvable.');

      if (body.status === 'resolved') projectsRepo.resolveFeedback(id);
      else if (body.status === 'acknowledged') projectsRepo.acknowledgeFeedback(id);
      else return badRequest('Un feedback ne peut pas repasser en « nouveau ».');

      if (body.status === 'resolved') {
        projectsRepo.addProjectEvent({
          projectId: feedback.project_id,
          kind: 'feedback',
          title: 'Retour client traité',
          actorLabel: user.full_name ?? user.username,
          entityType: 'feedback',
          entityId: id,
        });
      }

      log({
        action: 'status_change',
        entityType: 'feedback',
        entityId: id,
        summary: `Feedback ${body.status === 'resolved' ? 'traité' : 'pris en compte'}`,
        metadata: { from: feedback.status, to: body.status },
      });

      return ok({ id, feedback: projectsRepo.findFeedback(id) });
    },
  )(request);
}

/**
 * Turns a client's "changes requested" into a tracked revision — the moment the
 * allowance counter and any supplementary billing kick in.
 */
export async function POST(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: ['revisions.create', 'feedback.update'] },
    async ({ user, log }) => {
      const feedback = projectsRepo.findFeedback(id);
      if (!feedback) return notFound('Feedback introuvable.');

      const project = projectsRepo.findProject(feedback.project_id);
      if (!project) return notFound('Projet introuvable.');

      const revision = projectsRepo.createRevision({
        projectId: feedback.project_id,
        title: `Retour client du ${feedback.created_at.slice(0, 10)}`,
        description: feedback.comment,
        requestedBy: 'client',
      });

      projectsRepo.acknowledgeFeedback(id);

      projectsRepo.addProjectEvent({
        projectId: feedback.project_id,
        kind: 'revision',
        title: `Révision #${revision.indexNumber} créée depuis un retour client`,
        body: feedback.comment,
        actorLabel: user.full_name ?? user.username,
        entityType: 'revision',
        entityId: revision.id,
      });

      const outcomes = emit('revision.created', {
        projectId: feedback.project_id,
        revisionId: revision.id,
        isExtra: revision.isExtra,
        extraCost: revision.extraCost,
        indexNumber: revision.indexNumber,
      });

      log({
        action: 'create',
        entityType: 'revision',
        entityId: revision.id,
        entityLabel: `Révision #${revision.indexNumber}`,
        summary: `Révision #${revision.indexNumber} créée depuis le feedback #${id} (${project.title})`,
        metadata: { feedbackId: id, isExtra: revision.isExtra, automations: outcomes },
      });

      return ok(
        {
          revisionId: revision.id,
          indexNumber: revision.indexNumber,
          isExtra: revision.isExtra,
          extraCost: revision.extraCost,
          summary: projectsRepo.getRevisionSummary(feedback.project_id),
        },
        201,
      );
    },
  )(request);
}
