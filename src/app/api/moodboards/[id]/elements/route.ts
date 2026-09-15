import { z } from 'zod';
import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { moodboardItemSchema, moodboardLayoutSchema } from '@/lib/validation/admin';
import {
  addMoodboardItem,
  deleteMoodboardItem,
  findMoodboard,
  listMoodboardItems,
  saveMoodboardLayout,
  updateMoodboardItem,
} from '@/lib/db/repositories/moodboards';
import { findFile } from '@/lib/db/repositories/files';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/** The item schema without `moodboard_id`: the board comes from the route. */
const itemBody = moodboardItemSchema.omit({ moodboard_id: true });

export async function POST(request: Request, context: Params): Promise<Response> {
  const boardId = parseId((await context.params).id);
  if (boardId === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'moodboards.update', schema: itemBody },
    async ({ body, log }) => {
      const moodboard = findMoodboard(boardId);
      if (!moodboard) return notFound('Moodboard introuvable.');

      // Each kind needs its own content to be worth placing on the canvas.
      if (body.kind === 'image' && !body.file_id && !body.url) {
        return badRequest('Indiquez un fichier de la bibliothèque ou une adresse d’image.');
      }
      if ((body.kind === 'text' || body.kind === 'note') && !body.content) {
        return badRequest('Le texte est vide.');
      }
      if (body.kind === 'color' && !body.color) return badRequest('Indiquez une couleur.');
      if (body.kind === 'link' && !body.url) return badRequest('Indiquez une adresse.');
      if (body.file_id && !findFile(body.file_id)) return badRequest('Fichier introuvable.');

      const id = addMoodboardItem({
        moodboardId: boardId,
        kind: body.kind,
        fileId: body.file_id ?? null,
        url: body.url ?? null,
        sourceUrl: body.source_url ?? null,
        content: body.content ?? null,
        color: body.color ?? null,
        x: body.x,
        y: body.y,
        width: body.width,
        height: body.height,
        notes: body.notes ?? null,
      });

      log({
        action: 'create',
        entityType: 'moodboard_item',
        entityId: id,
        entityLabel: moodboard.title,
        summary: `Élément ${body.kind} ajouté au moodboard « ${moodboard.title} »`,
      });

      return ok({ id, items: listMoodboardItems(boardId) }, 201);
    },
  )(request);
}

/**
 * Saves the canvas after a drag session.
 *
 * One request for the whole board rather than one per element: dragging produces
 * dozens of intermediate positions, and only the final arrangement matters. The
 * repository writes them in a single transaction, and each UPDATE is scoped to
 * this board so an id from another board is silently ignored rather than moved.
 */
export async function PUT(request: Request, context: Params): Promise<Response> {
  const boardId = parseId((await context.params).id);
  if (boardId === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'moodboards.update', schema: moodboardLayoutSchema.omit({ moodboard_id: true }) },
    async ({ body }) => {
      if (!findMoodboard(boardId)) return notFound('Moodboard introuvable.');
      saveMoodboardLayout(boardId, body.items);
      // Not logged: a drag is not an event worth an audit entry every few seconds.
      return ok({ saved: body.items.length });
    },
  )(request);
}

const itemPatchSchema = z.object({
  csrf: z.string().optional(),
  item_id: z.coerce.number().int().positive(),
  content: z.string().trim().max(2000).nullable().optional(),
  color: z.string().trim().max(40).nullable().optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  url: z.string().trim().max(1000).nullable().optional(),
  width: z.coerce.number().min(20).max(4000).optional(),
  height: z.coerce.number().min(20).max(4000).optional(),
  z_index: z.coerce.number().int().optional(),
});

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const boardId = parseId((await context.params).id);
  if (boardId === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'moodboards.update', schema: itemPatchSchema },
    async ({ body }) => {
      if (!findMoodboard(boardId)) return notFound('Moodboard introuvable.');

      // Scoped lookup: an item id belonging to another board must not be editable
      // through this board's route.
      const item = listMoodboardItems(boardId).find((row) => row.id === body.item_id);
      if (!item) return notFound('Élément introuvable.');

      updateMoodboardItem(body.item_id, {
        content: body.content,
        color: body.color,
        notes: body.notes,
        url: body.url,
        width: body.width,
        height: body.height,
        z_index: body.z_index,
      });

      return ok({ items: listMoodboardItems(boardId) });
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const boardId = parseId((await context.params).id);
  if (boardId === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'moodboards.update' }, async ({ request: req, log }) => {
    const moodboard = findMoodboard(boardId);
    if (!moodboard) return notFound('Moodboard introuvable.');

    const itemId = parseId(new URL(req.url).searchParams.get('element') ?? undefined);
    if (itemId === null) return badRequest('Élément non précisé.');

    const item = listMoodboardItems(boardId).find((row) => row.id === itemId);
    if (!item) return notFound('Élément introuvable.');

    deleteMoodboardItem(itemId);
    log({
      action: 'delete',
      entityType: 'moodboard_item',
      entityId: itemId,
      entityLabel: moodboard.title,
      summary: `Élément retiré du moodboard « ${moodboard.title} »`,
    });

    return ok({ deleted: true, items: listMoodboardItems(boardId) });
  })(request);
}
