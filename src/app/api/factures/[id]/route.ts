import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { invoiceSchema, patchOf } from '@/lib/validation/admin';
import * as financeRepo from '@/lib/db/repositories/finance';
import { addProjectEvent } from '@/lib/db/repositories/projects';
import { formatMoney } from '@/lib/i18n/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'invoices.view' }, async () => {
    const invoice = financeRepo.findInvoice(id);
    if (!invoice) return notFound('Facture introuvable.');
    return Response.json({
      ok: true,
      invoice,
      items: financeRepo.listInvoiceItems(id),
      payments: financeRepo.listPayments({ invoiceId: id }),
    });
  })(request);
}

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'invoices.update', schema: patchOf(invoiceSchema) },
    async ({ body, user, log }) => {
      const before = financeRepo.findInvoice(id);
      if (!before) return notFound('Facture introuvable.');

      /**
       * Once an invoice has left the building, its amounts are part of the
       * accounting record: lines can no longer be rewritten. Correcting a sent
       * invoice means cancelling it and issuing a new one — which is also what
       * accounting practice expects.
       */
      const amountChanging =
        body.items !== undefined ||
        body.discount_value !== undefined ||
        body.discount_type !== undefined ||
        body.tax_rate !== undefined;

      if (amountChanging && before.status !== 'draft') {
        return Response.json(
          {
            error:
              'Les montants d’une facture déjà émise ne peuvent plus être modifiés. Annulez-la et créez une nouvelle facture.',
          },
          { status: 409 },
        );
      }

      financeRepo.updateInvoice(id, {
        client_id: body.client_id,
        project_id: body.project_id,
        quote_id: body.quote_id,
        title: body.title,
        status: body.status,
        kind: body.kind,
        issue_date: body.issue_date ?? undefined,
        due_date: body.due_date,
        currency: body.currency,
        discount_type: body.discount_type,
        discount_value: body.discount_value,
        tax_rate: body.tax_rate,
        payment_terms: body.payment_terms,
        notes: body.notes,
        locale: body.locale,
        items: body.items,
      });

      const after = financeRepo.findInvoice(id);

      if (after?.project_id && body.status && body.status !== before.status) {
        addProjectEvent({
          projectId: after.project_id,
          kind: 'invoice',
          title: `Facture ${after.number} — ${financeRepo.invoiceStatusLabel(after.status)}`,
          body: formatMoney(after.total, after.currency),
          actorLabel: user.full_name ?? user.username,
          entityType: 'invoice',
          entityId: id,
        });
      }

      log({
        action: 'invoice',
        entityType: 'invoice',
        entityId: id,
        entityLabel: before.number,
        summary: `Facture modifiée : ${before.number}`,
        metadata: {
          statusFrom: before.status,
          statusTo: after?.status,
          totalFrom: before.total,
          totalTo: after?.total,
        },
      });

      return ok({ id, status: after?.status, total: after?.total, balance: after?.balance_due });
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'invoices.delete' }, async ({ log }) => {
    const invoice = financeRepo.findInvoice(id);
    if (!invoice) return notFound('Facture introuvable.');

    /**
     * Only a draft can be deleted. Anything issued is cancelled instead, which
     * keeps the number sequence intact — a gap in invoice numbering is a problem
     * during an audit.
     */
    if (invoice.status !== 'draft') {
      financeRepo.cancelInvoice(id);
      log({
        action: 'invoice',
        entityType: 'invoice',
        entityId: id,
        entityLabel: invoice.number,
        summary: `Facture annulée : ${invoice.number}`,
        metadata: { total: invoice.total, previousStatus: invoice.status },
      });
      return ok({
        cancelled: true,
        reason:
          'Cette facture a déjà été émise : elle a été annulée au lieu d’être supprimée, afin de conserver la numérotation.',
      });
    }

    financeRepo.deleteInvoice(id);
    log({
      action: 'delete',
      entityType: 'invoice',
      entityId: id,
      entityLabel: invoice.number,
      summary: `Facture (brouillon) supprimée : ${invoice.number}`,
    });
    return ok({ deleted: true });
  })(request);
}
