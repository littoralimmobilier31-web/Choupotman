import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { findMoodboardByShareToken, listMoodboardItems } from '@/lib/db/repositories/moodboards';
import { findFile } from '@/lib/db/repositories/files';
import { resolveStoredPath, streamStoredFile } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Serves an image that a shared moodboard displays, to a visitor with no account.
 *
 * The share token is the credential, and it is checked against this exact file:
 * the file must be referenced by an item of the board that token opens. So the
 * route cannot be used to read the library — a valid token plus someone else's
 * file id is a 404, the same answer as a wrong token.
 *
 * Only images are served, always inline, always with `nosniff`: the board shows
 * pictures, and nothing here should be able to hand a visitor a document.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ token: string; fileId: string }> },
): Promise<Response> {
  const { token, fileId: rawId } = await context.params;

  const board = findMoodboardByShareToken(token);
  if (!board) return new Response(null, { status: 404 });

  const fileId = Number.parseInt(rawId, 10);
  if (!Number.isInteger(fileId) || fileId <= 0) return new Response(null, { status: 404 });

  // The file has to be on this board, not merely in the library.
  const referenced = listMoodboardItems(board.id).some((item) => item.file_id === fileId);
  if (!referenced) return new Response(null, { status: 404 });

  const file = findFile(fileId);
  if (!file || file.kind !== 'image') return new Response(null, { status: 404 });

  try {
    const info = await stat(resolveStoredPath(file.stored_name));
    if (!info.isFile()) throw new Error('not a file');

    const stream = Readable.toWeb(streamStoredFile(file.stored_name)) as ReadableStream<Uint8Array>;

    return new Response(stream, {
      headers: {
        'Content-Type': file.mime_type || 'application/octet-stream',
        'Content-Length': String(info.size),
        'Content-Disposition': `inline; filename="${encodeURIComponent(file.original_name)}"`,
        // The token is unguessable but shareable: cache in the browser only.
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
}
