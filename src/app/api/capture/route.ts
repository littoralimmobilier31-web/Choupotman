import { z } from 'zod';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/auth/rate-limit';
import {
  addMoodboardItem,
  findMoodboard,
  listMoodboardItems,
  resolveCaptureToken,
} from '@/lib/db/repositories/moodboards';
import { createFile } from '@/lib/db/repositories/files';
import { saveUpload, UploadError, deleteStoredFile } from '@/lib/storage';
import { logActivity } from '@/lib/db/repositories/activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Tokenised capture endpoint — the hook a browser extension talks to.
 *
 * This is the one mutating endpoint in the application that accepts no session
 * and no CSRF token, because the caller is not a browser tab on this origin. Its
 * safety comes from the shape of the permission rather than from the caller:
 *
 *   • a capture token grants exactly one action — append an item to the one board
 *     it was issued for. It cannot read the board, list anything, or touch
 *     another board;
 *   • only the token's hash is stored, so the database never holds a usable one;
 *   • it can be revoked and can carry an expiry;
 *   • it is rate-limited per token, so a leaked token cannot be used to fill the
 *     disk;
 *   • an uploaded image goes through the same `saveUpload` validation as any
 *     other upload, restricted here to images.
 *
 * CORS is deliberately open for this route only: an extension's content script
 * has an arbitrary origin, and there is nothing to protect with same-origin
 * policy when the token is the whole credential.
 */

const captureSchema = z.object({
  token: z.string().trim().min(20).max(120),
  kind: z.enum(['image', 'link', 'text', 'color']).default('image'),
  url: z.string().trim().max(1000).optional(),
  source_url: z.string().trim().max(1000).optional(),
  content: z.string().trim().max(2000).optional(),
  color: z.string().trim().max(40).optional(),
  notes: z.string().trim().max(1000).optional(),
});

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Capture-Token',
  'Access-Control-Max-Age': '86400',
};

function fail(message: string, status: number): Response {
  return Response.json({ ok: false, error: message }, { status, headers: CORS });
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: CORS });
}

export async function POST(request: Request): Promise<Response> {
  const contentType = request.headers.get('content-type') ?? '';
  const isMultipart = contentType.includes('multipart/form-data');

  let payload: z.infer<typeof captureSchema>;
  let file: File | null = null;

  if (isMultipart) {
    const form = await request.formData().catch(() => null);
    if (!form) return fail('Requête illisible.', 400);
    const entry = form.get('fichier');
    file = entry instanceof File ? entry : null;
    const parsed = captureSchema.safeParse({
      token: request.headers.get('x-capture-token') ?? form.get('token') ?? '',
      kind: 'image',
      source_url: form.get('source_url') ?? undefined,
      notes: form.get('notes') ?? undefined,
    });
    if (!parsed.success) return fail('Jeton manquant ou invalide.', 400);
    payload = parsed.data;
  } else {
    const raw = await request.json().catch(() => null);
    if (!raw || typeof raw !== 'object') return fail('Requête illisible.', 400);
    const parsed = captureSchema.safeParse({
      ...(raw as Record<string, unknown>),
      token: request.headers.get('x-capture-token') ?? (raw as { token?: string }).token ?? '',
    });
    if (!parsed.success) return fail('Données invalides.', 400);
    payload = parsed.data;
  }

  // The bucket is keyed on the token, not the IP: an extension used from a
  // shared network must not be throttled by someone else's captures, and a
  // leaked token must not be rescued by changing address.
  const limit = rateLimit('capture', payload.token.slice(0, 16));
  if (!limit.allowed) return tooManyRequests(limit);

  const resolved = resolveCaptureToken(payload.token);
  // Same answer for a wrong, revoked and expired token: no probing.
  if (!resolved) return fail('Jeton invalide ou expiré.', 401);

  const moodboard = findMoodboard(resolved.moodboardId);
  if (!moodboard) return fail('Moodboard introuvable.', 404);

  let fileId: number | null = null;
  let storedName: string | null = null;

  try {
    if (file) {
      // Images only: a capture token must not become a way to upload documents.
      const stored = await saveUpload(file, { allowedKinds: ['image'] });
      storedName = stored.storedName;
      fileId = createFile({
        clientId: moodboard.client_id,
        projectId: moodboard.project_id,
        entityType: 'moodboard',
        entityId: moodboard.id,
        originalName: stored.originalName,
        storedName: stored.storedName,
        mimeType: stored.mimeType,
        extension: stored.extension,
        sizeBytes: stored.sizeBytes,
        checksum: stored.checksum,
      });
    } else if (payload.kind === 'image' && !payload.url) {
      return fail('Envoyez une image ou son adresse.', 400);
    }

    const itemId = addMoodboardItem({
      moodboardId: moodboard.id,
      kind: payload.kind,
      fileId,
      url: payload.url ?? null,
      sourceUrl: payload.source_url ?? null,
      content: payload.content ?? null,
      color: payload.color ?? null,
      notes: payload.notes ?? null,
    });

    /**
     * Logged without a user: the journal should show that something was added
     * from outside, by which token, and from which page — that trail is the
     * point of issuing revocable tokens rather than a shared secret.
     */
    logActivity({
      userId: null,
      actorLabel: 'capture',
      ip: clientIp(request),
      action: 'create',
      entityType: 'moodboard_item',
      entityId: itemId,
      entityLabel: moodboard.title,
      summary: `Capture externe ajoutée au moodboard « ${moodboard.title} »`,
      metadata: { tokenId: resolved.id, sourceUrl: payload.source_url ?? null },
    });

    return Response.json(
      { ok: true, id: itemId, moodboard: moodboard.title, count: listMoodboardItems(moodboard.id).length },
      { status: 201, headers: CORS },
    );
  } catch (error) {
    if (storedName) await deleteStoredFile(storedName).catch(() => undefined);
    if (error instanceof UploadError) return fail(error.message, 400);
    console.error('Capture failed', error);
    return fail('Capture impossible.', 500);
  }
}
