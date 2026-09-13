import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { revisionUpdateSchema } from '@/lib/validation/admin';
import * as projectsRepo from '@/lib/db/repositories/projects';
import { diffFields } from '@/lib/db/repositories/activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const STATUS_LABELS: Record<string, string> = {
  open: 'ouverte', in_progress: 'en cours', done: 'terminée', rejected: 'refusée',
};

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'revisions.update', schema: revisionUpdateSchema },
    async ({ body, user, log }) => {
      const before = projectsRepo.findRevision(id);
      if (!before) return notFound('Révision introuvable.');

      // Once the overflow has been invoiced, its amount is part of an accounting
      // document: changing it here would silently desynchronise the two.
      if (
        body.extra_cost !== undefined &&
        body.extra_cost !== before.extra_cost &&
        before.extra_invoice_id !== null
      ) {
        return Response.json(
          {
            error: 'Cette révision est rattachée à une facture. Modifiez la facture pour changer le montant.',
            fields: { extra_cost: 'Montant verrouillé par la facture liée.' },
          },
          { status: 409 },
        );
      }

      projectsRepo.updateRevision(id, {
        status: body.status,
        title: body.title ?? undefined,
        description: body.description ?? undefined,
        extra_cost: body.extra_cost,
      });

      if (body.status !== undefined && body.status !== before.status) {
        projectsRepo.addProjectEvent({
          projectId: before.project_id,
          kind: 'revision',
          title: `Révision #${before.index_number} ${STATUS_LABELS[body.status] ?? body.status}`,
          actorLabel: user.full_name ?? user.username,
          entityType: 'revision',
          entityId: id,
        });
      }

      log({
        action: body.status !== undefined && body.status !== before.status ? 'status_change' : 'update',
        entityType: 'revision',
        entityId: id,
        entityLabel: `Révision #${before.index_number}`,
        summary: `Révision #${before.index_number} modifiée`,
        metadata: {
          changes: diffFields(before as unknown as Record<string, unknown>, body as Record<string, unknown>),
        },
      });

      return ok({
        id,
        revision: projectsRepo.findRevision(id),
        summary: projectsRepo.getRevisionSummary(before.project_id),
      });
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'revisions.delete' }, async ({ log }) => {
    const revision = projectsRepo.findRevision(id);
    if (!revision) return notFound('Révision introuvable.');

    // Deleting a revision renumbers the allowance count, so an invoiced one must
    // be rejected instead — that keeps the counter honest and the invoice valid.
    if (revision.extra_invoice_id !== null) {
      return Response.json(
        {
          error:
            'Cette révision a été facturée. Passez-la en « refusée » plutôt que de la supprimer, afin de conserver la piste comptable.',
        },
        { status: 409 },
      );
    }

    projectsRepo.deleteRevision(id);
    log({
      action: 'delete',
      entityType: 'revision',
      entityId: id,
      entityLabel: `Révision #${revision.index_number}`,
      summary: `Révision #${revision.index_number} supprimée`,
    });

    return ok({ deleted: true, summary: projectsRepo.getRevisionSummary(revision.project_id) });
  })(request);
}
