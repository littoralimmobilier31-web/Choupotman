import 'server-only';
import { cookies, headers } from 'next/headers';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { all, one, run } from '@/lib/db/client';
import type { AuthUser, ClientUserRow, SessionRow, UserRow } from '@/lib/db/types';
import { findUserById, toAuthUser } from '@/lib/db/repositories/users';
import { generateToken, hashToken } from './password';
import { config } from '@/lib/config';

/**
 * Session management.
 *
 * The cookie carries `<sessionId>.<token>.<signature>`:
 *   • `token` is 32 random bytes — only its SHA-256 is stored, so a database
 *     leak yields nothing replayable;
 *   • `signature` is an HMAC over id+token with SESSION_SECRET, letting the
 *     server reject forged or tampered cookies before touching the database.
 *
 * The cookie is httpOnly + SameSite=Lax + Secure (in production), so it is
 * unreadable from JavaScript and not sent on cross-site requests.
 */

const COOKIE = config.auth.sessionCookie;
const CLIENT_COOKIE = config.auth.clientCookie;

function sign(payload: string): string {
  return createHmac('sha256', config.auth.secret).update(payload).digest('base64url');
}

function buildCookieValue(sessionId: string, token: string): string {
  return `${sessionId}.${token}.${sign(`${sessionId}.${token}`)}`;
}

function parseCookieValue(value: string): { sessionId: string; token: string } | null {
  const parts = value.split('.');
  if (parts.length !== 3) return null;
  const [sessionId, token, signature] = parts as [string, string, string];
  const expected = sign(`${sessionId}.${token}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return { sessionId, token };
}

function expiryDate(hours = config.auth.ttlHours): Date {
  return new Date(Date.now() + hours * 3600 * 1000);
}

function cookieOptions(expires: Date) {
  return {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: 'lax' as const,
    path: '/',
    expires,
  };
}

async function requestMeta(): Promise<{ ip: string | null; userAgent: string | null }> {
  try {
    const h = await headers();
    const forwarded = h.get('x-forwarded-for');
    const ip = forwarded ? (forwarded.split(',')[0] ?? '').trim() : h.get('x-real-ip');
    return { ip: ip || null, userAgent: h.get('user-agent') };
  } catch {
    return { ip: null, userAgent: null };
  }
}

// ── Admin sessions ───────────────────────────────────────────────────────

export async function createSession(userId: number): Promise<{ sessionId: string; csrfSecret: string }> {
  const sessionId = randomBytes(16).toString('hex');
  const token = generateToken(32);
  const csrfSecret = generateToken(24);
  const expires = expiryDate();
  const { ip, userAgent } = await requestMeta();

  run(
    `INSERT INTO sessions (id, user_id, token_hash, csrf_secret, ip_address, user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, userId, hashToken(token), csrfSecret, ip, userAgent, expires.toISOString()],
  );

  const store = await cookies();
  store.set(COOKIE, buildCookieValue(sessionId, token), cookieOptions(expires));
  return { sessionId, csrfSecret };
}

export type SessionContext = { session: SessionRow; user: AuthUser };

/**
 * Validates the cookie and returns the session with its hydrated user.
 * Returns null (never throws) for every failure mode: no cookie, bad signature,
 * unknown/expired/revoked session, deactivated user.
 */
export async function getSessionContext(): Promise<SessionContext | null> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (!raw) return null;

  const parsed = parseCookieValue(raw);
  if (!parsed) return null;

  const session = one<SessionRow>(
    `SELECT * FROM sessions
     WHERE id = ? AND token_hash = ? AND revoked_at IS NULL AND expires_at > ?`,
    [parsed.sessionId, hashToken(parsed.token), new Date().toISOString()],
  );
  if (!session) return null;

  const user = findUserById(session.user_id);
  if (!user || !user.is_active) return null;

  // Cheap liveness ping; the exact second does not matter, so no transaction.
  run(`UPDATE sessions SET last_seen_at = datetime('now') WHERE id = ?`, [session.id]);

  return { session, user: toAuthUser(user) };
}

export async function getCurrentUser(): Promise<AuthUser | null> {
  return (await getSessionContext())?.user ?? null;
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  const raw = store.get(COOKIE)?.value;
  if (raw) {
    const parsed = parseCookieValue(raw);
    if (parsed) {
      run(`UPDATE sessions SET revoked_at = datetime('now') WHERE id = ?`, [parsed.sessionId]);
    }
  }
  store.delete(COOKIE);
}

/** Revokes every session of a user — used after a password change or reset. */
export function revokeAllSessions(userId: number, exceptSessionId?: string): number {
  const result = exceptSessionId
    ? run(
        `UPDATE sessions SET revoked_at = datetime('now')
         WHERE user_id = ? AND id != ? AND revoked_at IS NULL`,
        [userId, exceptSessionId],
      )
    : run(
        `UPDATE sessions SET revoked_at = datetime('now') WHERE user_id = ? AND revoked_at IS NULL`,
        [userId],
      );
  return result.changes;
}

export function listUserSessions(userId: number): SessionRow[] {
  return all<SessionRow>(
    `SELECT * FROM sessions
     WHERE user_id = ? AND revoked_at IS NULL AND expires_at > ?
     ORDER BY last_seen_at DESC`,
    [userId, new Date().toISOString()],
  );
}

/** Housekeeping — expired rows serve no purpose. */
export function pruneSessions(): number {
  const result = run(
    `DELETE FROM sessions WHERE expires_at < datetime('now', '-7 days') OR revoked_at < datetime('now', '-7 days')`,
  );
  return result.changes;
}

// ── Client-portal sessions ───────────────────────────────────────────────
// Deliberately a separate table and cookie: a portal visitor can never be
// mistaken for an admin user, whatever happens in the admin session layer.

export async function createClientSession(clientUserId: number): Promise<string> {
  const sessionId = randomBytes(16).toString('hex');
  const token = generateToken(32);
  const csrfSecret = generateToken(24);
  const expires = expiryDate(24 * 14);
  const { ip, userAgent } = await requestMeta();

  run(
    `INSERT INTO client_sessions (id, client_user_id, token_hash, csrf_secret, ip_address, user_agent, expires_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [sessionId, clientUserId, hashToken(token), csrfSecret, ip, userAgent, expires.toISOString()],
  );

  const store = await cookies();
  store.set(CLIENT_COOKIE, buildCookieValue(sessionId, token), cookieOptions(expires));
  return csrfSecret;
}

export type ClientSessionContext = {
  clientUser: ClientUserRow;
  csrfSecret: string;
  sessionId: string;
};

export async function getClientSessionContext(): Promise<ClientSessionContext | null> {
  const store = await cookies();
  const raw = store.get(CLIENT_COOKIE)?.value;
  if (!raw) return null;

  const parsed = parseCookieValue(raw);
  if (!parsed) return null;

  const session = one<{ id: string; client_user_id: number; csrf_secret: string }>(
    `SELECT id, client_user_id, csrf_secret FROM client_sessions
     WHERE id = ? AND token_hash = ? AND revoked_at IS NULL AND expires_at > ?`,
    [parsed.sessionId, hashToken(parsed.token), new Date().toISOString()],
  );
  if (!session) return null;

  const clientUser = one<ClientUserRow>(
    'SELECT * FROM client_users WHERE id = ? AND is_active = 1',
    [session.client_user_id],
  );
  if (!clientUser) return null;

  return { clientUser, csrfSecret: session.csrf_secret, sessionId: session.id };
}

export async function destroyClientSession(): Promise<void> {
  const store = await cookies();
  const raw = store.get(CLIENT_COOKIE)?.value;
  if (raw) {
    const parsed = parseCookieValue(raw);
    if (parsed) {
      run(`UPDATE client_sessions SET revoked_at = datetime('now') WHERE id = ?`, [parsed.sessionId]);
    }
  }
  store.delete(CLIENT_COOKIE);
}

export type { UserRow };
