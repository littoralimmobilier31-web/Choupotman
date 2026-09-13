import { createHandler, list, ok } from '@/lib/api/handler';
import { invoiceSchema } from '@/lib/validation/admin';
import * as financeRepo from '@/lib/db/repositories/finance';
import { addProjectEvent } from '@/lib/db/repositories/projects';
import { formatMoney } from '@/lib/i18n/format';
import type { InvoiceStatus } from '@/lib/db/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createHandler({ permission: 'invoices.view' }, async ({ request }) => {
  const url = new URL(request.url);
  const status = (url.searchParams.get('statut') as InvoiceStatus | 'all' | 'unpaid') ?? undefined;
  const items = financeRepo.listInvoices({
    search: url.searchParams.get('q') ?? undefined,
    status,
    clientId: Number.parseInt(url.searchParams.get('client') ?? '', 10) || undefined,
    projectId: Number.parseInt(url.searchParams.get('projet') ?? '', 10) || undefined,
    from: url.searchParams.get('du') ?? undefined,
    to: url.searchParams.get('au') ?? undefined,
    limit: Math.min(200, Number.parseInt(url.searchParams.get('limit') ?? '100', 10) || 100),
  });
  return list(items, { total: financeRepo.countInvoices() });
});

/**
 * POST /api/factures — create, either from scratch or from an accepted quote
 * (`{ from_quote_id }`), which copies every line and the tax settings.
 */
export const POST = createHandler(
  { permission: 'invoices.create', schema: invoiceSchema.extend({ from_quote_id: invoiceSchema.shape.quote_id }) },
  async ({ body, user, log }) => {
    let id: number;

    if (body.from_quote_id) {
      const created = financeRepo.invoiceFromQuote(body.from_quote_id, user.id);
      if (!created) {
        return Response.json({ error: 'Devis source introuvable.' }, { status: 400 });
      }
      id = created;
    } else {
      id = financeRepo.createInvoice({
        client_id: body.client_id ?? null,
        project_id: body.project_id ?? null,
        quote_id: body.quote_id ?? null,
        title: body.title ?? null,
        status: body.status,
        kind: body.kind,
        issue_date: body.issue_date ?? undefined,
        due_date: body.due_date ?? null,
        currency: body.currency,
        discount_type: body.discount_type,
        discount_value: body.discount_value,
        tax_rate: body.tax_rate,
        payment_terms: body.payment_terms ?? null,
        notes: body.notes ?? null,
        locale: body.locale,
        created_by: user.id,
        items: body.items,
      });
    }

    const invoice = financeRepo.findInvoice(id);

    if (invoice?.project_id) {
      addProjectEvent({
        projectId: invoice.project_id,
        kind: 'invoice',
        title: `Facture ${invoice.number} créée`,
        body: formatMoney(invoice.total, invoice.currency),
        actorLabel: user.full_name ?? user.username,
        entityType: 'invoice',
        entityId: id,
      });
    }

    log({
      action: 'invoice',
      entityType: 'invoice',
      entityId: id,
      entityLabel: invoice?.number,
      summary: `Facture créée : ${invoice?.number ?? id}`,
      metadata: { total: invoice?.total, fromQuote: body.from_quote_id ?? null },
    });

    return ok({ id, number: invoice?.number }, 201);
  },
);
