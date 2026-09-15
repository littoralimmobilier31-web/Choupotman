import { createHandler, badRequest } from '@/lib/api/handler';
import { countFiles, createFile, findFolder, listFiles, listFolders, totalStorageBytes } from '@/lib/db/repositories/files';
import { saveUpload, UploadError, deleteStoredFile } from '@/lib/storage';
import type { FileKind } from '@/lib/db/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createHandler({ permission: 'files.view' }, async ({ request }) => {
  const url = new URL(request.url);

  const rawFolder = url.searchParams.get('dossier');
  // "racine" means the files with no folder, which is not the same as "no filter".
  const folderId = rawFolder === 'racine' ? null : Number(rawFolder) || undefined;

  const filter = {
    folderId,
    projectId: Number(url.searchParams.get('projet')) || undefined,
    clientId: Number(url.searchParams.get('client')) || undefined,
    kind: (url.searchParams.get('type') as FileKind) || undefined,
    search: url.searchParams.get('q') ?? undefined,
    clientVisibleOnly: url.searchParams.get('partages') === '1',
  };

  return Response.json({
    ok: true,
    items: listFiles({ ...filter, limit: 300 }),
    folders: listFolders({ parentId: folderId ?? null }),
    total: countFiles({ projectId: filter.projectId, kind: filter.kind }),
    storageBytes: totalStorageBytes(),
  });
});

/**
 * Uploads one or more files.
 *
 * Every byte goes through `saveUpload`, which is the only place a file is written
 * to disk: it checks the extension against an allow-list, requires the declared
 * MIME type to agree with it, verifies magic bytes where a signature exists,
 * enforces the size limit and stores the blob under a random name. The user's
 * filename is metadata only.
 *
 * A batch is not atomic on purpose — one rejected file (wrong type, too large)
 * should not throw away the four that were fine — so the response reports each
 * outcome and the interface shows which ones were refused and why.
 */
export const POST = createHandler(
  { permission: 'files.create', rateLimitPolicy: 'upload' },
  async ({ form, user, log }) => {
    if (!form) return badRequest('Envoyez le fichier en multipart/form-data.');

    const files = form.getAll('fichiers').filter((entry): entry is File => entry instanceof File);
    if (files.length === 0) return badRequest('Aucun fichier reçu.');
    if (files.length > 20) return badRequest('20 fichiers au maximum par envoi.');

    const folderId = Number(form.get('folder_id')) || null;
    const folder = folderId ? findFolder(folderId) : null;
    if (folderId && !folder) return badRequest('Dossier introuvable.');

    // A file dropped into a project's folder belongs to that project without
    // anyone having to say so twice.
    const projectId = Number(form.get('project_id')) || folder?.project_id || null;
    const clientId = Number(form.get('client_id')) || folder?.client_id || null;
    const isClientVisible = form.get('is_client_visible') === 'true';

    const created: { id: number; name: string }[] = [];
    const rejected: { name: string; reason: string }[] = [];

    for (const file of files) {
      let stored: Awaited<ReturnType<typeof saveUpload>> | null = null;
      try {
        stored = await saveUpload(file);
        const id = createFile({
          folderId,
          projectId,
          clientId,
          originalName: stored.originalName,
          storedName: stored.storedName,
          mimeType: stored.mimeType,
          extension: stored.extension,
          sizeBytes: stored.sizeBytes,
          checksum: stored.checksum,
          isClientVisible,
          uploadedBy: user.id,
        });
        created.push({ id, name: stored.originalName });
      } catch (error) {
        // The blob is written before the row; if the insert fails, remove it
        // rather than leave an unreferenced file on disk.
        if (stored) await deleteStoredFile(stored.storedName).catch(() => undefined);
        rejected.push({
          name: file.name || 'fichier',
          reason: error instanceof UploadError ? error.message : 'Enregistrement impossible.',
        });
        if (!(error instanceof UploadError)) console.error('Upload failed', error);
      }
    }

    if (created.length > 0) {
      log({
        action: 'create',
        entityType: 'file',
        entityId: created[0]?.id,
        entityLabel: created[0]?.name,
        summary:
          created.length === 1
            ? `Fichier ajouté : ${created[0]?.name}`
            : `${created.length} fichiers ajoutés${folder ? ` dans ${folder.name}` : ''}`,
        metadata: { folderId, projectId, rejected: rejected.length },
      });
    }

    // Nothing stored at all is a failed request; a partial batch is a success
    // that names its casualties.
    const status = created.length === 0 ? 400 : 201;
    return Response.json({ ok: created.length > 0, created, rejected }, { status });
  },
);
