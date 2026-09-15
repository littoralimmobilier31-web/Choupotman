import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { apiRequire } from '@/lib/auth/guard';
import { findFile } from '@/lib/db/repositories/files';
import { resolveStoredPath, streamStoredFile } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Authenticated download of a stored file.
 *
 * Uploads live outside `public/` and are only ever served through a handler, so
 * a session and the `files.view` permission are always required. The response is
 * an attachment with `nosniff`: an uploaded HTML or SVG file can therefore never
 * execute in the admin's origin, which is the whole reason for not serving the
 * upload directory statically.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await apiRequire('files.view');
  if (!auth.ok) return auth.response;

  const { id: raw } = await context.params;
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: 'Identifiant invalide.' }, { status: 400 });
  }

  const file = findFile(id);
  if (!file) return Response.json({ error: 'Fichier introuvable.' }, { status: 404 });

  const inline = new URL(request.url).searchParams.get('apercu') === '1';
  // Only formats that cannot carry script may be previewed in place.
  const previewable = file.kind === 'image' || file.mime_type === 'application/pdf';

  try {
    // `resolveStoredPath` refuses any name that would escape the upload root.
    const info = await stat(resolveStoredPath(file.stored_name));
    if (!info.isFile()) throw new Error('not a file');

    const stream = Readable.toWeb(streamStoredFile(file.stored_name)) as ReadableStream<Uint8Array>;
    const disposition = inline && previewable ? 'inline' : 'attachment';

    return new Response(stream, {
      headers: {
        'Content-Type': file.mime_type || 'application/octet-stream',
        'Content-Length': String(info.size),
        'Content-Disposition': `${disposition}; filename="${encodeURIComponent(file.original_name)}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    // The row exists but the bytes do not — a broken reference the owner needs
    // to see, so say so rather than pretending the file is absent.
    return Response.json({ error: 'Le fichier est référencé mais absent du stockage.' }, { status: 410 });
  }
}
