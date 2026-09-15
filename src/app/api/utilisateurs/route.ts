import { createHandler, list, ok, badRequest } from '@/lib/api/handler';
import { userSchema } from '@/lib/validation/admin';
import {
  createUser,
  findRoleById,
  findUserByEmail,
  findUserByLogin,
  listUsers,
} from '@/lib/db/repositories/users';
import { hashPassword, checkPasswordStrength, generateTemporaryPassword } from '@/lib/auth/password';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createHandler({ permission: 'users.view' }, async () =>
  list(
    // Never the password hash, not even to a super admin: nothing in the
    // interface needs it, so it has no reason to cross the wire.
    listUsers().map((user) => ({
      id: user.id,
      username: user.username,
      email: user.email,
      full_name: user.full_name,
      phone: user.phone,
      role_id: user.role_id,
      role_slug: user.role_slug,
      role_name: user.role_name,
      locale: user.locale,
      is_active: user.is_active,
      must_change_password: user.must_change_password,
      last_login_at: user.last_login_at,
      failed_login_count: user.failed_login_count,
      locked_until: user.locked_until,
      created_at: user.created_at,
    })),
  ),
);

/**
 * Creates an account.
 *
 * The password is set once here and the account is always flagged
 * `must_change_password`, so whoever created it cannot keep using a credential
 * they chose for someone else. When no password is given a random one is
 * generated and returned once — it is never stored in readable form and never
 * written to the activity journal.
 */
export const POST = createHandler(
  { permission: 'users.create', schema: userSchema },
  async ({ body, log }) => {
    if (findUserByLogin(body.username)) return badRequest('Ce nom d’utilisateur est déjà pris.');
    if (findUserByEmail(body.email)) return badRequest('Cette adresse email est déjà utilisée.');

    const role = findRoleById(body.role_id);
    if (!role) return badRequest('Rôle introuvable.');

    // A generated password is shown once; a chosen one must still be strong.
    const generated = body.password ? null : generateTemporaryPassword();
    const password = body.password ?? generated!;

    const strength = checkPasswordStrength(password, [body.username, body.email]);
    if (!strength.ok) {
      // A chosen password failing is the person's to fix; a generated one
      // failing means the generator and the policy have drifted apart.
      if (generated !== null) {
        console.error('Generated password rejected by the policy', strength.errors);
        return Response.json(
          { error: 'Génération du mot de passe impossible. Contactez l’administrateur système.' },
          { status: 500 },
        );
      }
      return Response.json(
        { error: 'Mot de passe trop faible.', fields: { password: strength.errors.join(' ') } },
        { status: 400 },
      );
    }

    const id = createUser({
      username: body.username,
      email: body.email,
      fullName: body.full_name ?? null,
      phone: body.phone ?? null,
      passwordHash: await hashPassword(password),
      roleId: body.role_id,
      locale: body.locale,
      mustChangePassword: true,
    });

    log({
      action: 'create',
      entityType: 'user',
      entityId: id,
      entityLabel: body.username,
      summary: `Compte créé : ${body.username} (${role.name})`,
      // The password, generated or chosen, is never recorded.
      metadata: { role: role.slug, generatedPassword: generated !== null },
    });

    return ok(
      {
        id,
        // Returned once, for the person creating the account to pass on.
        temporaryPassword: generated,
        mustChangePassword: true,
      },
      201,
    );
  },
);
