import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { testimonialSchema, patchOf } from '@/lib/validation/admin';
import { deleteTestimonial, findTestimonial, upsertTestimonial } from '@/lib/db/repositories/content';
import { revalidatePublic } from '@/lib/revalidate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'testimonials.view' }, async () => {
    const testimonial = findTestimonial(id);
    if (!testimonial) return notFound('Témoignage introuvable.');
    return Response.json({ ok: true, testimonial });
  })(request);
}

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'testimonials.update', schema: patchOf(testimonialSchema) },
    async ({ body, log }) => {
      const before = findTestimonial(id);
      if (!before) return notFound('Témoignage introuvable.');

      /**
       * `upsertTestimonial` writes the whole row, so the patch is merged onto
       * the stored values here. Sending only `{ is_published: true }` must not
       * blank out the quote.
       */
      upsertTestimonial({
        id,
        author_name: body.author_name ?? before.author_name,
        author_role: body.author_role !== undefined ? body.author_role : before.author_role,
        company: body.company !== undefined ? body.company : before.company,
        avatar_url: body.avatar_url !== undefined ? body.avatar_url : before.avatar_url,
        quote: body.quote ?? before.quote,
        rating: body.rating !== undefined ? body.rating : before.rating,
        client_id: body.client_id !== undefined ? body.client_id : before.client_id,
        project_id: body.project_id !== undefined ? body.project_id : before.project_id,
        locale: body.locale ?? before.locale,
        is_published: body.is_published ?? before.is_published === 1,
        position: body.position ?? before.position,
      });

      log({
        action: 'update',
        entityType: 'testimonial',
        entityId: id,
        entityLabel: body.author_name ?? before.author_name,
        summary: `Témoignage modifié : ${body.author_name ?? before.author_name}`,
      });

      revalidatePublic('home');
      return ok({ id, testimonial: findTestimonial(id) });
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'testimonials.delete' }, async ({ request: req, log }) => {
    const testimonial = findTestimonial(id);
    if (!testimonial) return notFound('Témoignage introuvable.');

    // Unpublishing is almost always what was meant; `?force=1` really deletes.
    const force = new URL(req.url).searchParams.get('force') === '1';
    if (!force && testimonial.is_published === 1) {
      upsertTestimonial({
        id,
        author_name: testimonial.author_name,
        author_role: testimonial.author_role,
        company: testimonial.company,
        avatar_url: testimonial.avatar_url,
        quote: testimonial.quote,
        rating: testimonial.rating,
        client_id: testimonial.client_id,
        project_id: testimonial.project_id,
        locale: testimonial.locale,
        is_published: false,
        position: testimonial.position,
      });
      log({
        action: 'update',
        entityType: 'testimonial',
        entityId: id,
        entityLabel: testimonial.author_name,
        summary: `Témoignage dépublié : ${testimonial.author_name}`,
      });
      revalidatePublic('home');
      return ok({
        archived: true,
        reason: 'Le témoignage a été retiré du site public. Utilisez la suppression définitive pour l’effacer.',
      });
    }

    deleteTestimonial(id);
    log({
      action: 'delete',
      entityType: 'testimonial',
      entityId: id,
      entityLabel: testimonial.author_name,
      summary: `Témoignage supprimé : ${testimonial.author_name}`,
    });

    revalidatePublic('home');
    return ok({ deleted: true });
  })(request);
}
