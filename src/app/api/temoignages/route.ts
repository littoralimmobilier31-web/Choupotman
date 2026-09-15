import { createHandler, list, ok } from '@/lib/api/handler';
import { testimonialSchema } from '@/lib/validation/admin';
import { listTestimonials, upsertTestimonial } from '@/lib/db/repositories/content';
import { revalidatePublic } from '@/lib/revalidate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createHandler({ permission: 'testimonials.view' }, async ({ request }) => {
  const url = new URL(request.url);
  return list(
    listTestimonials({
      publishedOnly: url.searchParams.get('publies') === '1',
      limit: Math.min(200, Number(url.searchParams.get('limite')) || 200),
    }),
  );
});

/**
 * Records a testimonial.
 *
 * The quote is stored exactly as typed. Nothing generates, rewrites or polishes
 * it: a testimonial on the site is something a client actually said, and the
 * only way one gets here is by someone entering it.
 */
export const POST = createHandler(
  { permission: 'testimonials.create', schema: testimonialSchema },
  async ({ body, log }) => {
    const id = upsertTestimonial({
      author_name: body.author_name,
      author_role: body.author_role ?? null,
      company: body.company ?? null,
      avatar_url: body.avatar_url ?? null,
      quote: body.quote,
      rating: body.rating ?? null,
      client_id: body.client_id ?? null,
      project_id: body.project_id ?? null,
      locale: body.locale,
      is_published: body.is_published,
      position: body.position,
    });

    log({
      action: 'create',
      entityType: 'testimonial',
      entityId: id,
      entityLabel: body.author_name,
      summary: `Témoignage ajouté : ${body.author_name}`,
    });

    revalidatePublic('home');
    return ok({ id }, 201);
  },
);
