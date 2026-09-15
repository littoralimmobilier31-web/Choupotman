import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { roleSchema, patchOf } from '@/lib/validation/admin';
import {
  deleteRole,
  findRoleById,
  listRoles,
  rolePermissions,
  setRolePermissions,
  updateRole,
} from '@/lib/db/repositories/users';
import { allPermissions } from '@/lib/auth/permissions';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'roles.update', schema: patchOf(roleSchema) },
    async ({ body, log }) => {
      const role = findRoleById(id);
      if (!role) return notFound('Rôle introuvable.');

      /**
       * A built-in role's permission set is fixed. Super Admin especially: it is
       * the role that can restore every other, so a mistake there would be
       * unrecoverable from inside the application. Its name can still be changed
       * — that is cosmetic.
       */
      if (role.is_system === 1 && body.permissions !== undefined) {
        return Response.json(
          {
            error: `Les permissions du rôle « ${role.name} » ne sont pas modifiables.`,
            reason:
              'Les rôles fournis servent de référence et de filet de sécurité. Dupliquez-en un pour créer un rôle sur mesure.',
          },
          { status: 409 },
        );
      }

      if (body.name !== undefined || body.description !== undefined) {
        updateRole(id, { name: body.name, description: body.description });
      }

      let kept: string[] | undefined;
      if (body.permissions !== undefined) {
        const known = new Set<string>(allPermissions());
        kept = body.permissions.filter((permission) => known.has(permission));
        setRolePermissions(id, kept);
      }

      log({
        action: 'update',
        entityType: 'role',
        entityId: id,
        entityLabel: body.name ?? role.name,
        summary:
          kept !== undefined
            ? `Permissions du rôle « ${body.name ?? role.name} » modifiées (${kept.length} accordées)`
            : `Rôle modifié : ${body.name ?? role.name}`,
      });

      return ok({ id, permissions: kept ?? rolePermissions(id) });
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'roles.delete' }, async ({ log }) => {
    const role = findRoleById(id);
    if (!role) return notFound('Rôle introuvable.');

    if (role.is_system === 1) {
      return Response.json(
        { error: `Le rôle « ${role.name} » est fourni par le système et ne peut pas être supprimé.` },
        { status: 409 },
      );
    }

    // Users would be left pointing at nothing, so the role has to be emptied
    // first — and saying how many accounts is more useful than a bare refusal.
    const current = listRoles().find((entry) => entry.id === id);
    if (current && current.user_count > 0) {
      return Response.json(
        {
          error: 'Ce rôle est encore attribué.',
          reason: `${current.user_count} compte${current.user_count === 1 ? '' : 's'} utilise${current.user_count === 1 ? '' : 'nt'} ce rôle. Attribuez-leur un autre rôle avant de le supprimer.`,
          userCount: current.user_count,
        },
        { status: 409 },
      );
    }

    deleteRole(id);
    log({
      action: 'delete',
      entityType: 'role',
      entityId: id,
      entityLabel: role.name,
      summary: `Rôle supprimé : ${role.name}`,
    });

    return ok({ deleted: true });
  })(request);
}
