import { createHandler, list, ok } from '@/lib/api/handler';
import { paymentSchema } from '@/lib/validation/admin';
import * as financeRepo from '@/lib/db/repositories/finance';
import { emit } from '@/lib/automation/engine';
import { formatMoney } from '@/lib/i18n/format';
import { money } from '@/lib/money';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createHandler({ permission: 'payments.view' }, async ({ request }) => {
  const url = new URL(request.url);
  return list(
    financeRepo.listPayments({
      invoiceId: Number.parseInt(url.searchParams.get('facture') ?? '', 10) || undefined,
      clientId: Number.parseInt(url.searchParams.get('client') ?? '', 10) || undefined,
      projectId: Number.parseInt(url.searchParams.get('projet') ?? '', 10) || undefined,
      from: url.searchParams.get('du') ?? undefined,
      to: url.searchParams.get('au') ?? undefined,
      limit: Math.min(300, Number.parseInt(url.searchParams.get('limit') ?? '100', 10) || 100),
    }),
  );
});

/**
 * POST /api/paiements — record a payment.
 *
 * Over-payment is refused rather than silently accepted: a payment larger than
 * the remaining balance is almost always a typo, and letting it through would
 * quietly corrupt the client's account statement.
 */
export const POST = createHandler(
  { permission: 'payments.create', schema: paymentSchema },
  async ({ body, user, log }) => {
    if (body.invoice_id) {
      const invoice = financeRepo.findInvoice(body.invoice_id);
      if (!invoice) {
        return Response.json({ error: 'Facture introuvable.' }, { status: 400 });
      }
      if (invoice.status === 'cancelled') {
        return Response.json({ error: 'Cette facture est annulée.' }, { status: 409 });
      }
      /**
       * A draft has not been sent to anyone, so there is nothing for a client to
       * have paid. Recording against it would also let the amounts keep changing
       * underneath a payment, which is how a balance silently goes wrong.
       */
      if (invoice.status === 'draft') {
        return Response.json(
          { error: 'Cette facture est encore un brouillon : émettez-la avant d’enregistrer un règlement.' },
          { status: 409 },
        );
      }
      // One-cent tolerance absorbs rounding on the client side.
      if (money(body.amount) > money(invoice.balance_due + 0.01)) {
        return Response.json(
          {
            error: `Le montant dépasse le solde restant (${formatMoney(invoice.balance_due, invoice.currency)}).`,
            fields: { amount: 'Montant supérieur au solde dû.' },
          },
          { status: 400 },
        );
      }
    }

    const id = financeRepo.createPayment({
      invoiceId: body.invoice_id ?? null,
      clientId: body.client_id ?? null,
      projectId: body.project_id ?? null,
      amount: body.amount,
      currency: body.currency,
      method: body.method,
      reference: body.reference ?? null,
      paidAt: body.paid_at ?? undefined,
      status: body.status,
      notes: body.notes ?? null,
      recordedBy: user.id,
    });

    const outcomes = emit('payment.recorded', { paymentId: id, invoiceId: body.invoice_id ?? null });
    const invoice = body.invoice_id ? financeRepo.findInvoice(body.invoice_id) : null;

    log({
      action: 'payment',
      entityType: 'payment',
      entityId: id,
      entityLabel: invoice?.number ?? undefined,
      summary: `Paiement enregistré : ${formatMoney(body.amount, body.currency)}${invoice ? ` (${invoice.number})` : ''}`,
      metadata: {
        method: body.method,
        reference: body.reference,
        invoiceBalance: invoice?.balance_due,
        invoiceStatus: invoice?.status,
      },
    });

    return ok(
      {
        id,
        invoiceStatus: invoice?.status,
        invoiceBalance: invoice?.balance_due,
        automations: outcomes,
      },
      201,
    );
  },
);
