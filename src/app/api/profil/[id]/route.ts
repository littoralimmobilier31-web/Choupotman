import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { profileEntrySchema, patchOf } from '@/lib/validation/admin';
import { deleteProfileEntry, findProfileEntry, updateProfileEntry } from '@/lib/db/repositories/content';
import { revalidatePublic } from '@/lib/revalidate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'profile.update', schema: patchOf(profileEntrySchema) },
    async ({ body, log }) => {
      const before = findProfileEntry(id);
      if (!before) return notFound('Élément introuvable.');

      updateProfileEntry(id, {
        kind: body.kind,
        title: body.title,
        organisation: body.organisation,
        location: body.location,
        start_date: body.start_date,
        // "Still ongoing" and an end date are mutually exclusive.
        end_date: body.is_current === true ? null : body.end_date,
        is_current: body.is_current,
        description: body.description,
        level: body.level,
        icon: body.icon,
        url: body.url,
        position: body.position,
        is_published: body.is_published,
      });

      log({
        action: 'update',
        entityType: 'profile_entry',
        entityId: id,
        entityLabel: body.title ?? before.title,
        summary: `Élément de parcours modifié : ${body.title ?? before.title}`,
      });

      revalidatePublic('about');
      return ok({ id, entry: findProfileEntry(id) });
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'profile.delete' }, async ({ log }) => {
    const entry = findProfileEntry(id);
    if (!entry) return notFound('Élément introuvable.');

    deleteProfileEntry(id);
    log({
      action: 'delete',
      entityType: 'profile_entry',
      entityId: id,
      entityLabel: entry.title,
      summary: `Élément de parcours supprimé : ${entry.title}`,
    });

    revalidatePublic('about');
    return ok({ deleted: true });
  })(request);
}
