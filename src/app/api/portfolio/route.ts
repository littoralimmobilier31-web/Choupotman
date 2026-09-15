import { createHandler, list, ok } from '@/lib/api/handler';
import { portfolioSchema } from '@/lib/validation/admin';
import { countPortfolio, createPortfolio, listPortfolio } from '@/lib/db/repositories/content';
import { revalidatePublic } from '@/lib/revalidate';
import type { PublishStatus } from '@/lib/db/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createHandler({ permission: 'portfolio.view' }, async ({ request }) => {
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('taille') ?? 30) || 30));

  const filter = {
    // 'all' by default: the admin manages drafts and archives too.
    status: (url.searchParams.get('statut') as PublishStatus | 'all') ?? 'all',
    categoryId: Number(url.searchParams.get('categorie')) || undefined,
    technology: url.searchParams.get('techno') ?? undefined,
    year: Number(url.searchParams.get('annee')) || undefined,
    search: url.searchParams.get('q') ?? undefined,
  };

  return list(listPortfolio({ ...filter, limit: pageSize, offset: (page - 1) * pageSize }), {
    total: countPortfolio(filter),
    page,
    pageSize,
  });
});

/**
 * Creates a portfolio entry.
 *
 * Nothing is pre-filled: a réalisation exists on the public site only because
 * it was described here, which is what keeps the portfolio honest.
 */
export const POST = createHandler(
  { permission: 'portfolio.create', schema: portfolioSchema },
  async ({ body, log }) => {
    const id = createPortfolio({
      title: body.title,
      slug: body.slug || undefined,
      subtitle: body.subtitle ?? null,
      project_id: body.project_id ?? null,
      client_id: body.client_id ?? null,
      client_name: body.client_name ?? null,
      category_id: body.category_id ?? null,
      summary: body.summary ?? null,
      description: body.description ?? null,
      challenge: body.challenge ?? null,
      objectives: body.objectives ?? null,
      solution: body.solution ?? null,
      results: body.results ?? null,
      testimonial_quote: body.testimonial_quote ?? null,
      testimonial_author: body.testimonial_author ?? null,
      testimonial_role: body.testimonial_role ?? null,
      cover_url: body.cover_url ?? null,
      project_date: body.project_date ?? null,
      year: body.year ?? null,
      status: body.status,
      technologies: body.technologies,
      services_done: body.services_done,
      links: body.links,
      videos: body.videos,
      metrics: body.metrics,
      position: body.position,
      is_featured: body.is_featured,
      seo_title: body.seo_title ?? null,
      seo_description: body.seo_description ?? null,
    });

    log({
      action: 'create',
      entityType: 'portfolio',
      entityId: id,
      entityLabel: body.title,
      summary: `Projet ajouté au portfolio : ${body.title}`,
    });

    revalidatePublic('portfolio');
    return ok({ id }, 201);
  },
);
