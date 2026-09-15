import { createHandler, list, ok, badRequest } from '@/lib/api/handler';
import { roleSchema } from '@/lib/validation/admin';
import {
  createRole,
  findRoleBySlug,
  listRoles,
  rolePermissions,
  setRolePermissions,
} from '@/lib/db/repositories/users';
import { allPermissions } from '@/lib/auth/permissions';
import { slugify } from '@/lib/utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createHandler({ permission: 'roles.view' }, async () =>
  list(
    listRoles().map((role) => ({
      id: role.id,
      slug: role.slug,
      name: role.name,
      description: role.description,
      is_system: role.is_system,
      user_count: role.user_count,
      permission_count: role.permission_count,
      permissions: rolePermissions(role.id),
    })),
  ),
);

/**
 * Creates a custom role.
 *
 * Unknown permission strings are dropped rather than rejected: the catalogue is
 * generated from the resource list, and a role saved before a resource existed
 * should not become unsaveable afterwards. The response reports what was kept so
 * the interface can show it.
 */
export const POST = createHandler(
  { permission: 'roles.create', schema: roleSchema },
  async ({ body, log }) => {
    const slug = (body.slug ?? slugify(body.name)).replace(/-/g, '_');
    if (!/^[a-z0-9_]{2,40}$/.test(slug)) {
      return badRequest('Identifiant de rôle invalide (minuscules, chiffres et _).');
    }
    if (findRoleBySlug(slug)) return badRequest('Un rôle avec cet identifiant existe déjà.');

    const known = new Set<string>(allPermissions());
    const kept = body.permissions.filter((permission) => known.has(permission));

    const id = createRole({ slug, name: body.name, description: body.description ?? undefined });
    setRolePermissions(id, kept);

    log({
      action: 'create',
      entityType: 'role',
      entityId: id,
      entityLabel: body.name,
      summary: `Rôle créé : ${body.name} (${kept.length} permissions)`,
      metadata: { slug, ignored: body.permissions.length - kept.length },
    });

    return ok({ id, slug, permissions: kept, ignored: body.permissions.length - kept.length }, 201);
  },
);
