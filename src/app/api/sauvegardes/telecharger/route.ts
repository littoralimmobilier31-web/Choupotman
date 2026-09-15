import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { Readable } from 'node:stream';
import { apiRequire } from '@/lib/auth/guard';
import { BackupError, backupPath } from '@/lib/backup';
import { logActivity } from '@/lib/db/repositories/activity';
import { clientIp } from '@/lib/auth/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Downloads a backup.
 *
 * A backup file is the entire database — every client, every invoice, every
 * password hash. So it needs the strongest permission in the application, it is
 * never cached, and every download is recorded: knowing when a full copy of the
 * data left the server is exactly the kind of thing an audit trail is for.
 */
export async function GET(request: Request): Promise<Response> {
  const auth = await apiRequire('backups.export');
  if (!auth.ok) return auth.response;

  const name = new URL(request.url).searchParams.get('fichier');
  if (!name) return Response.json({ error: 'Sauvegarde non précisée.' }, { status: 400 });

  try {
    // `backupPath` validates the name and refuses anything outside the directory.
    const path = await backupPath(name);
    const info = await stat(path);

    logActivity({
      userId: auth.user.id,
      actorLabel: auth.user.username,
      ip: clientIp(request),
      action: 'export',
      entityType: 'backup',
      entityLabel: name,
      summary: `Sauvegarde téléchargée : ${name}`,
    });

    const stream = Readable.toWeb(createReadStream(path)) as ReadableStream<Uint8Array>;

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/vnd.sqlite3',
        'Content-Length': String(info.size),
        'Content-Disposition': `attachment; filename="${name}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof BackupError ? error.message : 'Sauvegarde introuvable.' },
      { status: 404 },
    );
  }
}
