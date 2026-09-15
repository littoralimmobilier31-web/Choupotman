import { PageHeader, SummaryStrip } from '@/components/admin/page-kit';
import { RoleManager } from '@/components/admin/role-manager';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import { listRoles, rolePermissions } from '@/lib/db/repositories/users';
import { ACTIONS, ACTION_LABELS, RESOURCES, RESOURCE_LABELS } from '@/lib/auth/permissions';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Rôles' };

export default async function RolesPage() {
  const user = await requirePermission('roles.view');
  const csrf = (await getCsrfToken()) ?? '';

  const roles = listRoles();

  return (
    <>
      <PageHeader
        title="Rôles et permissions"
        description="Un rôle est une liste de ce qu’un compte peut faire. Les rôles fournis ne sont pas modifiables : ils servent de référence et de filet de sécurité."
      />

      <SummaryStrip
        items={[
          { label: 'Rôles', value: roles.length },
          { label: 'Dont sur mesure', value: roles.filter((role) => role.is_system === 0).length },
          { label: 'Ressources protégées', value: RESOURCES.length },
          { label: 'Permissions possibles', value: RESOURCES.length * ACTIONS.length },
        ]}
      />

      <div className="mt-5">
        <RoleManager
          csrf={csrf}
          canCreate={can(user, 'roles.create')}
          canUpdate={can(user, 'roles.update')}
          canDelete={can(user, 'roles.delete')}
          resources={RESOURCES.map((resource) => ({ key: resource, label: RESOURCE_LABELS[resource] }))}
          actions={ACTIONS.map((action) => ({ key: action, label: ACTION_LABELS[action] }))}
          roles={roles.map((role) => ({
            id: role.id,
            slug: role.slug,
            name: role.name,
            description: role.description,
            is_system: role.is_system,
            user_count: role.user_count,
            permissions: rolePermissions(role.id),
          }))}
        />
      </div>
    </>
  );
}
