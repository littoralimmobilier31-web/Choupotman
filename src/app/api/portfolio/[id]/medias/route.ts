import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { portfolioMediaSchema } from '@/lib/validation/admin';
import {
  addPortfolioMedia,
  deletePortfolioMedia,
  findPortfolio,
  listPortfolioMedia,
} from '@/lib/db/repositories/content';
import { revalidatePublic } from '@/lib/revalidate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'portfolio.view' }, async () => {
    if (!findPortfolio(id)) return notFound('Projet introuvable.');
    return Response.json({ ok: true, items: listPortfolioMedia(id) });
  })(request);
}

export async function POST(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'portfolio.update', schema: portfolioMediaSchema },
    async ({ body, log }) => {
      const project = findPortfolio(id);
      if (!project) return notFound('Projet introuvable.');

      // A media with neither a file nor an address would render an empty frame.
      if (!body.file_id && !body.url) {
        return badRequest('Indiquez un fichier de la bibliothèque ou une adresse.');
      }

      const mediaId = addPortfolioMedia({
        portfolioId: id,
        fileId: body.file_id ?? null,
        url: body.url ?? null,
        kind: body.kind,
        caption: body.caption ?? null,
        altText: body.alt_text ?? null,
        position: body.position,
      });

      log({
        action: 'create',
        entityType: 'portfolio_media',
        entityId: mediaId,
        entityLabel: body.caption ?? project.title,
        summary: `Média ajouté au projet « ${project.title} »`,
      });

      revalidatePublic('portfolio');
      return ok({ id: mediaId, items: listPortfolioMedia(id) }, 201);
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'portfolio.update' }, async ({ request: req, log }) => {
    const project = findPortfolio(id);
    if (!project) return notFound('Projet introuvable.');

    const mediaId = parseId(new URL(req.url).searchParams.get('media') ?? undefined);
    if (mediaId === null) return badRequest('Média non précisé.');

    // Scoped to this project: an id from another project must not be deletable here.
    const media = listPortfolioMedia(id).find((row) => row.id === mediaId);
    if (!media) return notFound('Média introuvable.');

    deletePortfolioMedia(mediaId);
    log({
      action: 'delete',
      entityType: 'portfolio_media',
      entityId: mediaId,
      entityLabel: media.caption ?? project.title,
      summary: `Média retiré du projet « ${project.title} »`,
    });

    revalidatePublic('portfolio');
    return ok({ deleted: true, items: listPortfolioMedia(id) });
  })(request);
}
