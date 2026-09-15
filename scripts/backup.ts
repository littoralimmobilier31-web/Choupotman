#!/usr/bin/env tsx
/**
 * Takes a database backup from the command line.
 *
 *   npm run backup
 *   npm run backup -- --keep 30
 *
 * This is what a scheduled job should call. It uses the same code path as the
 * admin's "Sauvegarder maintenant" button — SQLite's online backup API, not a
 * file copy — so a backup taken while the application is serving requests is
 * still consistent.
 *
 * Run it from cron, systemd timer, or the host's scheduler:
 *
 *   0 3 * * *  cd /srv/choupotman && /usr/bin/npm run backup >> var/log/backup.log 2>&1
 *
 * Uploaded files are NOT included — see docs/DEPLOYMENT.md. They live in
 * `data/uploads` and belong in the server-level backup alongside this file.
 */
import { createBackup, listBackups, pruneBackups } from '../src/lib/backup';
import { closeDb } from '../src/lib/db/client';
import { logActivity } from '../src/lib/db/repositories/activity';

function parseKeep(argv: string[]): number {
  const index = argv.indexOf('--keep');
  if (index === -1) return 14;
  const value = Number.parseInt(argv[index + 1] ?? '', 10);
  return Number.isInteger(value) && value > 0 ? value : 14;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const units = ['Ko', 'Mo', 'Go'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(1).replace('.', ',')} ${units[unit]}`;
}

async function main(): Promise<void> {
  const keep = parseKeep(process.argv.slice(2));

  try {
    const file = await createBackup();
    const pruned = await pruneBackups(keep);
    const remaining = await listBackups();

    // Recorded without a user: a scheduled backup has no operator, and the
    // journal should still show that a full copy of the data was produced.
    logActivity({
      userId: null,
      actorLabel: 'planificateur',
      action: 'backup',
      entityType: 'backup',
      entityLabel: file.name,
      summary: `Sauvegarde planifiée : ${file.name} (${formatBytes(file.sizeBytes)})`,
      metadata: { checksum: file.checksum, pruned: pruned.length, keep },
    });

    console.log(`✓ ${file.name} — ${formatBytes(file.sizeBytes)}`);
    console.log(`  empreinte SHA-256 : ${file.checksum}`);
    if (pruned.length > 0) {
      console.log(`  ${pruned.length} ancienne(s) sauvegarde(s) supprimée(s) (conservation : ${keep})`);
    }
    console.log(`  ${remaining.length} sauvegarde(s) disponible(s)`);
    console.log('');
    console.log('Rappel : les fichiers envoyés (data/uploads) ne sont pas inclus.');
  } catch (error) {
    console.error('✗ La sauvegarde a échoué.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    closeDb();
  }
}

void main();
