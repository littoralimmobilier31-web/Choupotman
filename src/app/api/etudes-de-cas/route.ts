import { createHandler, list, ok } from '@/lib/api/handler';
import { caseStudySchema } from '@/lib/validation/admin';
import { createCaseStudy, listCaseStudies } from '@/lib/db/repositories/content';
import { revalidatePublic } from '@/lib/revalidate';
import type { PublishStatus } from '@/lib/db/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createHandler({ permission: 'case_studies.view' }, async ({ request }) => {
  const url = new URL(request.url);
  return list(
    listCaseStudies({
      status: (url.searchParams.get('statut') as PublishStatus | 'all') ?? 'all',
      limit: Math.min(200, Number(url.searchParams.get('limite')) || 100),
    }),
  );
});

export const POST = createHandler(
  { permission: 'case_studies.create', schema: caseStudySchema },
  async ({ body, log }) => {
    const id = createCaseStudy({
      title: body.title,
      slug: body.slug || undefined,
      portfolio_id: body.portfolio_id ?? null,
      subtitle: body.subtitle ?? null,
      problem: body.problem ?? null,
      objectives: body.objectives ?? null,
      strategy: body.strategy ?? null,
      solution: body.solution ?? null,
      development: body.development ?? null,
      tools_used: body.tools_used ?? null,
      result: body.result ?? null,
      metrics: body.metrics,
      testimonial_quote: body.testimonial_quote ?? null,
      testimonial_author: body.testimonial_author ?? null,
      cover_url: body.cover_url ?? null,
      status: body.status,
      position: body.position,
      seo_title: body.seo_title ?? null,
      seo_description: body.seo_description ?? null,
    });

    log({
      action: 'create',
      entityType: 'case_study',
      entityId: id,
      entityLabel: body.title,
      summary: `Étude de cas créée : ${body.title}`,
    });

    revalidatePublic('case-studies');
    return ok({ id }, 201);
  },
);
