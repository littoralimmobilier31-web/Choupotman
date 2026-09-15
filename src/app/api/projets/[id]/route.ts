import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { projectSchema, patchOf } from '@/lib/validation/admin';
import { diffFields } from '@/lib/db/repositories/activity';
import * as projectsRepo from '@/lib/db/repositories/projects';
import { listInvoices, listQuotes, listContracts } from '@/lib/db/repositories/finance';
import { listFiles } from '@/lib/db/repositories/files';
import { emit } from '@/lib/automation/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'projects.view' }, async () => {
    const project = projectsRepo.findProject(id);
    if (!project) return notFound('Projet introuvable.');

    return Response.json({
      ok: true,
      project,
      stages: projectsRepo.listStages(id),
      tasks: projectsRepo.listTasks({ projectId: id, status: 'all', limit: 500 }),
      revisions: projectsRepo.listRevisions(id),
      revisionSummary: projectsRepo.getRevisionSummary(id),
      feedback: projectsRepo.listFeedback({ projectId: id }),
      events: projectsRepo.listProjectEvents(id, 100),
      quotes: listQuotes({ projectId: id }),
      invoices: listInvoices({ projectId: id }),
      contracts: listContracts({ projectId: id }),
      files: listFiles({ projectId: id, limit: 100 }),
    });
  })(request);
}

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'projects.update', schema: patchOf(projectSchema) },
    async ({ body, user, log }) => {
      const before = projectsRepo.findProject(id);
      if (!before) return notFound('Projet introuvable.');

      projectsRepo.updateProject(id, {
        title: body.title,
        client_id: body.client_id,
        category_id: body.category_id,
        description: body.description,
        status: body.status,
        priority: body.priority,
        budget: body.budget,
        currency: body.currency,
        start_date: body.start_date,
        delivery_date: body.delivery_date,
        revisions_included: body.revisions_included,
        revision_extra_cost: body.revision_extra_cost,
        notes: body.notes,
        color: body.color,
      });

      // A status change is a story beat: record it on the timeline and let the
      // automation engine react (e.g. a delivery closing the project).
      if (body.status && body.status !== before.status) {
        projectsRepo.addProjectEvent({
          projectId: id,
          kind: 'status',
          title: `Statut : ${projectsRepo.projectStatusLabel(before.status)} → ${projectsRepo.projectStatusLabel(body.status)}`,
          actorLabel: user.full_name ?? user.username,
          metadata: { from: before.status, to: body.status },
        });
        emit('project.status_changed', {
          projectId: id,
          from: before.status,
          to: body.status,
          actorLabel: user.username,
        });
      }

      log({
        action: body.status && body.status !== before.status ? 'status_change' : 'update',
        entityType: 'project',
        entityId: id,
        entityLabel: body.title ?? before.title,
        summary: `Projet modifié : ${body.title ?? before.title}`,
        metadata: {
          changes: diffFields(before as unknown as Record<string, unknown>, body as Record<string, unknown>),
        },
      });

      return ok({ id });
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'projects.delete' }, async ({ log, request: req }) => {
    const project = projectsRepo.findProject(id);
    if (!project) return notFound('Projet introuvable.');

    const url = new URL(req.url);
    const force = url.searchParams.get('force') === '1';
    const invoices = listInvoices({ projectId: id, limit: 5 });

    /**
     * A project with issued invoices is archived rather than deleted: deleting it
     * would detach accounting records from their context. Forcing is possible but
     * must be explicit.
     */
    if (!force && invoices.some((invoice) => invoice.status !== 'draft')) {
      projectsRepo.updateProject(id, { status: 'archived' });
      log({
        action: 'update',
        entityType: 'project',
        entityId: id,
        entityLabel: project.title,
        summary: `Projet archivé (factures émises) : ${project.title}`,
      });
      return ok({
        archived: true,
        reason: 'Des factures ont été émises pour ce projet : il a été archivé au lieu d’être supprimé.',
      });
    }

    projectsRepo.deleteProject(id);
    log({
      action: 'delete',
      entityType: 'project',
      entityId: id,
      entityLabel: project.title,
      summary: `Projet supprimé : ${project.title}`,
    });
    return ok({ deleted: true });
  })(request);
}
