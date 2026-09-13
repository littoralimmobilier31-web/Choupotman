import { createHandler, list, ok } from '@/lib/api/handler';
import { clientSchema } from '@/lib/validation/admin';
import * as clientsRepo from '@/lib/db/repositories/clients';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** GET /api/clients — filtered list with the roll-ups the CRM table shows. */
export const GET = createHandler({ permission: 'clients.view' }, async ({ request }) => {
  const url = new URL(request.url);
  const items = clientsRepo.listClients({
    search: url.searchParams.get('q') ?? undefined,
    status: (url.searchParams.get('statut') as 'active' | 'inactive' | 'archived' | 'all') ?? undefined,
    country: url.searchParams.get('pays') ?? undefined,
    sort: (url.searchParams.get('tri') as 'name' | 'recent' | 'revenue') ?? undefined,
    limit: Math.min(200, Number.parseInt(url.searchParams.get('limit') ?? '100', 10) || 100),
    offset: Math.max(0, Number.parseInt(url.searchParams.get('offset') ?? '0', 10) || 0),
  });
  return list(items, { total: clientsRepo.countClients() });
});

/** POST /api/clients — create. */
export const POST = createHandler(
  { permission: 'clients.create', schema: clientSchema },
  async ({ body, user, log }) => {
    const id = clientsRepo.createClient({
      name: body.name,
      company: body.company ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      whatsapp: body.whatsapp ?? null,
      country: body.country ?? null,
      city: body.city ?? null,
      address: body.address ?? null,
      website: body.website ?? null,
      social: body.social,
      tax_id: body.tax_id ?? null,
      currency: body.currency,
      preferred_locale: body.preferred_locale,
      status: body.status,
      source: body.source ?? 'manual',
      notes: body.notes ?? null,
      created_by: user.id,
    });

    log({
      action: 'create',
      entityType: 'client',
      entityId: id,
      entityLabel: body.name,
      summary: `Client créé : ${body.name}`,
    });

    return ok({ id }, 201);
  },
);
