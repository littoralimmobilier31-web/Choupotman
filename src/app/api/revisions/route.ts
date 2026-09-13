import { createHandler, list, ok, notFound } from '@/lib/api/handler';
import { revisionSchema } from '@/lib/validation/admin';
import * as projectsRepo from '@/lib/db/repositories/projects';
import { emit } from '@/lib/automation/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createHandler({ permission: 'revisions.view' }, async ({ request }) => {
  const url = new URL(request.url);
  const filter = {
    status: url.searchParams.get('statut') ?? undefined,
    projectId: Number.parseInt(url.searchParams.get('projet') ?? '', 10) || undefined,
    extraOnly: url.searchParams.get('supplement') === '1',
    unbilledOnly: url.searchParams.get('afacturer') === '1',
    limit: Math.min(500, Number.parseInt(url.searchParams.get('limit') ?? '200', 10) || 200),
  };
  return list(projectsRepo.listRevisionsAcross(filter), { total: projectsRepo.countRevisions(filter) });
});

export const POST = createHandler(
  { permission: 'revisions.create', schema: revisionSchema },
  async ({ body, user, log }) => {
    const project = projectsRepo.findProject(body.project_id);
    if (!project) return notFound('Projet introuvable.');

    // The repository decides the index and whether the allowance is exceeded, in
    // a single transaction — two simultaneous requests cannot both take the last
    // included revision.
    const revision = projectsRepo.createRevision({
      projectId: body.project_id,
      title: body.title ?? null,
      description: body.description ?? null,
      requestedBy: body.requested_by,
      extraCostOverride: body.extra_cost_override ?? null,
    });

    projectsRepo.addProjectEvent({
      projectId: body.project_id,
      kind: 'revision',
      title: `Révision #${revision.indexNumber}${revision.isExtra ? ' (supplémentaire)' : ''}`,
      body: body.description ?? null,
      actorLabel: user.full_name ?? user.username,
      entityType: 'revision',
      entityId: revision.id,
    });

    // Overflow billing, notification and timeline entry are the automation's job.
    const outcomes = emit('revision.created', {
      projectId: body.project_id,
      revisionId: revision.id,
      isExtra: revision.isExtra,
      extraCost: revision.extraCost,
      indexNumber: revision.indexNumber,
    });

    log({
      action: 'create',
      entityType: 'revision',
      entityId: revision.id,
      entityLabel: `Révision #${revision.indexNumber}`,
      summary: `Révision #${revision.indexNumber} enregistrée sur ${project.title}${
        revision.isExtra ? ` — supplément ${revision.extraCost}` : ''
      }`,
      metadata: { isExtra: revision.isExtra, extraCost: revision.extraCost, automations: outcomes },
    });

    return ok(
      {
        id: revision.id,
        indexNumber: revision.indexNumber,
        isExtra: revision.isExtra,
        extraCost: revision.extraCost,
        summary: projectsRepo.getRevisionSummary(body.project_id),
      },
      201,
    );
  },
);
