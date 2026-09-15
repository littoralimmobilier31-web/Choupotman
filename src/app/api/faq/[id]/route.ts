import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { faqSchema, patchOf } from '@/lib/validation/admin';
import { deleteFaq, findFaq, upsertFaq } from '@/lib/db/repositories/content';
import { revalidatePublic } from '@/lib/revalidate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'services.update', schema: patchOf(faqSchema) },
    async ({ body, log }) => {
      const before = findFaq(id);
      if (!before) return notFound('Question introuvable.');

      // Full-row upsert: merge onto what is stored so a partial patch is partial.
      upsertFaq({
        id,
        question: body.question ?? before.question,
        answer: body.answer ?? before.answer,
        category: body.category !== undefined ? body.category : before.category,
        position: body.position ?? before.position,
        is_published: body.is_published ?? before.is_published === 1,
      });

      log({
        action: 'update',
        entityType: 'faq',
        entityId: id,
        entityLabel: body.question ?? before.question,
        summary: `Question de FAQ modifiée : ${body.question ?? before.question}`,
      });

      revalidatePublic('services');
      return ok({ id, faq: findFaq(id) });
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'services.delete' }, async ({ log }) => {
    const faq = findFaq(id);
    if (!faq) return notFound('Question introuvable.');

    deleteFaq(id);
    log({
      action: 'delete',
      entityType: 'faq',
      entityId: id,
      entityLabel: faq.question,
      summary: `Question de FAQ supprimée : ${faq.question}`,
    });

    revalidatePublic('services');
    return ok({ deleted: true });
  })(request);
}
