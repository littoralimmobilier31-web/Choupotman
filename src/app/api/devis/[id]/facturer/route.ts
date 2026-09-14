import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import * as financeRepo from '@/lib/db/repositories/finance';
import { addProjectEvent } from '@/lib/db/repositories/projects';
import { formatMoney } from '@/lib/i18n/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Turns an accepted quote into a draft invoice, copying the lines, discount and
 * VAT so nothing is retyped.
 *
 * Idempotent: a quote that already has an invoice is refused with a link to it,
 * rather than silently billing the client twice.
 */
export async function POST(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'invoices.create' }, async ({ user, log }) => {
    const quote = financeRepo.findQuote(id);
    if (!quote) return notFound('Devis introuvable.');

    const existing = financeRepo.invoiceForQuote(id);
    if (existing) {
      return Response.json(
        { error: `Ce devis a déjà été facturé (${existing.number}).`, invoiceId: existing.id },
        { status: 409 },
      );
    }

    if (quote.status === 'refused' || quote.status === 'archived') {
      return badRequest('Un devis refusé ou archivé ne peut pas être facturé.');
    }

    const invoiceId = financeRepo.invoiceFromQuote(id, user.id);
    if (!invoiceId) return badRequest('Facturation impossible.');

    const invoice = financeRepo.findInvoice(invoiceId);

    // Billing a quote means it was won: record that if it was not already.
    if (quote.status !== 'accepted') {
      financeRepo.updateQuote(id, { status: 'accepted' });
    }

    if (quote.project_id && invoice) {
      addProjectEvent({
        projectId: quote.project_id,
        kind: 'invoice',
        title: `Facture ${invoice.number} créée depuis le devis ${quote.number}`,
        body: formatMoney(invoice.total, invoice.currency),
        actorLabel: user.full_name ?? user.username,
        entityType: 'invoice',
        entityId: invoiceId,
      });
    }

    log({
      action: 'invoice',
      entityType: 'invoice',
      entityId: invoiceId,
      entityLabel: invoice?.number,
      summary: `Facture ${invoice?.number ?? invoiceId} créée depuis le devis ${quote.number}`,
      metadata: { quoteId: id, total: invoice?.total },
    });

    return ok({ invoiceId, number: invoice?.number }, 201);
  })(request);
}
