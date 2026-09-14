import { createHandler, list, ok } from '@/lib/api/handler';
import { serviceSchema } from '@/lib/validation/admin';
import { createService, listServices } from '@/lib/db/repositories/content';
import { revalidatePublic } from '@/lib/revalidate';
import type { ServiceFamily } from '@/lib/db/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createHandler({ permission: 'services.view' }, async ({ request }) => {
  const url = new URL(request.url);
  return list(
    listServices({
      family: (url.searchParams.get('famille') as ServiceFamily) ?? undefined,
      publishedOnly: url.searchParams.get('publies') === '1',
    }),
  );
});

export const POST = createHandler(
  { permission: 'services.create', schema: serviceSchema },
  async ({ body, log }) => {
    const id = createService({
      name: body.name,
      slug: body.slug || undefined,
      family: body.family,
      category_id: body.category_id ?? null,
      short_description: body.short_description ?? null,
      description: body.description ?? null,
      icon: body.icon ?? null,
      bullets: body.bullets,
      deliverables: body.deliverables,
      starting_price: body.starting_price ?? null,
      currency: body.currency,
      price_note: body.price_note ?? null,
      duration_note: body.duration_note ?? null,
      position: body.position,
      is_published: body.is_published,
      is_featured: body.is_featured,
      seo_title: body.seo_title ?? null,
      seo_description: body.seo_description ?? null,
    });

    log({
      action: 'create',
      entityType: 'service',
      entityId: id,
      entityLabel: body.name,
      summary: `Service créé : ${body.name}`,
    });

    revalidatePublic('services');
    return ok({ id }, 201);
  },
);
