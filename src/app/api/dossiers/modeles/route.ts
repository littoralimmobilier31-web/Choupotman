import { z } from 'zod';
import { createHandler, list, ok, badRequest } from '@/lib/api/handler';
import { folderTemplateSchema } from '@/lib/validation/admin';
import {
  applyFolderTemplate,
  deleteFolderTemplate,
  findFolderTemplate,
  listFolderTemplates,
  listFolderTemplateItems,
  upsertFolderTemplate,
} from '@/lib/db/repositories/files';
import { findProject } from '@/lib/db/repositories/projects';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Folder templates.
 *
 * A project's folder tree is created from a template so that every project is
 * organised the same way — which is what makes a file findable two years later
 * without remembering where it was put.
 */
export const GET = createHandler({ permission: 'files.view' }, async () =>
  list(
    listFolderTemplates().map((template) => ({
      ...template,
      items: listFolderTemplateItems(template.id).map((item) => item.name),
    })),
  ),
);

export const POST = createHandler(
  { permission: 'files.create', schema: folderTemplateSchema.extend({ id: z.coerce.number().int().positive().optional() }) },
  async ({ body, log }) => {
    const id = upsertFolderTemplate({
      id: body.id,
      name: body.name,
      description: body.description ?? null,
      isDefault: body.is_default,
      items: body.items,
    });

    log({
      action: body.id ? 'update' : 'create',
      entityType: 'folder_template',
      entityId: id,
      entityLabel: body.name,
      summary: `${body.id ? 'Modèle de dossiers modifié' : 'Modèle de dossiers créé'} : ${body.name} (${body.items.length} dossiers)`,
    });

    return ok({ id }, body.id ? 200 : 201);
  },
);

const applySchema = z.object({
  csrf: z.string().optional(),
  project_id: z.coerce.number().int().positive(),
  template_id: z.coerce.number().int().positive().optional(),
});

/**
 * Materialises a template inside a project. Idempotent: a folder that already
 * exists at the target path is left alone, so re-applying after adding a folder
 * to the template creates only what is missing.
 */
export const PUT = createHandler(
  { permission: 'files.create', schema: applySchema },
  async ({ body, log }) => {
    const project = findProject(body.project_id);
    if (!project) return badRequest('Projet introuvable.');

    if (body.template_id && !findFolderTemplate(body.template_id)) {
      return badRequest('Modèle introuvable.');
    }

    const created = applyFolderTemplate({
      projectId: project.id,
      clientId: project.client_id,
      rootName: project.title,
      templateId: body.template_id,
    });

    log({
      action: 'create',
      entityType: 'project',
      entityId: project.id,
      entityLabel: project.title,
      summary:
        created === 0
          ? `Arborescence déjà en place pour ${project.title}`
          : `${created} dossier${created === 1 ? '' : 's'} créé${created === 1 ? '' : 's'} pour ${project.title}`,
    });

    return ok({ created });
  },
);

export const DELETE = createHandler({ permission: 'files.delete' }, async ({ request, log }) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  const template = Number.isInteger(id) && id > 0 ? findFolderTemplate(id) : null;
  if (!template) return badRequest('Modèle introuvable.');

  deleteFolderTemplate(id);
  log({
    action: 'delete',
    entityType: 'folder_template',
    entityId: id,
    entityLabel: template.name,
    summary: `Modèle de dossiers supprimé : ${template.name}`,
  });

  return ok({ deleted: true });
});
