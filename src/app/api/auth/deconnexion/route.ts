import { destroySession, getSessionContext } from '@/lib/auth/session';
import { isSameOrigin } from '@/lib/auth/csrf';
import { logActivity } from '@/lib/db/repositories/activity';
import { clientIp } from '@/lib/auth/rate-limit';

/**
 * Logout.
 *
 * POST-only: a GET logout can be triggered by any image tag on any page. The
 * session row is revoked server-side as well as the cookie cleared, so a copied
 * cookie is dead immediately.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Requête refusée.' }, { status: 403 });
  }

  const context = await getSessionContext();

  await destroySession();

  if (context) {
    logActivity({
      userId: context.user.id,
      action: 'logout',
      actorLabel: context.user.username,
      summary: 'Déconnexion',
      ip: clientIp(request),
    });
  }

  return Response.json({ ok: true, redirect: '/espace-admin/connexion?deconnecte=1' });
}
