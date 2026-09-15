import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { paymentSchema, patchOf } from '@/lib/validation/admin';
import * as financeRepo from '@/lib/db/repositories/finance';
import { formatMoney } from '@/lib/i18n/format';
import { money } from '@/lib/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'payments.update', schema: patchOf(paymentSchema) },
    async ({ body, log }) => {
      const payment = financeRepo.findPayment(id);
      if (!payment) return notFound('Règlement introuvable.');

      // Same over-payment guard as on creation, against the balance the invoice
      // would have without this payment.
      if (body.amount !== undefined && payment.invoice_id) {
        const invoice = financeRepo.findInvoice(payment.invoice_id);
        if (invoice) {
          const balanceWithout = money(invoice.balance_due + payment.amount);
          if (money(body.amount) > money(balanceWithout + 0.01)) {
            return Response.json(
              {
                error: `Le montant dépasse le solde de la facture (${formatMoney(balanceWithout, invoice.currency)}).`,
                fields: { amount: 'Montant supérieur au solde dû.' },
              },
              { status: 400 },
            );
          }
        }
      }

      financeRepo.updatePayment(id, {
        amount: body.amount,
        method: body.method,
        reference: body.reference,
        paid_at: body.paid_at ?? undefined,
        status: body.status,
        notes: body.notes,
      });

      log({
        action: 'payment',
        entityType: 'payment',
        entityId: id,
        summary: `Règlement modifié (${formatMoney(body.amount ?? payment.amount, payment.currency)})`,
        metadata: { from: payment.amount, to: body.amount ?? payment.amount },
      });

      // The invoice status is derived from its numbers, so return the fresh row.
      return ok({
        id,
        invoice: payment.invoice_id ? financeRepo.findInvoice(payment.invoice_id) : null,
      });
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'payments.delete' }, async ({ log }) => {
    const payment = financeRepo.findPayment(id);
    if (!payment) return notFound('Règlement introuvable.');

    financeRepo.deletePayment(id);

    log({
      action: 'delete',
      entityType: 'payment',
      entityId: id,
      summary: `Règlement supprimé (${formatMoney(payment.amount, payment.currency)})`,
      metadata: { invoiceId: payment.invoice_id, amount: payment.amount },
    });

    return ok({
      deleted: true,
      invoice: payment.invoice_id ? financeRepo.findInvoice(payment.invoice_id) : null,
    });
  })(request);
}
