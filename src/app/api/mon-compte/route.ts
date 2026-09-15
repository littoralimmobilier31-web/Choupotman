import { z } from 'zod';
import { createHandler, ok, badRequest } from '@/lib/api/handler';
import { findUserByEmail, findUserById, updateUser } from '@/lib/db/repositories/users';
import { listUserSessions, revokeAllSessions } from '@/lib/auth/session';
import { getSessionContext } from '@/lib/auth/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The signed-in person's own account.
 *
 * Deliberately narrow: name, email, phone, language and theme — the things that
 * are theirs to change. Role and activation are not here, because a person
 * granting themselves a permission is precisely what the role system exists to
 * prevent. Those live under `users.update`, which is a different permission held
 * by a different kind of account.
 *
 * Guarded by `dashboard.view` rather than a users permission: every account that
 * can sign in has it, and every account should be able to edit its own profile.
 */
const profileSchema = z.object({
  csrf: z.string().optional(),
  full_name: z.string().trim().max(160).nullable().optional(),
  email: z.string().trim().email('Adresse email invalide.').max(180).optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  locale: z.enum(['fr', 'ar', 'en']).optional(),
  theme: z.enum(['light', 'dark', 'system']).optional(),
});

export const GET = createHandler({ permission: 'dashboard.view' }, async ({ user }) => {
  const context = await getSessionContext();
  const row = findUserById(user.id);
  if (!row) return badRequest('Compte introuvable.');

  return Response.json({
    ok: true,
    account: {
      id: row.id,
      username: row.username,
      email: row.email,
      full_name: row.full_name,
      phone: row.phone,
      locale: row.locale,
      theme: row.theme,
      role_id: row.role_id,
      last_login_at: row.last_login_at,
      must_change_password: row.must_change_password,
      created_at: row.created_at,
    },
    // Only metadata: the session token itself is never stored in readable form.
    sessions: listUserSessions(user.id).map((session) => ({
      id: session.id,
      created_at: session.created_at,
      last_seen_at: session.last_seen_at,
      expires_at: session.expires_at,
      ip_address: session.ip_address,
      user_agent: session.user_agent,
      current: context?.session.id === session.id,
    })),
  });
});

export const PATCH = createHandler(
  { permission: 'dashboard.view', schema: profileSchema },
  async ({ body, user, log }) => {
    const current = findUserById(user.id);
    if (!current) return badRequest('Compte introuvable.');

    if (body.email) {
      const existing = findUserByEmail(body.email);
      if (existing && existing.id !== user.id) return badRequest('Cette adresse email est déjà utilisée.');
    }

    updateUser(user.id, {
      full_name: body.full_name,
      email: body.email?.toLowerCase(),
      phone: body.phone,
      locale: body.locale,
      theme: body.theme,
    });

    log({
      action: 'update',
      entityType: 'user',
      entityId: user.id,
      entityLabel: current.username,
      summary: `Profil personnel modifié : ${current.username}`,
    });

    return ok({ id: user.id });
  },
);

/**
 * Signs every other device out.
 *
 * The current session survives, so the person is not locked out of the screen
 * they are using — which is what makes this safe to click when a laptop has gone
 * missing.
 */
export const DELETE = createHandler({ permission: 'dashboard.view' }, async ({ user, log }) => {
  const context = await getSessionContext();
  const revoked = revokeAllSessions(user.id, context?.session.id);

  log({
    action: 'logout',
    entityType: 'user',
    entityId: user.id,
    entityLabel: user.username,
    summary: `${revoked} autre${revoked === 1 ? '' : 's'} session${revoked === 1 ? '' : 's'} fermée${revoked === 1 ? '' : 's'}`,
  });

  return ok({ revoked });
});
