import { changePasswordSchema, fieldErrors } from '@/lib/validation/public';
import { checkPasswordStrength, hashPassword, verifyPassword } from '@/lib/auth/password';
import { getSessionContext, revokeAllSessions } from '@/lib/auth/session';
import { assertCsrf, CsrfError } from '@/lib/auth/csrf';
import * as usersRepo from '@/lib/db/repositories/users';
import { logActivity } from '@/lib/db/repositories/activity';
import { clientIp } from '@/lib/auth/rate-limit';
import { ADMIN_HOME_PATH } from '@/lib/auth/guard';

/**
 * Password change.
 *
 * Retires the bootstrap password on first login, and serves ordinary changes
 * afterwards. Three rules:
 *   • the current password must be supplied, so a hijacked session cannot lock
 *     the real owner out;
 *   • the new password goes through the strength policy, with the username and
 *     email as forbidden substrings;
 *   • every *other* session is revoked, so a change also ends any session an
 *     attacker may hold.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<Response> {
  const context = await getSessionContext();
  if (!context) return Response.json({ error: 'Authentification requise.' }, { status: 401 });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  try {
    await assertCsrf(request, typeof body.csrf === 'string' ? body.csrf : null);
  } catch (error) {
    if (error instanceof CsrfError) return Response.json({ error: error.message }, { status: 403 });
    throw error;
  }

  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Merci de corriger les champs indiqués.', fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const { currentPassword, newPassword } = parsed.data;

  const user = usersRepo.findUserById(context.user.id);
  if (!user) return Response.json({ error: 'Compte introuvable.' }, { status: 404 });

  const currentValid = await verifyPassword(currentPassword, user.password_hash);
  if (!currentValid) {
    logActivity({
      userId: user.id,
      action: 'password_changed',
      actorLabel: user.username,
      summary: 'Échec du changement de mot de passe (mot de passe actuel incorrect)',
      ip: clientIp(request),
    });
    return Response.json(
      { error: 'Mot de passe actuel incorrect.', fields: { currentPassword: 'Mot de passe actuel incorrect.' } },
      { status: 400 },
    );
  }

  const strength = checkPasswordStrength(newPassword, [user.username, user.email]);
  if (!strength.ok) {
    return Response.json(
      { error: strength.errors[0] ?? 'Mot de passe trop faible.', fields: { newPassword: strength.errors.join(' ') } },
      { status: 400 },
    );
  }

  usersRepo.setUserPassword(user.id, await hashPassword(newPassword));

  // Keep the current session, end every other one.
  const revoked = revokeAllSessions(user.id, context.session.id);

  logActivity({
    userId: user.id,
    action: 'password_changed',
    actorLabel: user.username,
    summary: 'Mot de passe modifié',
    metadata: { revokedSessions: revoked, wasForced: user.must_change_password === 1 },
    ip: clientIp(request),
  });

  return Response.json({ ok: true, redirect: ADMIN_HOME_PATH, revokedSessions: revoked });
}
