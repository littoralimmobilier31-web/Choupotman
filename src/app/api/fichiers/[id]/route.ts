import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { fileUpdateSchema } from '@/lib/validation/admin';
import { deleteFileRecord, findFile, findFolder, updateFile } from '@/lib/db/repositories/files';
import { deleteStoredFile } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'files.view' }, async () => {
    const file = findFile(id);
    if (!file) return notFound('Fichier introuvable.');
    return Response.json({ ok: true, file });
  })(request);
}

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'files.update', schema: fileUpdateSchema },
    async ({ body, log }) => {
      const file = findFile(id);
      if (!file) return notFound('Fichier introuvable.');

      if (body.folder_id && !findFolder(body.folder_id)) {
        return badRequest('Dossier de destination introuvable.');
      }

      updateFile(id, {
        original_name: body.original_name,
        caption: body.caption,
        folder_id: body.folder_id,
        is_client_visible: body.is_client_visible,
      });

      /**
       * Sharing a file with the client is the one change here with a visible
       * consequence outside the admin, so it is logged in its own words rather
       * than as a generic "file modified".
       */
      const shared = body.is_client_visible;
      log({
        action: 'update',
        entityType: 'file',
        entityId: id,
        entityLabel: body.original_name ?? file.original_name,
        summary:
          shared !== undefined && shared !== (file.is_client_visible === 1)
            ? shared
              ? `Fichier partagé avec le client : ${file.original_name}`
              : `Partage client retiré : ${file.original_name}`
            : `Fichier modifié : ${body.original_name ?? file.original_name}`,
      });

      return ok({ id, file: findFile(id) });
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'files.delete' }, async ({ log }) => {
    const file = findFile(id);
    if (!file) return notFound('Fichier introuvable.');

    // Row first, blob second: a missing blob with no row is invisible, whereas a
    // row pointing at nothing shows up as a broken download.
    const removed = deleteFileRecord(id);
    if (removed) await deleteStoredFile(removed.stored_name);

    log({
      action: 'delete',
      entityType: 'file',
      entityId: id,
      entityLabel: file.original_name,
      summary: `Fichier supprimé : ${file.original_name}`,
      metadata: { sizeBytes: file.size_bytes, kind: file.kind },
    });

    return ok({ deleted: true });
  })(request);
}
