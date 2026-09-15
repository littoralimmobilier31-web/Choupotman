import { run } from '../client';

/**
 * Session housekeeping.
 *
 * Separate from `lib/auth/session.ts` on purpose. That module reads cookies and
 * headers, so it carries `import 'server-only'` and cannot be loaded outside the
 * Next bundler. This is a DELETE statement with no request context at all, and
 * the daily sweep — which runs from the command line under `tsx` — needs to call
 * it. Keeping it here means a scheduled job never has to pull the whole
 * cookie-bound authentication layer in behind it.
 */

/** Removes expired and long-revoked rows. Expired sessions serve no purpose. */
export function pruneSessions(): number {
  return run(
    `DELETE FROM sessions
     WHERE expires_at < datetime('now', '-7 days')
        OR revoked_at < datetime('now', '-7 days')`,
  ).changes;
}

/** The same housekeeping for the client portal's own session table. */
export function pruneClientSessions(): number {
  return run(
    `DELETE FROM client_sessions
     WHERE expires_at < datetime('now', '-7 days')
        OR revoked_at < datetime('now', '-7 days')`,
  ).changes;
}
