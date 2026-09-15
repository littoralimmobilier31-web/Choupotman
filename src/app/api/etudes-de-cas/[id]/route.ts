import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { caseStudySchema, patchOf } from '@/lib/validation/admin';
import { deleteCaseStudy, findCaseStudy, updateCaseStudy } from '@/lib/db/repositories/content';
import { revalidatePublic } from '@/lib/revalidate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'case_studies.view' }, async () => {
    const study = findCaseStudy(id);
    if (!study) return notFound('Étude de cas introuvable.');
    return Response.json({ ok: true, study });
  })(request);
}

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'case_studies.update', schema: patchOf(caseStudySchema) },
    async ({ body, log }) => {
      const before = findCaseStudy(id);
      if (!before) return notFound('Étude de cas introuvable.');

      updateCaseStudy(id, {
        title: body.title,
        slug: body.slug || undefined,
        portfolio_id: body.portfolio_id,
        subtitle: body.subtitle,
        problem: body.problem,
        objectives: body.objectives,
        strategy: body.strategy,
        solution: body.solution,
        development: body.development,
        tools_used: body.tools_used,
        result: body.result,
        metrics: body.metrics,
        testimonial_quote: body.testimonial_quote,
        testimonial_author: body.testimonial_author,
        cover_url: body.cover_url,
        status: body.status,
        position: body.position,
        seo_title: body.seo_title,
        seo_description: body.seo_description,
      });

      log({
        action: 'update',
        entityType: 'case_study',
        entityId: id,
        entityLabel: body.title ?? before.title,
        summary: `Étude de cas modifiée : ${body.title ?? before.title}`,
      });

      revalidatePublic('case-studies');
      return ok({ id, study: findCaseStudy(id) });
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'case_studies.delete' }, async ({ request: req, log }) => {
    const study = findCaseStudy(id);
    if (!study) return notFound('Étude de cas introuvable.');

    const force = new URL(req.url).searchParams.get('force') === '1';
    if (!force && study.status !== 'archived') {
      updateCaseStudy(id, { status: 'archived' });
      log({
        action: 'update',
        entityType: 'case_study',
        entityId: id,
        entityLabel: study.title,
        summary: `Étude de cas archivée : ${study.title}`,
      });
      revalidatePublic('case-studies');
      return ok({
        archived: true,
        reason: 'L’étude de cas a été retirée du site public. Utilisez la suppression définitive pour l’effacer.',
      });
    }

    deleteCaseStudy(id);
    log({
      action: 'delete',
      entityType: 'case_study',
      entityId: id,
      entityLabel: study.title,
      summary: `Étude de cas supprimée : ${study.title}`,
    });

    revalidatePublic('case-studies');
    return ok({ deleted: true });
  })(request);
}
