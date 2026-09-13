import { getCsrfToken, getClientCsrfToken, issuePreSessionToken } from '@/lib/auth/csrf';

/**
 * Issues a CSRF token for the current caller.
 *
 * This lives in a route handler rather than in the login page because Next only
 * permits cookie writes from a route handler or a server action — a page render
 * cannot set one.
 *
 * Three cases, in order:
 *  - an admin session exists → a token bound to that session's `csrf_secret`;
 *  - a client-portal session exists → the portal equivalent;
 *  - neither → the pre-session nonce the login form needs, stored in a
 *    short-lived httpOnly cookie and echoed back (double-submit).
 *
 * Returning a session token here is not a leak: it is worthless without the
 * httpOnly session cookie it is HMAC-bound to, and it is the same value the
 * admin pages already embed in their forms. It lets a tab left open past the
 * 6-hour token lifetime refresh without a reload.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<Response> {
  const session = (await getCsrfToken()) ?? (await getClientCsrfToken());
  const token = session ?? (await issuePreSessionToken());

  return Response.json(
    { token, scope: session ? 'session' : 'pre-session' },
    {
      headers: {
        // Never cached: each visitor needs their own token.
        'Cache-Control': 'no-store, max-age=0',
      },
    },
  );
}
