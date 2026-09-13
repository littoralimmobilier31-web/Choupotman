import { createHandler, list, ok } from '@/lib/api/handler';
import { projectSchema } from '@/lib/validation/admin';
import * as projectsRepo from '@/lib/db/repositories/projects';
import { getSettingNumber } from '@/lib/db/repositories/settings';
import { emit } from '@/lib/automation/engine';
import type { ProjectStatus, Priority } from '@/lib/db/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createHandler({ permission: 'projects.view' }, async ({ request }) => {
  const url = new URL(request.url);
  const items = projectsRepo.listProjects({
    search: url.searchParams.get('q') ?? undefined,
    status: (url.searchParams.get('statut') as ProjectStatus | 'all' | 'active') ?? undefined,
    clientId: Number.parseInt(url.searchParams.get('client') ?? '', 10) || undefined,
    categoryId: Number.parseInt(url.searchParams.get('categorie') ?? '', 10) || undefined,
    priority: (url.searchParams.get('priorite') as Priority) ?? undefined,
    overdueOnly: url.searchParams.get('retard') === '1',
    sort: (url.searchParams.get('tri') as 'recent' | 'delivery' | 'budget' | 'title') ?? undefined,
    limit: Math.min(200, Number.parseInt(url.searchParams.get('limit') ?? '100', 10) || 100),
    offset: Math.max(0, Number.parseInt(url.searchParams.get('offset') ?? '0', 10) || 0),
  });
  return list(items, { total: projectsRepo.countProjects() });
});

/**
 * POST /api/projets — create.
 *
 * Creation emits `project.created`, which is what generates the stages, the
 * starter tasks and the folder tree. Passing `scaffold: false` skips the
 * automation for a project being imported or restored.
 */
export const POST = createHandler(
  { permission: 'projects.create', schema: projectSchema },
  async ({ body, user, log }) => {
    const id = projectsRepo.createProject({
      title: body.title,
      client_id: body.client_id ?? null,
      category_id: body.category_id ?? null,
      description: body.description ?? null,
      status: body.status,
      priority: body.priority,
      budget: body.budget,
      currency: body.currency,
      start_date: body.start_date ?? null,
      delivery_date: body.delivery_date ?? null,
      revisions_included: body.revisions_included ?? getSettingNumber('finance.default_revisions', 3),
      revision_extra_cost: body.revision_extra_cost ?? getSettingNumber('finance.revision_extra_cost', 0),
      notes: body.notes ?? null,
      color: body.color ?? null,
      created_by: user.id,
    });

    projectsRepo.addProjectEvent({
      projectId: id,
      kind: 'created',
      title: 'Projet créé',
      actorLabel: user.full_name ?? user.username,
    });

    const automations = body.scaffold
      ? emit('project.created', { projectId: id, actorLabel: user.username })
      : [];

    log({
      action: 'create',
      entityType: 'project',
      entityId: id,
      entityLabel: body.title,
      summary: `Projet créé : ${body.title}`,
      metadata: { automations: automations.map((a) => ({ key: a.automation, actions: a.actions })) },
    });

    return ok({ id, automations }, 201);
  },
);
