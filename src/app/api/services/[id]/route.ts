import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { serviceSchema, patchOf } from '@/lib/validation/admin';
import { deleteService, findService, updateService } from '@/lib/db/repositories/content';
import { revalidatePublic } from '@/lib/revalidate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'services.view' }, async () => {
    const service = findService(id);
    if (!service) return notFound('Service introuvable.');
    return Response.json({ ok: true, service });
  })(request);
}

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'services.update', schema: patchOf(serviceSchema) },
    async ({ body, log }) => {
      const before = findService(id);
      if (!before) return notFound('Service introuvable.');

      updateService(id, {
        name: body.name,
        slug: body.slug || undefined,
        family: body.family,
        category_id: body.category_id,
        short_description: body.short_description,
        description: body.description,
        icon: body.icon,
        bullets: body.bullets,
        deliverables: body.deliverables,
        starting_price: body.starting_price,
        currency: body.currency,
        price_note: body.price_note,
        duration_note: body.duration_note,
        position: body.position,
        is_published: body.is_published,
        is_featured: body.is_featured,
        seo_title: body.seo_title,
        seo_description: body.seo_description,
      });

      log({
        action: 'update',
        entityType: 'service',
        entityId: id,
        entityLabel: body.name ?? before.name,
        summary: `Service modifié : ${body.name ?? before.name}`,
      });

      revalidatePublic('services');
      return ok({ id, service: findService(id) });
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'services.delete' }, async ({ request: req, log }) => {
    const service = findService(id);
    if (!service) return notFound('Service introuvable.');

    /**
     * A service may already be referenced by quote and invoice lines. Those
     * lines keep their own label and price, so deleting the catalogue entry does
     * not corrupt a document — but unpublishing is usually what was meant, so
     * that is the default and deletion needs `?force=1`.
     */
    const force = new URL(req.url).searchParams.get('force') === '1';
    if (!force && service.is_published === 1) {
      updateService(id, { is_published: false });
      log({
        action: 'update',
        entityType: 'service',
        entityId: id,
        entityLabel: service.name,
        summary: `Service dépublié : ${service.name}`,
      });
      revalidatePublic('services');
      return ok({
        archived: true,
        reason: 'Le service a été retiré du site public. Utilisez la suppression définitive si vous voulez l’effacer.',
      });
    }

    deleteService(id);
    log({
      action: 'delete',
      entityType: 'service',
      entityId: id,
      entityLabel: service.name,
      summary: `Service supprimé : ${service.name}`,
    });
    revalidatePublic('services');
    return ok({ deleted: true });
  })(request);
}
