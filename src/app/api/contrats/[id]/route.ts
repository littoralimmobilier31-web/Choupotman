import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { contractSchema, patchOf } from '@/lib/validation/admin';
import { deleteContract, findContract, updateContract } from '@/lib/db/repositories/finance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'contracts.view' }, async () => {
    const contract = findContract(id);
    if (!contract) return notFound('Contrat introuvable.');
    return Response.json({ ok: true, contract });
  })(request);
}

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'contracts.update', schema: patchOf(contractSchema) },
    async ({ body, log }) => {
      const before = findContract(id);
      if (!before) return notFound('Contrat introuvable.');

      /**
       * A signed contract is a commitment on both sides. Its wording and amount
       * are frozen from that point on — the way to change the agreement is a new
       * contract, not a quiet edit of the one that was signed.
       */
      const locked = before.status === 'signed';
      const touchesTerms =
        body.body !== undefined || body.amount !== undefined || body.title !== undefined;

      if (locked && touchesTerms) {
        return Response.json(
          {
            error: 'Ce contrat est signé : son contenu et son montant ne peuvent plus être modifiés.',
            reason: 'Créez un avenant sous la forme d’un nouveau contrat pour formaliser un changement.',
          },
          { status: 409 },
        );
      }

      updateContract(id, {
        title: body.title,
        body: body.body,
        status: body.status,
        amount: body.amount,
        start_date: body.start_date,
        delivery_date: body.delivery_date,
      });

      log({
        action: body.status !== undefined && body.status !== before.status ? 'status_change' : 'update',
        entityType: 'contract',
        entityId: id,
        entityLabel: before.number,
        summary:
          body.status !== undefined && body.status !== before.status
            ? `Contrat ${before.number} : ${before.status} → ${body.status}`
            : `Contrat modifié : ${before.number}`,
        metadata:
          body.amount !== undefined && body.amount !== before.amount
            ? { amountBefore: before.amount, amountAfter: body.amount }
            : undefined,
      });

      return ok({ id, contract: findContract(id) });
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'contracts.delete' }, async ({ request: req, log }) => {
    const contract = findContract(id);
    if (!contract) return notFound('Contrat introuvable.');

    /**
     * A signed contract is cancelled, never deleted: it happened, and the record
     * of it is what protects both parties. Drafts can be removed outright.
     */
    if (contract.status === 'signed') {
      const force = new URL(req.url).searchParams.get('force') === '1';
      if (!force) {
        updateContract(id, { status: 'cancelled' });
        log({
          action: 'status_change',
          entityType: 'contract',
          entityId: id,
          entityLabel: contract.number,
          summary: `Contrat ${contract.number} annulé (signé, conservé)`,
        });
        return ok({
          cancelled: true,
          reason:
            'Le contrat était signé : il a été annulé plutôt que supprimé, afin de conserver la trace de l’engagement.',
        });
      }
    }

    deleteContract(id);
    log({
      action: 'delete',
      entityType: 'contract',
      entityId: id,
      entityLabel: contract.number,
      summary: `Contrat supprimé : ${contract.number} (${contract.status})`,
    });

    return ok({ deleted: true });
  })(request);
}
