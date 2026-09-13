import { createHandler, list, ok } from '@/lib/api/handler';
import { quoteSchema } from '@/lib/validation/admin';
import * as financeRepo from '@/lib/db/repositories/finance';
import { addProjectEvent } from '@/lib/db/repositories/projects';
import { formatMoney } from '@/lib/i18n/format';
import type { QuoteStatus } from '@/lib/db/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createHandler({ permission: 'quotes.view' }, async ({ request }) => {
  const url = new URL(request.url);
  const items = financeRepo.listQuotes({
    search: url.searchParams.get('q') ?? undefined,
    status: (url.searchParams.get('statut') as QuoteStatus | 'all') ?? undefined,
    clientId: Number.parseInt(url.searchParams.get('client') ?? '', 10) || undefined,
    projectId: Number.parseInt(url.searchParams.get('projet') ?? '', 10) || undefined,
    limit: Math.min(200, Number.parseInt(url.searchParams.get('limit') ?? '100', 10) || 100),
  });
  return list(items, { total: financeRepo.countQuotes() });
});

export const POST = createHandler(
  { permission: 'quotes.create', schema: quoteSchema },
  async ({ body, user, log }) => {
    const id = financeRepo.createQuote({
      client_id: body.client_id ?? null,
      project_id: body.project_id ?? null,
      lead_id: body.lead_id ?? null,
      title: body.title ?? null,
      status: body.status,
      issue_date: body.issue_date ?? undefined,
      valid_until: body.valid_until ?? null,
      currency: body.currency,
      discount_type: body.discount_type,
      discount_value: body.discount_value,
      tax_rate: body.tax_rate,
      delivery_terms: body.delivery_terms ?? null,
      payment_terms: body.payment_terms ?? null,
      conditions: body.conditions ?? null,
      notes: body.notes ?? null,
      locale: body.locale,
      created_by: user.id,
      items: body.items,
    });

    const quote = financeRepo.findQuote(id);

    if (body.project_id && quote) {
      addProjectEvent({
        projectId: body.project_id,
        kind: 'quote',
        title: `Devis ${quote.number} créé`,
        body: formatMoney(quote.total, quote.currency),
        actorLabel: user.full_name ?? user.username,
        entityType: 'quote',
        entityId: id,
      });
    }

    log({
      action: 'quote',
      entityType: 'quote',
      entityId: id,
      entityLabel: quote?.number,
      summary: `Devis créé : ${quote?.number ?? id}`,
      metadata: { total: quote?.total, items: body.items.length },
    });

    return ok({ id, number: quote?.number }, 201);
  },
);
