import { createHandler, ok, badRequest } from '@/lib/api/handler';
import {
  BackupError,
  createBackup,
  deleteBackup,
  listBackups,
  pruneBackups,
  restoreInstructions,
} from '@/lib/backup';
import { config } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createHandler({ permission: 'backups.view' }, async () => {
  const files = await listBackups();
  return Response.json({
    ok: true,
    items: files,
    // Stated explicitly: a backup covers the database, not the uploaded files.
    covers: ['La base de données complète (clients, projets, factures, contenus, journaux).'],
    excludes: [`Les fichiers envoyés (${config.storage.uploadDir}) — à sauvegarder au niveau du serveur.`],
    restore: files[0] ? restoreInstructions(files[0].name) : null,
  });
});

/**
 * Takes a backup now.
 *
 * Uses SQLite's online backup API rather than copying the file, because the
 * database runs in WAL mode: a plain copy taken mid-write can open successfully
 * and still be missing the last transactions, which is the worst kind of backup —
 * one that looks fine until it is needed.
 */
export const POST = createHandler({ permission: 'backups.create' }, async ({ log }) => {
  try {
    const file = await createBackup();
    const pruned = await pruneBackups(14);

    log({
      action: 'backup',
      entityType: 'backup',
      entityLabel: file.name,
      summary: `Sauvegarde créée : ${file.name} (${Math.round(file.sizeBytes / 1024)} Ko)`,
      metadata: { checksum: file.checksum, pruned: pruned.length },
    });

    return ok({ file, pruned }, 201);
  } catch (error) {
    console.error('Backup failed', error);
    return Response.json(
      {
        error: 'La sauvegarde a échoué.',
        reason:
          error instanceof BackupError
            ? error.message
            : 'Vérifiez l’espace disque disponible et les droits d’écriture sur le dossier de sauvegarde.',
      },
      { status: 500 },
    );
  }
});

export const DELETE = createHandler({ permission: 'backups.delete' }, async ({ request, log }) => {
  const name = new URL(request.url).searchParams.get('fichier');
  if (!name) return badRequest('Sauvegarde non précisée.');

  try {
    await deleteBackup(name);
    log({
      action: 'delete',
      entityType: 'backup',
      entityLabel: name,
      summary: `Sauvegarde supprimée : ${name}`,
    });
    return ok({ deleted: true });
  } catch (error) {
    // An invalid or escaping name lands here, and says nothing about the disk.
    return badRequest(error instanceof BackupError ? error.message : 'Suppression impossible.');
  }
});
