import 'server-only';
import { redirect } from 'next/navigation';
import { getSessionContext, getClientSessionContext, type SessionContext } from './session';
import { can, type Permission } from './permissions';
import type { AuthUser, ClientUserRow } from '@/lib/db/types';
import { logActivity } from '@/lib/db/repositories/activity';

/**
 * Route guards.
 *
 * Server components call `requireUser` / `requirePermission`, which redirect.
 * API routes call `apiUser` / `apiRequire`, which return a Response to send
 * instead of redirecting. Both paths go through the same session and permission
 * checks, so there is exactly one definition of "allowed".
 */

export const ADMIN_LOGIN_PATH = '/espace-admin/connexion';
export const ADMIN_HOME_PATH = '/espace-admin';
export const CHANGE_PASSWORD_PATH = '/espace-admin/changer-mot-de-passe';
export const CLIENT_LOGIN_PATH = '/client/connexion';

/**
 * Requires an authenticated admin user.
 *
 * A user flagged `must_change_password` is bounced to the change-password
 * screen from every other admin route, which is how the initial development
 * password is retired on first login.
 */
export async function requireUser(options: { allowPasswordChange?: boolean } = {}): Promise<AuthUser> {
  const ctx = await getSessionContext();
  if (!ctx) redirect(ADMIN_LOGIN_PATH);
  if (ctx.user.must_change_password && !options.allowPasswordChange) redirect(CHANGE_PASSWORD_PATH);
  return ctx.user;
}

export async function requireSession(): Promise<SessionContext> {
  const ctx = await getSessionContext();
  if (!ctx) redirect(ADMIN_LOGIN_PATH);
  return ctx;
}

/** Requires a permission; sends the user to the admin home with a reason. */
export async function requirePermission(permission: Permission | Permission[]): Promise<AuthUser> {
  const user = await requireUser();
  if (!can(user, permission)) {
    const needed = Array.isArray(permission) ? permission.join(',') : permission;
    logActivity({
      userId: user.id,
      actorLabel: user.username,
      action: 'update',
      summary: `Accès refusé : permission manquante (${needed})`,
      metadata: { permission: needed, role: user.role_slug },
    });
    redirect(`${ADMIN_HOME_PATH}?refus=${encodeURIComponent(needed)}`);
  }
  return user;
}

/** Non-redirecting variant for conditional UI. */
export async function currentUserOrNull(): Promise<AuthUser | null> {
  return (await getSessionContext())?.user ?? null;
}

// ── API guards ───────────────────────────────────────────────────────────

export type ApiFailure = { ok: false; response: Response };
export type ApiSuccess<T> = { ok: true } & T;
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export function unauthorized(message = 'Authentification requise.'): Response {
  return Response.json({ error: message }, { status: 401 });
}

export function forbidden(message = 'Permission insuffisante.'): Response {
  return Response.json({ error: message }, { status: 403 });
}

export function badRequest(message: string, details?: unknown): Response {
  return Response.json({ error: message, details: details ?? null }, { status: 400 });
}

export function notFound(message = 'Ressource introuvable.'): Response {
  return Response.json({ error: message }, { status: 404 });
}

export function serverError(message = 'Erreur interne.'): Response {
  return Response.json({ error: message }, { status: 500 });
}

/** Authenticates an API request, returning either the session or a 401/403. */
export async function apiUser(): Promise<ApiResult<{ user: AuthUser; csrfSecret: string; sessionId: string }>> {
  const ctx = await getSessionContext();
  if (!ctx) return { ok: false, response: unauthorized() };
  if (ctx.user.must_change_password) {
    return {
      ok: false,
      response: Response.json(
        { error: 'Changement de mot de passe requis.', redirect: CHANGE_PASSWORD_PATH },
        { status: 403 },
      ),
    };
  }
  return { ok: true, user: ctx.user, csrfSecret: ctx.session.csrf_secret, sessionId: ctx.session.id };
}

export async function apiRequire(
  permission: Permission | Permission[],
): Promise<ApiResult<{ user: AuthUser; csrfSecret: string; sessionId: string }>> {
  const result = await apiUser();
  if (!result.ok) return result;
  if (!can(result.user, permission)) {
    return { ok: false, response: forbidden() };
  }
  return result;
}

// ── Client portal ────────────────────────────────────────────────────────

export async function requireClientUser(): Promise<ClientUserRow> {
  const ctx = await getClientSessionContext();
  if (!ctx) redirect(CLIENT_LOGIN_PATH);
  return ctx.clientUser;
}

export async function apiClientUser(): Promise<ApiResult<{ clientUser: ClientUserRow; csrfSecret: string }>> {
  const ctx = await getClientSessionContext();
  if (!ctx) return { ok: false, response: unauthorized() };
  return { ok: true, clientUser: ctx.clientUser, csrfSecret: ctx.csrfSecret };
}

/**
 * Ownership check for the portal: every portal query must be scoped by the
 * caller's own client_id, so a client can never read another client's data by
 * changing an id in the URL.
 */
export function assertOwnedByClient(
  clientUser: ClientUserRow,
  record: { client_id: number | null } | null | undefined,
): boolean {
  if (!record) return false;
  return record.client_id === clientUser.client_id;
}
