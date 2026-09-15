import { z } from 'zod';
import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import {
  deleteFolder,
  findFolder,
  folderSubtree,
  listFiles,
  renameFolder,
} from '@/lib/db/repositories/files';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const renameSchema = z.object({
  csrf: z.string().optional(),
  name: z.string().trim().min(1, 'Le nom est requis.').max(120),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'files.update', schema: renameSchema },
    async ({ body, log }) => {
      const folder = findFolder(id);
      if (!folder) return notFound('Dossier introuvable.');

      // `renameFolder` rewrites the materialised path of every descendant, so a
      // rename never leaves the subtree unreachable.
      renameFolder(id, body.name);

      log({
        action: 'update',
        entityType: 'folder',
        entityId: id,
        entityLabel: body.name,
        summary: `Dossier renommé : ${folder.name} → ${body.name}`,
      });

      return ok({ id, folder: findFolder(id) });
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'files.delete' }, async ({ request: req, log }) => {
    const folder = findFolder(id);
    if (!folder) return notFound('Dossier introuvable.');

    /**
     * Deleting a folder cascades to its sub-folders and detaches the files inside
     * (they survive at the library root). That is recoverable but surprising, so
     * a folder that is not empty is refused until the caller confirms with
     * `?force=1` — and the refusal says exactly what is inside.
     */
    const subtree = folderSubtree(id);
    const fileCount = subtree.reduce((total, node) => total + listFiles({ folderId: node.id, limit: 1000 }).length, 0);
    const force = new URL(req.url).searchParams.get('force') === '1';

    if (!force && (fileCount > 0 || subtree.length > 1)) {
      return Response.json(
        {
          error: 'Le dossier n’est pas vide.',
          reason:
            `Il contient ${fileCount} fichier${fileCount === 1 ? '' : 's'}` +
            (subtree.length > 1 ? ` et ${subtree.length - 1} sous-dossier${subtree.length > 2 ? 's' : ''}` : '') +
            '. Les fichiers ne seront pas supprimés : ils remonteront à la racine de la bibliothèque.',
          fileCount,
          folderCount: subtree.length - 1,
        },
        { status: 409 },
      );
    }

    deleteFolder(id);
    log({
      action: 'delete',
      entityType: 'folder',
      entityId: id,
      entityLabel: folder.name,
      summary: `Dossier supprimé : ${folder.name}`,
      metadata: { detachedFiles: fileCount, removedFolders: subtree.length - 1 },
    });

    return ok({ deleted: true, detachedFiles: fileCount });
  })(request);
}
