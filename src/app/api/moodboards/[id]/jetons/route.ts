import { z } from 'zod';
import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import {
  createCaptureToken,
  findMoodboard,
  listCaptureTokens,
  revokeCaptureToken,
} from '@/lib/db/repositories/moodboards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const tokenSchema = z.object({
  csrf: z.string().optional(),
  label: z.string().trim().max(120).nullable().optional(),
  expires_in_days: z.coerce.number().int().min(1).max(365).nullable().optional(),
});

export async function GET(request: Request, context: Params): Promise<Response> {
  const boardId = parseId((await context.params).id);
  if (boardId === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'moodboards.view' }, async () => {
    if (!findMoodboard(boardId)) return notFound('Moodboard introuvable.');
    // Only the metadata: the token itself was shown once, at creation.
    return Response.json({ ok: true, items: listCaptureTokens(boardId) });
  })(request);
}

/**
 * Issues a capture token for this board.
 *
 * This is what lets an image be pushed onto a board from outside the app — a
 * browser extension, a phone share sheet — with no session involved. The scope is
 * deliberately tiny: a token can append one item to exactly one board, nothing
 * else, and only its hash is stored, so a leaked database gives no working token.
 *
 * The raw value is returned once, here, and never again.
 */
export async function POST(request: Request, context: Params): Promise<Response> {
  const boardId = parseId((await context.params).id);
  if (boardId === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'moodboards.update', schema: tokenSchema },
    async ({ body, user, log }) => {
      const moodboard = findMoodboard(boardId);
      if (!moodboard) return notFound('Moodboard introuvable.');

      const active = listCaptureTokens(boardId).filter((token) => token.revoked_at === null);
      if (active.length >= 10) {
        return badRequest('10 jetons actifs au maximum. Révoquez-en un avant d’en créer un autre.');
      }

      const { token, id } = createCaptureToken({
        moodboardId: boardId,
        label: body.label ?? null,
        expiresInDays: body.expires_in_days ?? null,
        createdBy: user.id,
      });

      log({
        action: 'create',
        entityType: 'capture_token',
        entityId: id,
        entityLabel: body.label ?? moodboard.title,
        summary: `Jeton de capture créé pour le moodboard « ${moodboard.title} »`,
        // The token itself is never written to the journal.
        metadata: { expiresInDays: body.expires_in_days ?? null },
      });

      return ok({ id, token }, 201);
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const boardId = parseId((await context.params).id);
  if (boardId === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'moodboards.update' }, async ({ request: req, log }) => {
    const moodboard = findMoodboard(boardId);
    if (!moodboard) return notFound('Moodboard introuvable.');

    const tokenId = parseId(new URL(req.url).searchParams.get('jeton') ?? undefined);
    if (tokenId === null) return badRequest('Jeton non précisé.');

    const token = listCaptureTokens(boardId).find((row) => row.id === tokenId);
    if (!token) return notFound('Jeton introuvable.');

    revokeCaptureToken(tokenId);
    log({
      action: 'update',
      entityType: 'capture_token',
      entityId: tokenId,
      entityLabel: token.label ?? moodboard.title,
      summary: `Jeton de capture révoqué (moodboard « ${moodboard.title} »)`,
    });

    return ok({ revoked: true, items: listCaptureTokens(boardId) });
  })(request);
}
