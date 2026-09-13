import 'server-only';
import { cookies } from 'next/headers';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { config } from '@/lib/config';
import { getSessionContext, getClientSessionContext } from './session';

/**
 * CSRF protection — double-submit with an HMAC-bound token.
 *
 * The token is `<nonce>.<HMAC(nonce, sessionSecret)>`. It is bound to the
 * session's own `csrf_secret`, so a token minted for one session cannot be used
 * by another, and an attacker without the session cookie cannot mint one at all.
 *
 * Every mutating route (POST/PUT/PATCH/DELETE) calls `assertCsrf`. Combined with
 * SameSite=Lax on the session cookie this gives two independent defences.
 */

const TOKEN_TTL_MS = 6 * 3600 * 1000;

function hmac(value: string, secret: string): string {
  return createHmac('sha256', `${config.auth.secret}:${secret}`).update(value).digest('base64url');
}

export function mintCsrfToken(sessionSecret: string): string {
  const nonce = `${Date.now().toString(36)}.${randomBytes(12).toString('base64url')}`;
  return `${nonce}.${hmac(nonce, sessionSecret)}`;
}

export function verifyCsrfToken(token: string | null | undefined, sessionSecret: string): boolean {
  if (!token) return false;
  const index = token.lastIndexOf('.');
  if (index <= 0) return false;

  const nonce = token.slice(0, index);
  const signature = token.slice(index + 1);
  const expected = hmac(nonce, sessionSecret);

  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  // Reject a stale token so a leaked form value has a short useful life.
  const issuedAt = Number.parseInt(nonce.split('.')[0] ?? '', 36);
  if (!Number.isFinite(issuedAt)) return false;
  return Date.now() - issuedAt < TOKEN_TTL_MS;
}

/** Token for the current admin session, for embedding in a form or header. */
export async function getCsrfToken(): Promise<string | null> {
  const ctx = await getSessionContext();
  if (!ctx) return null;
  return mintCsrfToken(ctx.session.csrf_secret);
}

export async function getClientCsrfToken(): Promise<string | null> {
  const ctx = await getClientSessionContext();
  if (!ctx) return null;
  return mintCsrfToken(ctx.csrfSecret);
}

export class CsrfError extends Error {
  constructor() {
    super('Requête refusée : jeton CSRF invalide ou expiré.');
    this.name = 'CsrfError';
  }
}

/** Reads the token from the header (fetch) or the form body (progressive HTML). */
function extractToken(request: Request, formToken?: string | null): string | null {
  return request.headers.get('x-csrf-token') ?? formToken ?? null;
}

/**
 * Throws `CsrfError` unless the request carries a valid token for the current
 * admin session. Also checks Origin against the configured site URL, which stops
 * a whole class of cross-origin POSTs before the token is even examined.
 */
export async function assertCsrf(request: Request, formToken?: string | null): Promise<void> {
  const ctx = await getSessionContext();
  if (!ctx) throw new CsrfError();
  if (!isSameOrigin(request)) throw new CsrfError();
  if (!verifyCsrfToken(extractToken(request, formToken), ctx.session.csrf_secret)) {
    throw new CsrfError();
  }
}

export async function assertClientCsrf(request: Request, formToken?: string | null): Promise<void> {
  const ctx = await getClientSessionContext();
  if (!ctx) throw new CsrfError();
  if (!isSameOrigin(request)) throw new CsrfError();
  if (!verifyCsrfToken(extractToken(request, formToken), ctx.csrfSecret)) throw new CsrfError();
}

/**
 * Origin check for unauthenticated public endpoints (contact form, chatbot),
 * which have no session to bind a token to.
 */
export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get('origin');
  // Same-origin form posts from some browsers omit Origin; fall back to Referer.
  if (!origin) {
    const referer = request.headers.get('referer');
    if (!referer) return true;
    try {
      return new URL(referer).host === new URL(request.url).host;
    } catch {
      return false;
    }
  }
  try {
    const originHost = new URL(origin).host;
    const requestHost = new URL(request.url).host;
    if (originHost === requestHost) return true;
    // Accept the configured canonical host too (proxy / CDN rewrites the Host).
    return originHost === new URL(config.site.url).host;
  } catch {
    return false;
  }
}

/** Reads the raw cookie value; used by the login form, which has no session yet. */
export async function getCookieValue(name: string): Promise<string | null> {
  const store = await cookies();
  return store.get(name)?.value ?? null;
}

/**
 * Pre-session CSRF for the login form: a random nonce stored in a short-lived
 * cookie and echoed in the form, so a third-party page cannot submit a login.
 */
export async function issuePreSessionToken(): Promise<string> {
  const token = randomBytes(24).toString('base64url');
  const store = await cookies();
  store.set(config.auth.csrfCookie, token, {
    httpOnly: true,
    secure: config.auth.cookieSecure,
    sameSite: 'lax',
    path: '/',
    maxAge: 3600,
  });
  return token;
}

export async function verifyPreSessionToken(submitted: string | null | undefined): Promise<boolean> {
  if (!submitted) return false;
  const stored = await getCookieValue(config.auth.csrfCookie);
  if (!stored) return false;
  const a = Buffer.from(submitted);
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
}
