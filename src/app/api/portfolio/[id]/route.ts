import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { portfolioSchema, patchOf } from '@/lib/validation/admin';
import {
  deletePortfolio,
  findPortfolio,
  listPortfolioMedia,
  updatePortfolio,
} from '@/lib/db/repositories/content';
import { revalidatePublic } from '@/lib/revalidate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'portfolio.view' }, async () => {
    const project = findPortfolio(id);
    if (!project) return notFound('Projet introuvable.');
    return Response.json({ ok: true, project, media: listPortfolioMedia(id) });
  })(request);
}

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'portfolio.update', schema: patchOf(portfolioSchema) },
    async ({ body, log }) => {
      const before = findPortfolio(id);
      if (!before) return notFound('Projet introuvable.');

      updatePortfolio(id, {
        title: body.title,
        slug: body.slug || undefined,
        subtitle: body.subtitle,
        project_id: body.project_id,
        client_id: body.client_id,
        client_name: body.client_name,
        category_id: body.category_id,
        summary: body.summary,
        description: body.description,
        challenge: body.challenge,
        objectives: body.objectives,
        solution: body.solution,
        results: body.results,
        testimonial_quote: body.testimonial_quote,
        testimonial_author: body.testimonial_author,
        testimonial_role: body.testimonial_role,
        cover_url: body.cover_url,
        project_date: body.project_date,
        year: body.year,
        status: body.status,
        technologies: body.technologies,
        services_done: body.services_done,
        links: body.links,
        videos: body.videos,
        metrics: body.metrics,
        position: body.position,
        is_featured: body.is_featured,
        seo_title: body.seo_title,
        seo_description: body.seo_description,
      });

      log({
        action: 'update',
        entityType: 'portfolio',
        entityId: id,
        entityLabel: body.title ?? before.title,
        summary:
          body.status !== undefined && body.status !== before.status
            ? `Projet portfolio « ${body.title ?? before.title} » : ${before.status} → ${body.status}`
            : `Projet portfolio modifié : ${body.title ?? before.title}`,
      });

      revalidatePublic('portfolio');
      return ok({ id, project: findPortfolio(id) });
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'portfolio.delete' }, async ({ request: req, log }) => {
    const project = findPortfolio(id);
    if (!project) return notFound('Projet introuvable.');

    /**
     * A published réalisation has an address people may have shared. Archiving
     * keeps the record and takes it off the site; `?force=1` is the real delete.
     */
    const force = new URL(req.url).searchParams.get('force') === '1';
    if (!force && project.status !== 'archived') {
      updatePortfolio(id, { status: 'archived' });
      log({
        action: 'update',
        entityType: 'portfolio',
        entityId: id,
        entityLabel: project.title,
        summary: `Projet portfolio archivé : ${project.title}`,
      });
      revalidatePublic('portfolio');
      return ok({
        archived: true,
        reason: 'Le projet a été retiré du site public. Utilisez la suppression définitive pour l’effacer.',
      });
    }

    deletePortfolio(id);
    log({
      action: 'delete',
      entityType: 'portfolio',
      entityId: id,
      entityLabel: project.title,
      summary: `Projet portfolio supprimé : ${project.title}`,
    });

    revalidatePublic('portfolio');
    return ok({ deleted: true });
  })(request);
}
