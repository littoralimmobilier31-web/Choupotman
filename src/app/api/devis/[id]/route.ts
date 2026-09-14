import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { quoteSchema, patchOf } from '@/lib/validation/admin';
import * as financeRepo from '@/lib/db/repositories/finance';
import { addProjectEvent } from '@/lib/db/repositories/projects';
import { emit } from '@/lib/automation/engine';
import { formatMoney } from '@/lib/i18n/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'quotes.view' }, async () => {
    const quote = financeRepo.findQuote(id);
    if (!quote) return notFound('Devis introuvable.');
    return Response.json({ ok: true, quote, items: financeRepo.listQuoteItems(id) });
  })(request);
}

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'quotes.update', schema: patchOf(quoteSchema) },
    async ({ body, user, log }) => {
      const before = financeRepo.findQuote(id);
      if (!before) return notFound('Devis introuvable.');

      financeRepo.updateQuote(id, {
        client_id: body.client_id ?? undefined,
        project_id: body.project_id ?? undefined,
        title: body.title ?? undefined,
        status: body.status,
        issue_date: body.issue_date ?? undefined,
        valid_until: body.valid_until ?? undefined,
        currency: body.currency,
        discount_type: body.discount_type,
        discount_value: body.discount_value,
        tax_rate: body.tax_rate,
        delivery_terms: body.delivery_terms ?? undefined,
        payment_terms: body.payment_terms ?? undefined,
        conditions: body.conditions ?? undefined,
        notes: body.notes ?? undefined,
        locale: body.locale,
        items: body.items,
      });

      const after = financeRepo.findQuote(id);

      /**
       * Acceptance is the event that matters commercially: it prepares the
       * invoice and records the milestone. Emitted only on the transition, so
       * re-saving an accepted quote does not create a second invoice.
       */
      if (body.status === 'accepted' && before.status !== 'accepted') {
        emit('quote.accepted', { quoteId: id });
      }

      if (after?.project_id && body.status && body.status !== before.status) {
        addProjectEvent({
          projectId: after.project_id,
          kind: 'quote',
          title: `Devis ${after.number} — ${financeRepo.quoteStatusLabel(body.status)}`,
          body: formatMoney(after.total, after.currency),
          actorLabel: user.full_name ?? user.username,
          entityType: 'quote',
          entityId: id,
        });
      }

      log({
        action: 'quote',
        entityType: 'quote',
        entityId: id,
        entityLabel: before.number,
        summary: `Devis modifié : ${before.number}`,
        metadata: {
          statusFrom: before.status,
          statusTo: body.status ?? before.status,
          totalFrom: before.total,
          totalTo: after?.total,
        },
      });

      return ok({ id, total: after?.total });
    },
  )(request);
}

/** PUT — duplicate the quote as a fresh draft. */
export async function PUT(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'quotes.create' }, async ({ user, log }) => {
    const source = financeRepo.findQuote(id);
    if (!source) return notFound('Devis introuvable.');

    const copyId = financeRepo.duplicateQuote(id, user.id);
    if (!copyId) return badRequest('Duplication impossible.');

    const copy = financeRepo.findQuote(copyId);
    log({
      action: 'quote',
      entityType: 'quote',
      entityId: copyId,
      entityLabel: copy?.number,
      summary: `Devis dupliqué depuis ${source.number}`,
    });
    return ok({ id: copyId, number: copy?.number }, 201);
  })(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'quotes.delete' }, async ({ log }) => {
    const quote = financeRepo.findQuote(id);
    if (!quote) return notFound('Devis introuvable.');

    /**
     * A quote that has been sent or accepted is archived, not deleted: it is part
     * of the commercial record, and the client may still hold a copy of it.
     */
    if (quote.status !== 'draft') {
      financeRepo.updateQuote(id, { status: 'archived' });
      log({
        action: 'quote',
        entityType: 'quote',
        entityId: id,
        entityLabel: quote.number,
        summary: `Devis archivé : ${quote.number}`,
      });
      return ok({
        archived: true,
        reason: 'Ce devis a déjà été envoyé : il a été archivé au lieu d’être supprimé.',
      });
    }

    financeRepo.deleteQuote(id);
    log({
      action: 'delete',
      entityType: 'quote',
      entityId: id,
      entityLabel: quote.number,
      summary: `Devis supprimé : ${quote.number}`,
    });
    return ok({ deleted: true });
  })(request);
}
