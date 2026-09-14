import { stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { apiClientUser } from '@/lib/auth/guard';
import { portalFile } from '@/lib/db/portal';
import { resolveStoredPath, streamStoredFile } from '@/lib/storage';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Scoped file download for the client portal.
 *
 * Files are served through this handler rather than from a public directory, so
 * two checks always apply: the caller has a portal session, and the file is both
 * marked client-visible and belongs to their own client (`portalFile` enforces
 * both). A file that fails either test is a plain 404 — the same answer as one
 * that does not exist, so the endpoint cannot be used to probe for documents.
 *
 * The stored filename is random; the original name is only restored in the
 * Content-Disposition header, and the response is always an attachment so an
 * uploaded HTML file can never execute in the portal's origin.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> {
  const auth = await apiClientUser();
  if (!auth.ok) return auth.response;

  const { id: raw } = await context.params;
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return Response.json({ error: 'Introuvable.' }, { status: 404 });
  }

  const file = portalFile(auth.clientUser.client_id, id);
  if (!file) return Response.json({ error: 'Introuvable.' }, { status: 404 });

  try {
    // `resolveStoredPath` also refuses any name that would escape the upload root.
    const info = await stat(resolveStoredPath(file.stored_name));
    if (!info.isFile()) throw new Error('not a file');

    const stream = Readable.toWeb(streamStoredFile(file.stored_name)) as ReadableStream<Uint8Array>;

    return new Response(stream, {
      headers: {
        'Content-Type': file.mime_type || 'application/octet-stream',
        'Content-Length': String(info.size),
        // Attachment, always: never render a client's upload inline.
        'Content-Disposition': `attachment; filename="${encodeURIComponent(file.original_name)}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    // The row exists but the bytes do not: still a 404 to the client, and the
    // owner can see the broken reference in the admin.
    return Response.json({ error: 'Fichier indisponible.' }, { status: 404 });
  }
}
