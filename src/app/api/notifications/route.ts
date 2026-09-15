import { createHandler, list, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import {
  countUnreadNotifications,
  deleteNotification,
  listNotifications,
  pruneNotifications,
} from '@/lib/db/repositories/comms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createHandler({ permission: 'notifications.view' }, async ({ request, user }) => {
  const url = new URL(request.url);
  return list(
    // Scoped to the caller: a notification addressed to someone else is not
    // theirs to read, and `user_id IS NULL` entries are the shared ones.
    listNotifications({
      userId: user.id,
      unreadOnly: url.searchParams.get('nonlues') === '1',
      limit: Math.min(200, Number(url.searchParams.get('limite')) || 50),
    }),
    { total: countUnreadNotifications(user.id) },
  );
});

/**
 * Dismisses notifications.
 *
 * `?id=` removes one; `?anciennes=1` prunes everything read and older than three
 * months, which is the housekeeping that keeps the bell meaningful.
 */
export const DELETE = createHandler({ permission: 'notifications.update' }, async ({ request, user }) => {
  const url = new URL(request.url);

  if (url.searchParams.get('anciennes') === '1') {
    const removed = pruneNotifications(90);
    return ok({ pruned: removed });
  }

  const id = parseId(url.searchParams.get('id') ?? undefined);
  if (id === null) return badRequest('Notification non précisée.');

  // Only from the caller's own list — no deleting someone else's alerts.
  const own = listNotifications({ userId: user.id, limit: 500 }).some((row) => row.id === id);
  if (!own) return notFound('Notification introuvable.');

  deleteNotification(id);
  return ok({ deleted: true });
});
