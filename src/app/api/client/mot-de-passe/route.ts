import { z } from 'zod';
import { apiClientUser } from '@/lib/auth/guard';
import { assertClientCsrf, CsrfError } from '@/lib/auth/csrf';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/auth/rate-limit';
import { checkPasswordStrength, hashPassword, verifyPassword } from '@/lib/auth/password';
import { findClientUser, setClientUserPassword } from '@/lib/db/repositories/clients';
import { logActivity } from '@/lib/db/repositories/activity';
import { fieldErrors } from '@/lib/validation/public';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const schema = z
  .object({
    csrf: z.string().optional(),
    currentPassword: z.string().min(1, 'Mot de passe actuel requis.').max(200),
    newPassword: z.string().min(10, 'Au moins 10 caractères.').max(200),
    confirmPassword: z.string().min(1),
  })
  .refine((value) => value.newPassword === value.confirmPassword, {
    message: 'Les deux mots de passe ne correspondent pas.',
    path: ['confirmPassword'],
  });

/**
 * Password change for a portal user.
 *
 * The same strength policy as the admin applies, and the account's own email is
 * fed to it as context so a password built from the address is rejected. The
 * current password is verified first, so a stolen session cannot silently lock
 * the real owner out.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await apiClientUser();
  if (!auth.ok) return auth.response;

  try {
    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    await assertClientCsrf(request, typeof raw.csrf === 'string' ? raw.csrf : null);

    const limit = rateLimit('passwordReset', `client-change:${auth.clientUser.id}`);
    if (!limit.allowed) return tooManyRequests(limit);

    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return Response.json({ error: 'Données invalides.', fields: fieldErrors(parsed.error) }, { status: 400 });
    }

    // Re-read: the session may predate a reset the owner performed.
    const clientUser = findClientUser(auth.clientUser.id);
    if (!clientUser) return Response.json({ error: 'Compte introuvable.' }, { status: 404 });

    const valid = await verifyPassword(parsed.data.currentPassword, clientUser.password_hash);
    if (!valid) {
      return Response.json(
        { error: 'Mot de passe actuel incorrect.', fields: { currentPassword: 'Mot de passe incorrect.' } },
        { status: 400 },
      );
    }

    const strength = checkPasswordStrength(parsed.data.newPassword, [
      clientUser.email,
      clientUser.full_name ?? '',
    ]);
    if (!strength.ok) {
      const message = strength.errors.join(' ');
      return Response.json(
        { error: message, fields: { newPassword: message } },
        { status: 400 },
      );
    }

    setClientUserPassword(clientUser.id, await hashPassword(parsed.data.newPassword));

    logActivity({
      actorLabel: clientUser.email,
      action: 'password_changed',
      entityType: 'client_user',
      entityId: clientUser.id,
      summary: 'Mot de passe de l’espace client modifié',
      ip: clientIp(request),
    });

    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof CsrfError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error('Client password change failed', error);
    return Response.json({ error: 'Une erreur est survenue.' }, { status: 500 });
  }
}
