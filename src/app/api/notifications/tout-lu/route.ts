import { apiRequire } from '@/lib/auth/guard';
import { isSameOrigin } from '@/lib/auth/csrf';
import { markAllNotificationsRead, markNotificationRead } from '@/lib/db/repositories/comms';

/**
 * Marks notifications read.
 *
 * POST with no body marks all of the caller's notifications read; with `{ id }`
 * it marks one. Scoped to the caller, so a user cannot clear someone else's bell.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return Response.json({ error: 'Requête refusée.' }, { status: 403 });

  const auth = await apiRequire('notifications.update');
  if (!auth.ok) return auth.response;

  const body = (await request.json().catch(() => ({}))) as { id?: number };

  if (typeof body.id === 'number' && Number.isFinite(body.id)) {
    markNotificationRead(body.id);
    return Response.json({ ok: true, updated: 1 });
  }

  const updated = markAllNotificationsRead(auth.user.id);
  return Response.json({ ok: true, updated });
}
