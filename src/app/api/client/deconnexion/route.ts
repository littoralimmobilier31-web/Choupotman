import { destroyClientSession } from '@/lib/auth/session';
import { getClientSessionContext } from '@/lib/auth/session';
import { isSameOrigin } from '@/lib/auth/csrf';
import { logActivity } from '@/lib/db/repositories/activity';
import { clientIp } from '@/lib/auth/rate-limit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Revokes the portal session server-side, not just the cookie. */
export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Requête refusée.' }, { status: 403 });
  }

  const ctx = await getClientSessionContext();
  await destroyClientSession();

  if (ctx) {
    logActivity({
      actorLabel: ctx.clientUser.email,
      action: 'logout',
      entityType: 'client_user',
      entityId: ctx.clientUser.id,
      summary: 'Déconnexion de l’espace client',
      ip: clientIp(request),
    });
  }

  return Response.json({ ok: true });
}
