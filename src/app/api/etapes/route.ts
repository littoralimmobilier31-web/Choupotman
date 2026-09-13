import { createHandler, list, ok, badRequest, notFound } from '@/lib/api/handler';
import { stageSchema } from '@/lib/validation/admin';
import * as projectsRepo from '@/lib/db/repositories/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createHandler({ permission: 'projects.view' }, async ({ request }) => {
  const url = new URL(request.url);
  const projectId = Number.parseInt(url.searchParams.get('projet') ?? '', 10);
  if (!Number.isInteger(projectId) || projectId <= 0) {
    return badRequest('Le paramètre « projet » est requis.');
  }
  return list(projectsRepo.listStages(projectId));
});

export const POST = createHandler(
  { permission: 'projects.update', schema: stageSchema },
  async ({ body, user, log }) => {
    // A stage only exists inside a project: refuse a dangling parent rather than
    // relying on the foreign key to fail with an opaque 500.
    const project = projectsRepo.findProject(body.project_id);
    if (!project) return notFound('Projet introuvable.');

    const id = projectsRepo.createStage({
      projectId: body.project_id,
      name: body.name,
      description: body.description ?? null,
      dueDate: body.due_date ?? null,
      position: body.position,
    });

    projectsRepo.addProjectEvent({
      projectId: body.project_id,
      kind: 'stage',
      title: `Étape ajoutée : ${body.name}`,
      actorLabel: user.full_name ?? user.username,
      entityType: 'stage',
      entityId: id,
    });

    log({
      action: 'create',
      entityType: 'stage',
      entityId: id,
      entityLabel: body.name,
      summary: `Étape créée : ${body.name} (${project.title})`,
    });

    return ok({ id, stages: projectsRepo.listStages(body.project_id) }, 201);
  },
);
