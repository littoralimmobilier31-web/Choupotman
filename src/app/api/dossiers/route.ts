import { createHandler, list, ok, badRequest } from '@/lib/api/handler';
import { folderSchema } from '@/lib/validation/admin';
import { createFolder, findFolder, listFolders } from '@/lib/db/repositories/files';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createHandler({ permission: 'files.view' }, async ({ request }) => {
  const url = new URL(request.url);
  const rawParent = url.searchParams.get('parent');

  return list(
    listFolders({
      projectId: Number(url.searchParams.get('projet')) || undefined,
      clientId: Number(url.searchParams.get('client')) || undefined,
      parentId: rawParent === 'racine' ? null : Number(rawParent) || undefined,
    }),
  );
});

export const POST = createHandler(
  { permission: 'files.create', schema: folderSchema },
  async ({ body, log }) => {
    const parent = body.parent_id ? findFolder(body.parent_id) : null;
    if (body.parent_id && !parent) return badRequest('Dossier parent introuvable.');

    // Nesting is limited: the materialised path is a single column, and a tree
    // deeper than this is a sign the structure wants rethinking, not extending.
    if (parent && parent.path.split('/').filter(Boolean).length >= 8) {
      return badRequest('Arborescence trop profonde (8 niveaux maximum).');
    }

    const id = createFolder({
      name: body.name,
      parentId: body.parent_id ?? null,
      clientId: body.client_id ?? null,
      projectId: body.project_id ?? null,
    });

    log({
      action: 'create',
      entityType: 'folder',
      entityId: id,
      entityLabel: body.name,
      summary: `Dossier créé : ${body.name}${parent ? ` (dans ${parent.name})` : ''}`,
    });

    return ok({ id, folder: findFolder(id) }, 201);
  },
);
