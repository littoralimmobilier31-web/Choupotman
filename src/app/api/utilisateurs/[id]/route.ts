import { z } from 'zod';
import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { userSchema, patchOf } from '@/lib/validation/admin';
import {
  countActiveSuperAdmins,
  deleteUser,
  findRoleById,
  findRoleBySlug,
  findUserById,
  findUserByEmail,
  findUserByLogin,
  requirePasswordChange,
  setUserPassword,
  updateUser,
} from '@/lib/db/repositories/users';
import { revokeAllSessions } from '@/lib/auth/session';
import { hashPassword, checkPasswordStrength, generateTemporaryPassword } from '@/lib/auth/password';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = patchOf(userSchema).extend({
  /** Issue a new temporary password and force a change at next sign-in. */
  reset_password: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

/**
 * Would this change leave the installation with no way in?
 *
 * Deactivating, demoting or deleting the last active Super Admin locks everybody
 * out of the settings permanently. The check lives here because every one of
 * those three operations can cause it.
 */
function wouldOrphanAdmin(userId: number, nextRoleId?: number, nextActive?: boolean): boolean {
  const user = findUserById(userId);
  if (!user) return false;

  const superAdminRole = findRoleBySlug('super_admin');
  if (!superAdminRole || user.role_id !== superAdminRole.id || user.is_active !== 1) return false;

  const staysSuperAdmin = nextRoleId === undefined || nextRoleId === superAdminRole.id;
  const staysActive = nextActive === undefined || nextActive;
  if (staysSuperAdmin && staysActive) return false;

  return countActiveSuperAdmins(userId) === 0;
}

export async function GET(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'users.view' }, async () => {
    const user = findUserById(id);
    if (!user) return notFound('Compte introuvable.');

    return Response.json({
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        role_id: user.role_id,
        locale: user.locale,
        is_active: user.is_active,
        must_change_password: user.must_change_password,
        last_login_at: user.last_login_at,
        failed_login_count: user.failed_login_count,
        locked_until: user.locked_until,
        created_at: user.created_at,
      },
    });
  })(request);
}

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'users.update', schema: patchSchema },
    async ({ body, user: actor, log }) => {
      const target = findUserById(id);
      if (!target) return notFound('Compte introuvable.');

      if (body.username && body.username !== target.username && findUserByLogin(body.username)) {
        return badRequest('Ce nom d’utilisateur est déjà pris.');
      }
      if (body.email && body.email.toLowerCase() !== target.email && findUserByEmail(body.email)) {
        return badRequest('Cette adresse email est déjà utilisée.');
      }
      if (body.role_id && !findRoleById(body.role_id)) return badRequest('Rôle introuvable.');

      if (wouldOrphanAdmin(id, body.role_id, body.is_active)) {
        return Response.json(
          {
            error: 'Ce compte est le dernier Super Admin actif.',
            reason:
              'Le modifier ainsi supprimerait tout accès aux paramètres. Donnez d’abord le rôle Super Admin à un autre compte actif.',
          },
          { status: 409 },
        );
      }

      if (body.reset_password) {
        /**
         * A reset issues a new temporary password and ends every session that
         * account has open — the point of a reset is that the previous holder
         * loses access, which a password change alone would not achieve.
         */
        const temporary = generateTemporaryPassword();

        // The generator satisfies the policy by construction. If this ever
        // fails, the two have drifted apart — a bug to fix, not something the
        // person clicking can do anything about.
        const strength = checkPasswordStrength(temporary, [target.username, target.email]);
        if (!strength.ok) {
          console.error('Generated password rejected by the policy', strength.errors);
          return Response.json(
            { error: 'Génération du mot de passe impossible. Contactez l’administrateur système.' },
            { status: 500 },
          );
        }

        setUserPassword(id, await hashPassword(temporary));
        // `setUserPassword` clears the flag; a reset by someone else must set it
        // back, so the person picks a password only they know.
        requirePasswordChange(id);
        revokeAllSessions(id);

        log({
          action: 'password_reset',
          entityType: 'user',
          entityId: id,
          entityLabel: target.username,
          summary: `Mot de passe réinitialisé pour ${target.username} par ${actor.username}`,
        });

        return ok({ id, temporaryPassword: temporary, sessionsRevoked: true });
      }

      updateUser(id, {
        username: body.username,
        email: body.email?.toLowerCase(),
        full_name: body.full_name,
        phone: body.phone,
        role_id: body.role_id,
        locale: body.locale,
        is_active: body.is_active === undefined ? undefined : body.is_active ? 1 : 0,
      });

      // A deactivated account must not keep a live session.
      if (body.is_active === false) revokeAllSessions(id);

      log({
        action: 'update',
        entityType: 'user',
        entityId: id,
        entityLabel: body.username ?? target.username,
        summary:
          body.is_active === false
            ? `Compte désactivé : ${target.username}`
            : body.role_id !== undefined && body.role_id !== target.role_id
              ? `Rôle modifié pour ${target.username}`
              : `Compte modifié : ${body.username ?? target.username}`,
      });

      return ok({ id });
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'users.delete' }, async ({ user: actor, log }) => {
    const target = findUserById(id);
    if (!target) return notFound('Compte introuvable.');

    if (target.id === actor.id) {
      return Response.json(
        { error: 'Vous ne pouvez pas supprimer votre propre compte.' },
        { status: 409 },
      );
    }

    if (wouldOrphanAdmin(id, undefined, false)) {
      return Response.json(
        {
          error: 'Ce compte est le dernier Super Admin actif.',
          reason: 'Le supprimer supprimerait tout accès aux paramètres.',
        },
        { status: 409 },
      );
    }

    /**
     * Deactivating keeps the account's trace in the activity journal readable
     * (`actor_label` is denormalised, but the row itself is useful), so that is
     * the default. `?force=1` really removes it.
     */
    const force = new URL(request.url).searchParams.get('force') === '1';
    if (!force && target.is_active === 1) {
      updateUser(id, { is_active: 0 });
      revokeAllSessions(id);
      log({
        action: 'update',
        entityType: 'user',
        entityId: id,
        entityLabel: target.username,
        summary: `Compte désactivé : ${target.username}`,
      });
      return ok({
        archived: true,
        reason:
          'Le compte a été désactivé et ses sessions fermées. Utilisez la suppression définitive pour l’effacer.',
      });
    }

    revokeAllSessions(id);
    deleteUser(id);
    log({
      action: 'delete',
      entityType: 'user',
      entityId: id,
      entityLabel: target.username,
      summary: `Compte supprimé : ${target.username}`,
    });

    return ok({ deleted: true });
  })(request);
}
