import { loginSchema, fieldErrors } from '@/lib/validation/public';
import { verifyPassword, needsRehash, hashPassword } from '@/lib/auth/password';
import { createSession, destroySession } from '@/lib/auth/session';
import { verifyPreSessionToken, isSameOrigin } from '@/lib/auth/csrf';
import { clientIp, rateLimit, resetRateLimit, recordLoginAttempt, tooManyRequests } from '@/lib/auth/rate-limit';
import * as usersRepo from '@/lib/db/repositories/users';
import { logActivity } from '@/lib/db/repositories/activity';
import { config } from '@/lib/config';
import { ADMIN_HOME_PATH, CHANGE_PASSWORD_PATH } from '@/lib/auth/guard';

/**
 * Login.
 *
 * Order matters and is deliberate:
 *   1. same-origin + pre-session CSRF token — a cross-site page cannot even try;
 *   2. rate limit on the IP *and* on the submitted identifier, so neither a
 *      single host nor a distributed attempt against one account gets many tries;
 *   3. account lockout, checked before the password so a locked account cannot be
 *      probed at all;
 *   4. password verification, which always runs to completion.
 *
 * Failures return one generic message: revealing "unknown user" versus "wrong
 * password" would turn this endpoint into a username oracle.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const GENERIC_ERROR = 'Identifiants incorrects.';

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Requête refusée.' }, { status: 403 });
  }

  const ip = clientIp(request);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: 'Champs manquants.', fields: fieldErrors(parsed.error) }, { status: 400 });
  }

  const { login, password, csrf } = parsed.data;

  if (!(await verifyPreSessionToken(csrf))) {
    return Response.json(
      { error: 'Session expirée. Rechargez la page et réessayez.' },
      { status: 403 },
    );
  }

  // Two buckets: one per IP, one per identifier.
  const ipLimit = rateLimit('login', `ip:${ip}`);
  if (!ipLimit.allowed) {
    recordLoginAttempt(login, ip, false);
    return tooManyRequests(ipLimit, 'Trop de tentatives depuis cette adresse. Réessayez plus tard.');
  }
  const userLimit = rateLimit('login', `user:${login.toLowerCase()}`);
  if (!userLimit.allowed) {
    recordLoginAttempt(login, ip, false);
    return tooManyRequests(userLimit, 'Trop de tentatives sur ce compte. Réessayez plus tard.');
  }

  const user = usersRepo.findUserByLogin(login);

  if (!user || !user.is_active) {
    recordLoginAttempt(login, ip, false);
    logActivity({
      action: 'login_failed',
      actorLabel: login,
      summary: user ? 'Compte désactivé' : 'Identifiant inconnu',
      ip,
    });
    return Response.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  if (usersRepo.isUserLocked(user)) {
    recordLoginAttempt(login, ip, false);
    logActivity({
      userId: user.id,
      action: 'login_failed',
      actorLabel: user.username,
      summary: 'Tentative sur un compte verrouillé',
      ip,
    });
    return Response.json(
      { error: 'Compte temporairement verrouillé après plusieurs échecs. Réessayez dans quelques minutes.' },
      { status: 423 },
    );
  }

  const valid = await verifyPassword(password, user.password_hash);

  if (!valid) {
    usersRepo.markLoginFailure(user.id, config.rateLimit.loginAttempts, config.rateLimit.windowMinutes);
    recordLoginAttempt(login, ip, false);
    logActivity({
      userId: user.id,
      action: 'login_failed',
      actorLabel: user.username,
      summary: 'Mot de passe incorrect',
      ip,
    });
    return Response.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  // Opportunistic upgrade if the stored hash used weaker parameters.
  if (needsRehash(user.password_hash)) {
    usersRepo.setUserPassword(user.id, await hashPassword(password));
  }

  // A stale session for another account must not survive a new login.
  await destroySession();
  await createSession(user.id);

  usersRepo.markLoginSuccess(user.id);
  recordLoginAttempt(login, ip, true);
  resetRateLimit('login', `user:${login.toLowerCase()}`);

  logActivity({
    userId: user.id,
    action: 'login',
    actorLabel: user.username,
    summary: 'Connexion réussie',
    ip,
  });

  return Response.json({
    ok: true,
    redirect: user.must_change_password ? CHANGE_PASSWORD_PATH : ADMIN_HOME_PATH,
    mustChangePassword: user.must_change_password === 1,
  });
}
