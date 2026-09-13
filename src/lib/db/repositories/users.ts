import { all, one, run, transaction, scalar } from '../client';
import type { AuthUser, PermissionRow, RoleRow, UserRow } from '../types';
import {
  ROLE_DEFINITIONS, allPermissions, parsePermission,
  type BuiltinRole, type Permission,
} from '@/lib/auth/permissions';

/** Users, roles and permission wiring. */

export function findUserById(id: number): UserRow | null {
  return one<UserRow>('SELECT * FROM users WHERE id = ?', [id]);
}

/** Login accepts either the username or the email address, case-insensitively. */
export function findUserByLogin(login: string): UserRow | null {
  const value = login.trim();
  if (!value) return null;
  return one<UserRow>(
    'SELECT * FROM users WHERE lower(username) = lower(?) OR lower(email) = lower(?) LIMIT 1',
    [value, value],
  );
}

export function findUserByEmail(email: string): UserRow | null {
  return one<UserRow>('SELECT * FROM users WHERE lower(email) = lower(?)', [email.trim()]);
}

export function listUsers(): (UserRow & { role_slug: string; role_name: string })[] {
  return all(
    `SELECT u.*, r.slug AS role_slug, r.name AS role_name
     FROM users u JOIN roles r ON r.id = u.role_id
     ORDER BY u.is_active DESC, u.username`,
  );
}

export function countUsers(): number {
  return scalar<number>('SELECT COUNT(*) AS c FROM users', [], 0);
}

/** Hydrates a user with its role and flattened permission list for the session. */
export function toAuthUser(user: UserRow): AuthUser {
  const role = one<RoleRow>('SELECT * FROM roles WHERE id = ?', [user.role_id]);
  const permissions = all<{ slug: string }>(
    `SELECT p.slug FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = ?`,
    [user.role_id],
  ).map((r) => r.slug);

  const { password_hash: _omit, ...rest } = user;
  return {
    ...rest,
    role_slug: role?.slug ?? 'viewer',
    role_name: role?.name ?? 'Viewer',
    permissions,
  };
}

export type CreateUserInput = {
  username: string;
  email: string;
  fullName?: string | null;
  passwordHash: string;
  roleId: number;
  mustChangePassword?: boolean;
  locale?: string;
  phone?: string | null;
};

export function createUser(input: CreateUserInput): number {
  const result = run(
    `INSERT INTO users (username, email, full_name, password_hash, role_id, must_change_password, locale, phone)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.username.trim(),
      input.email.trim().toLowerCase(),
      input.fullName ?? null,
      input.passwordHash,
      input.roleId,
      input.mustChangePassword === false ? 0 : 1,
      input.locale ?? 'fr',
      input.phone ?? null,
    ],
  );
  return Number(result.lastInsertRowid);
}

export function updateUser(
  id: number,
  patch: Partial<Pick<UserRow, 'username' | 'email' | 'full_name' | 'role_id' | 'phone' | 'locale' | 'theme' | 'is_active' | 'avatar_path'>>,
): void {
  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(value);
  }
  if (fields.length === 0) return;
  params.push(id);
  run(`UPDATE users SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params);
}

/** Clears the must-change flag and the lockout counters in one step. */
export function setUserPassword(id: number, passwordHash: string): void {
  run(
    `UPDATE users
     SET password_hash = ?, must_change_password = 0, failed_login_count = 0,
         locked_until = NULL, updated_at = datetime('now')
     WHERE id = ?`,
    [passwordHash, id],
  );
}

export function markLoginSuccess(id: number): void {
  run(
    `UPDATE users
     SET last_login_at = datetime('now'), failed_login_count = 0, locked_until = NULL
     WHERE id = ?`,
    [id],
  );
}

/**
 * Progressive lockout: after `maxAttempts` consecutive failures the account is
 * locked for `lockMinutes`, which blunts credential stuffing even when the
 * attacker rotates IP addresses past the per-IP rate limiter.
 */
export function markLoginFailure(id: number, maxAttempts = 5, lockMinutes = 15): void {
  run(
    `UPDATE users
     SET failed_login_count = failed_login_count + 1,
         locked_until = CASE
           WHEN failed_login_count + 1 >= ? THEN datetime('now', ?)
           ELSE locked_until
         END
     WHERE id = ?`,
    [maxAttempts, `+${lockMinutes} minutes`, id],
  );
}

export function isUserLocked(user: UserRow): boolean {
  if (!user.locked_until) return false;
  return new Date(`${user.locked_until.replace(' ', 'T')}Z`).getTime() > Date.now();
}

export function deleteUser(id: number): void {
  run('DELETE FROM users WHERE id = ?', [id]);
}

/** Guard against deleting or demoting the last active Super Admin. */
export function countActiveSuperAdmins(excludeUserId?: number): number {
  return scalar<number>(
    `SELECT COUNT(*) AS c FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE r.slug = 'super_admin' AND u.is_active = 1 ${excludeUserId ? 'AND u.id != ?' : ''}`,
    excludeUserId ? [excludeUserId] : [],
    0,
  );
}

// ── Roles & permissions ──────────────────────────────────────────────────

export function listRoles(): (RoleRow & { user_count: number; permission_count: number })[] {
  return all(
    `SELECT r.*,
       (SELECT COUNT(*) FROM users u WHERE u.role_id = r.id) AS user_count,
       (SELECT COUNT(*) FROM role_permissions rp WHERE rp.role_id = r.id) AS permission_count
     FROM roles r ORDER BY r.is_system DESC, r.name`,
  );
}

export function findRoleBySlug(slug: string): RoleRow | null {
  return one<RoleRow>('SELECT * FROM roles WHERE slug = ?', [slug]);
}

export function findRoleById(id: number): RoleRow | null {
  return one<RoleRow>('SELECT * FROM roles WHERE id = ?', [id]);
}

export function rolePermissions(roleId: number): string[] {
  return all<{ slug: string }>(
    `SELECT p.slug FROM role_permissions rp
     JOIN permissions p ON p.id = rp.permission_id
     WHERE rp.role_id = ? ORDER BY p.slug`,
    [roleId],
  ).map((r) => r.slug);
}

export function createRole(input: { slug: string; name: string; description?: string }): number {
  const result = run(
    'INSERT INTO roles (slug, name, description, is_system) VALUES (?, ?, ?, 0)',
    [input.slug, input.name, input.description ?? null],
  );
  return Number(result.lastInsertRowid);
}

export function updateRole(id: number, patch: { name?: string; description?: string | null }): void {
  run(
    `UPDATE roles SET name = COALESCE(?, name), description = COALESCE(?, description),
       updated_at = datetime('now') WHERE id = ?`,
    [patch.name ?? null, patch.description ?? null, id],
  );
}

export function deleteRole(id: number): void {
  run('DELETE FROM roles WHERE id = ? AND is_system = 0', [id]);
}

/** Replaces a role's permission set, ignoring any unknown permission string. */
export function setRolePermissions(roleId: number, permissions: string[]): void {
  const valid = permissions.filter((p) => parsePermission(p) !== null);
  transaction((db) => {
    db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(roleId);
    if (valid.length === 0) return;
    const lookup = db.prepare('SELECT id FROM permissions WHERE slug = ?');
    const insert = db.prepare(
      'INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
    );
    for (const slug of valid) {
      const row = lookup.get(slug) as { id: number } | undefined;
      if (row) insert.run(roleId, row.id);
    }
  });
}

export function listPermissions(): PermissionRow[] {
  return all<PermissionRow>('SELECT * FROM permissions ORDER BY resource, action');
}

/**
 * Idempotently writes the permission catalogue and the built-in roles. Called by
 * the seed and safe to re-run after adding a resource — existing custom roles
 * keep their own grants.
 */
export function syncRolesAndPermissions(): void {
  transaction((db) => {
    const insertPermission = db.prepare(
      `INSERT INTO permissions (slug, resource, action, description)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET resource = excluded.resource, action = excluded.action`,
    );
    for (const slug of allPermissions()) {
      const parsed = parsePermission(slug);
      if (!parsed) continue;
      insertPermission.run(slug, parsed.resource, parsed.action, null);
    }

    const insertRole = db.prepare(
      `INSERT INTO roles (slug, name, description, is_system)
       VALUES (?, ?, ?, 1)
       ON CONFLICT(slug) DO UPDATE SET name = excluded.name, description = excluded.description`,
    );
    const getRole = db.prepare('SELECT id FROM roles WHERE slug = ?');
    const clearGrants = db.prepare('DELETE FROM role_permissions WHERE role_id = ?');
    const getPermission = db.prepare('SELECT id FROM permissions WHERE slug = ?');
    const grant = db.prepare(
      'INSERT OR IGNORE INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
    );

    for (const [slug, definition] of Object.entries(ROLE_DEFINITIONS)) {
      insertRole.run(slug, definition.name, definition.description);
      const role = getRole.get(slug) as { id: number } | undefined;
      if (!role) continue;

      const permissions: Permission[] =
        definition.permissions === 'all' ? allPermissions() : definition.permissions;

      // System roles are re-derived from code so a new resource is granted
      // automatically; custom roles are never touched here.
      clearGrants.run(role.id);
      for (const permission of permissions) {
        const row = getPermission.get(permission) as { id: number } | undefined;
        if (row) grant.run(role.id, row.id);
      }
    }
  });
}

export function roleIdFor(slug: BuiltinRole): number {
  const role = findRoleBySlug(slug);
  if (!role) throw new Error(`Role "${slug}" is missing — run npm run db:seed.`);
  return role.id;
}
