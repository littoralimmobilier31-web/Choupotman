import { createHandler, list, ok } from '@/lib/api/handler';
import { eventSchema } from '@/lib/validation/admin';
import { createEvent, getCalendarEntries } from '@/lib/db/repositories/calendar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The unified calendar.
 *
 * `getCalendarEntries` projects six sources into one sorted list — stored events,
 * project deliveries, task due dates, invoice due dates, revision requests and
 * subscription renewals — so nothing has to be copied into a calendar table to
 * appear on it. A delivery date changed on the project is already on the
 * calendar; there is no synchronisation step that can drift.
 */
export const GET = createHandler({ permission: 'calendar.view' }, async ({ request }) => {
  const url = new URL(request.url);
  const today = new Date().toISOString().slice(0, 10);

  return list(
    getCalendarEntries({
      from: url.searchParams.get('du') ?? today,
      to: url.searchParams.get('au') ?? new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10),
    }),
  );
});

export const POST = createHandler(
  { permission: 'calendar.create', schema: eventSchema },
  async ({ body, user, log }) => {
    const id = createEvent({
      title: body.title,
      description: body.description ?? null,
      kind: body.kind,
      startsAt: body.starts_at,
      endsAt: body.ends_at ?? null,
      allDay: body.all_day,
      location: body.location ?? null,
      url: body.url ?? null,
      clientId: body.client_id ?? null,
      projectId: body.project_id ?? null,
      color: body.color ?? null,
      createdBy: user.id,
    });

    log({
      action: 'create',
      entityType: 'calendar_event',
      entityId: id,
      entityLabel: body.title,
      summary: `Événement ajouté : ${body.title} (${body.starts_at.slice(0, 10)})`,
    });

    return ok({ id }, 201);
  },
);
