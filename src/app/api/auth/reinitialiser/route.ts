import { passwordResetRequestSchema, passwordResetSchema, fieldErrors } from '@/lib/validation/public';
import { checkPasswordStrength, generateToken, hashPassword, hashToken } from '@/lib/auth/password';
import { isSameOrigin } from '@/lib/auth/csrf';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/auth/rate-limit';
import { revokeAllSessions } from '@/lib/auth/session';
import * as usersRepo from '@/lib/db/repositories/users';
import { logActivity } from '@/lib/db/repositories/activity';
import { one, run } from '@/lib/db/client';
import { sendEmail } from '@/lib/mail/send';
import { config } from '@/lib/config';

/**
 * Password reset.
 *
 * POST   → request a link.  PUT → consume a token and set a new password.
 *
 * Two properties matter:
 *   • the response to a request is always the same whether or not the address
 *     exists, so the endpoint is not an account-enumeration oracle;
 *   • only the SHA-256 of the token is stored, it is single-use, expires in one
 *     hour, and consuming it revokes every existing session for that user.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TTL_MINUTES = 60;
const NEUTRAL_RESPONSE = {
  ok: true,
  message:
    'Si un compte correspond à cette adresse, un lien de réinitialisation vient d’être préparé. Vérifiez votre boîte mail.',
};

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return Response.json({ error: 'Requête refusée.' }, { status: 403 });

  const ip = clientIp(request);
  const limit = rateLimit('passwordReset', ip);
  if (!limit.allowed) return tooManyRequests(limit);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const parsed = passwordResetRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Adresse email invalide.', fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const user = usersRepo.findUserByEmail(parsed.data.email);

  // Unknown or inactive account: answer exactly as for a known one.
  if (!user || !user.is_active) {
    logActivity({
      action: 'password_reset',
      actorLabel: parsed.data.email,
      summary: 'Demande de réinitialisation pour une adresse inconnue',
      ip,
    });
    return Response.json(NEUTRAL_RESPONSE);
  }

  // Any previously issued, unused token becomes invalid.
  run('DELETE FROM password_resets WHERE user_id = ? AND used_at IS NULL', [user.id]);

  const token = generateToken(32);
  const expiresAt = new Date(Date.now() + TTL_MINUTES * 60_000).toISOString();
  run(
    'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
    [user.id, hashToken(token), expiresAt],
  );

  const link = `${config.site.url}/espace-admin/reinitialiser?token=${encodeURIComponent(token)}`;

  await sendEmail({
    to: user.email,
    toName: user.full_name ?? user.username,
    subject: 'Réinitialisation de votre mot de passe — CHOUPOTMAN OS',
    text: `Bonjour ${user.full_name ?? user.username},

Une réinitialisation de mot de passe a été demandée pour votre compte.

Ouvrez ce lien pour choisir un nouveau mot de passe (valable ${TTL_MINUTES} minutes, utilisable une seule fois) :

${link}

Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : votre mot de passe actuel reste valable.

CHOUPOTMAN OS`,
    templateKey: 'password_reset',
  });

  logActivity({
    userId: user.id,
    action: 'password_reset',
    actorLabel: user.username,
    summary: 'Lien de réinitialisation généré',
    ip,
  });

  return Response.json(NEUTRAL_RESPONSE);
}

export async function PUT(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) return Response.json({ error: 'Requête refusée.' }, { status: 403 });

  const ip = clientIp(request);
  const limit = rateLimit('passwordReset', `consume:${ip}`);
  if (!limit.allowed) return tooManyRequests(limit);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Requête invalide.' }, { status: 400 });
  }

  const parsed = passwordResetSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'Merci de corriger les champs indiqués.', fields: fieldErrors(parsed.error) },
      { status: 400 },
    );
  }

  const { token, newPassword } = parsed.data;

  const record = one<{ id: number; user_id: number }>(
    `SELECT id, user_id FROM password_resets
     WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`,
    [hashToken(token), new Date().toISOString()],
  );

  if (!record) {
    return Response.json(
      { error: 'Ce lien est invalide ou a expiré. Demandez-en un nouveau.' },
      { status: 400 },
    );
  }

  const user = usersRepo.findUserById(record.user_id);
  if (!user || !user.is_active) {
    return Response.json({ error: 'Compte indisponible.' }, { status: 400 });
  }

  const strength = checkPasswordStrength(newPassword, [user.username, user.email]);
  if (!strength.ok) {
    return Response.json(
      { error: strength.errors[0] ?? 'Mot de passe trop faible.', fields: { newPassword: strength.errors.join(' ') } },
      { status: 400 },
    );
  }

  usersRepo.setUserPassword(user.id, await hashPassword(newPassword));
  run(`UPDATE password_resets SET used_at = datetime('now') WHERE id = ?`, [record.id]);

  // A reset must end every session, including one an attacker may hold.
  const revoked = revokeAllSessions(user.id);

  logActivity({
    userId: user.id,
    action: 'password_reset',
    actorLabel: user.username,
    summary: 'Mot de passe réinitialisé via lien email',
    metadata: { revokedSessions: revoked },
    ip,
  });

  return Response.json({ ok: true, redirect: '/espace-admin/connexion' });
}
