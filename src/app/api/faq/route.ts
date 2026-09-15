import { createHandler, list, ok } from '@/lib/api/handler';
import { faqSchema } from '@/lib/validation/admin';
import { listFaqs, upsertFaq } from '@/lib/db/repositories/content';
import { revalidatePublic } from '@/lib/revalidate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The FAQ shown on the public /services page.
 *
 * It lives under the `services` permission rather than a resource of its own:
 * whoever maintains the offer maintains the questions people ask about it.
 */
export const GET = createHandler({ permission: 'services.view' }, async ({ request }) => {
  const url = new URL(request.url);
  return list(listFaqs({ publishedOnly: url.searchParams.get('publies') === '1' }));
});

export const POST = createHandler(
  { permission: 'services.create', schema: faqSchema },
  async ({ body, log }) => {
    const id = upsertFaq({
      question: body.question,
      answer: body.answer,
      category: body.category ?? null,
      position: body.position,
      is_published: body.is_published,
    });

    log({
      action: 'create',
      entityType: 'faq',
      entityId: id,
      entityLabel: body.question,
      summary: `Question ajoutée à la FAQ : ${body.question}`,
    });

    revalidatePublic('services');
    return ok({ id }, 201);
  },
);
