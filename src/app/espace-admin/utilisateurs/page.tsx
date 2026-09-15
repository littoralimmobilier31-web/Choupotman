import { PageHeader, SummaryStrip } from '@/components/admin/page-kit';
import { UserManager } from '@/components/admin/user-manager';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import { countActiveSuperAdmins, listRoles, listUsers } from '@/lib/db/repositories/users';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Utilisateurs' };

export default async function UsersPage() {
  const user = await requirePermission('users.view');
  const csrf = (await getCsrfToken()) ?? '';

  const users = listUsers();
  const roles = listRoles();
  const active = users.filter((entry) => entry.is_active === 1);
  const locked = users.filter(
    (entry) => entry.locked_until !== null && entry.locked_until > new Date().toISOString(),
  );

  return (
    <>
      <PageHeader
        title="Utilisateurs"
        description="Les comptes ayant accès à l’administration. Chaque compte porte un rôle, et le rôle décide de ce qu’il peut voir et faire."
      />

      <SummaryStrip
        items={[
          { label: 'Comptes actifs', value: active.length },
          { label: 'Désactivés', value: users.length - active.length },
          { label: 'Super Admins actifs', value: countActiveSuperAdmins() },
          { label: 'Comptes verrouillés', value: locked.length },
        ]}
      />

      <div className="mt-5">
        <UserManager
          csrf={csrf}
          currentUserId={user.id}
          superAdminCount={countActiveSuperAdmins()}
          canCreate={can(user, 'users.create')}
          canUpdate={can(user, 'users.update')}
          canDelete={can(user, 'users.delete')}
          roles={roles.map((role) => ({
            id: role.id,
            slug: role.slug,
            name: role.name,
            description: role.description,
          }))}
          users={users.map((entry) => ({
            id: entry.id,
            username: entry.username,
            email: entry.email,
            full_name: entry.full_name,
            phone: entry.phone,
            role_id: entry.role_id,
            role_slug: entry.role_slug,
            role_name: entry.role_name,
            locale: entry.locale,
            is_active: entry.is_active,
            must_change_password: entry.must_change_password,
            last_login_at: entry.last_login_at,
            failed_login_count: entry.failed_login_count,
            locked_until: entry.locked_until,
          }))}
        />
      </div>
    </>
  );
}
