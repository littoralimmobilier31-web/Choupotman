import { z } from 'zod';
import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { moodboardSchema, patchOf } from '@/lib/validation/admin';
import {
  deleteMoodboard,
  findMoodboard,
  listMoodboardItems,
  setMoodboardShare,
  updateMoodboard,
} from '@/lib/db/repositories/moodboards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = patchOf(moodboardSchema).extend({
  /** Turning the public read-only link on or off; rotates the token when on. */
  share: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'moodboards.view' }, async () => {
    const moodboard = findMoodboard(id);
    if (!moodboard) return notFound('Moodboard introuvable.');
    return Response.json({ ok: true, moodboard, items: listMoodboardItems(id) });
  })(request);
}

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'moodboards.update', schema: patchSchema },
    async ({ body, log }) => {
      const before = findMoodboard(id);
      if (!before) return notFound('Moodboard introuvable.');

      updateMoodboard(id, {
        title: body.title,
        description: body.description,
        background: body.background,
        projectId: body.project_id,
        clientId: body.client_id,
      });

      let shareToken: string | null | undefined;
      if (body.share !== undefined) {
        shareToken = setMoodboardShare(id, body.share);
        log({
          action: 'update',
          entityType: 'moodboard',
          entityId: id,
          entityLabel: before.title,
          summary: body.share
            ? `Lien public activé pour le moodboard : ${before.title}`
            : `Lien public désactivé pour le moodboard : ${before.title}`,
        });
      } else {
        log({
          action: 'update',
          entityType: 'moodboard',
          entityId: id,
          entityLabel: body.title ?? before.title,
          summary: `Moodboard modifié : ${body.title ?? before.title}`,
        });
      }

      return ok({ id, moodboard: findMoodboard(id), shareToken });
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'moodboards.delete' }, async ({ log }) => {
    const moodboard = findMoodboard(id);
    if (!moodboard) return notFound('Moodboard introuvable.');

    // Items and capture tokens cascade with the board (see the schema); the
    // uploaded files they point at belong to the library and stay there.
    deleteMoodboard(id);
    log({
      action: 'delete',
      entityType: 'moodboard',
      entityId: id,
      entityLabel: moodboard.title,
      summary: `Moodboard supprimé : ${moodboard.title} (${moodboard.item_count} éléments)`,
    });

    return ok({ deleted: true });
  })(request);
}
