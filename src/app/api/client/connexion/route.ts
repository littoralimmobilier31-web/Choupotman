import { z } from 'zod';
import { isSameOrigin } from '@/lib/auth/csrf';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/auth/rate-limit';
import { verifyPassword, needsRehash, hashPassword } from '@/lib/auth/password';
import { createClientSession } from '@/lib/auth/session';
import {
  findClientUserByEmail, markClientUserLogin, setClientUserPassword,
} from '@/lib/db/repositories/clients';
import { logActivity } from '@/lib/db/repositories/activity';
import { fieldErrors } from '@/lib/validation/public';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Client-portal login.
 *
 * Same defences as the admin login, for the same reasons: one generic error so
 * the endpoint is not an account oracle, rate limiting per IP and per address so
 * a list of emails cannot be sprayed, and an Origin check.
 *
 * A portal session lives in its own table and cookie, so a client can never end
 * up holding anything an admin guard would accept.
 */

const GENERIC_ERROR = 'Identifiants incorrects.';

const schema = z.object({
  email: z.string().trim().email().max(180),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request): Promise<Response> {
  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Requête refusée.' }, { status: 403 });
  }

  const ip = clientIp(request);
  const ipLimit = rateLimit('login', `client-ip:${ip}`);
  if (!ipLimit.allowed) return tooManyRequests(ipLimit);

  const parsed = schema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: GENERIC_ERROR, fields: fieldErrors(parsed.error) }, { status: 400 });
  }

  const { email, password } = parsed.data;

  // A second bucket keyed on the address, so one IP cannot try many accounts and
  // many IPs cannot hammer one account.
  const idLimit = rateLimit('login', `client-id:${email.toLowerCase()}`);
  if (!idLimit.allowed) return tooManyRequests(idLimit);

  const clientUser = findClientUserByEmail(email);

  // Always verify against something, so a missing account and a wrong password
  // take the same time.
  const valid = await verifyPassword(password, clientUser?.password_hash ?? null);

  if (!clientUser || !valid || clientUser.is_active !== 1) {
    logActivity({
      actorLabel: email,
      action: 'login_failed',
      entityType: 'client_user',
      summary: 'Échec de connexion à l’espace client',
      ip,
    });
    return Response.json({ error: GENERIC_ERROR }, { status: 401 });
  }

  // Opportunistic upgrade if the stored hash predates the current parameters.
  if (needsRehash(clientUser.password_hash)) {
    setClientUserPassword(clientUser.id, await hashPassword(password));
  }

  await createClientSession(clientUser.id);
  markClientUserLogin(clientUser.id);

  logActivity({
    actorLabel: clientUser.email,
    action: 'login',
    entityType: 'client_user',
    entityId: clientUser.id,
    summary: 'Connexion à l’espace client',
    ip,
  });

  return Response.json({
    ok: true,
    mustChangePassword: clientUser.must_change_password === 1,
  });
}
