import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { eventSchema, patchOf } from '@/lib/validation/admin';
import { deleteEvent, findEvent, updateEvent } from '@/lib/db/repositories/calendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'calendar.update', schema: patchOf(eventSchema) },
    async ({ body, log }) => {
      const before = findEvent(id);
      if (!before) return notFound('Événement introuvable.');

      updateEvent(id, {
        title: body.title,
        description: body.description,
        kind: body.kind,
        starts_at: body.starts_at,
        ends_at: body.ends_at,
        all_day: body.all_day,
        location: body.location,
        url: body.url,
        client_id: body.client_id,
        project_id: body.project_id,
        color: body.color,
      });

      log({
        action: 'update',
        entityType: 'calendar_event',
        entityId: id,
        entityLabel: body.title ?? before.title,
        summary: `Événement modifié : ${body.title ?? before.title}`,
      });

      return ok({ id, event: findEvent(id) });
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'calendar.delete' }, async ({ log }) => {
    const event = findEvent(id);
    if (!event) return notFound('Événement introuvable.');

    deleteEvent(id);
    log({
      action: 'delete',
      entityType: 'calendar_event',
      entityId: id,
      entityLabel: event.title,
      summary: `Événement supprimé : ${event.title}`,
    });

    return ok({ deleted: true });
  })(request);
}
