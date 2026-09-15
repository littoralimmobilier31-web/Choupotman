import { run, scalar } from '@/lib/db/client';
import { config } from '@/lib/config';

/**
 * Rate limiting, backed by the database.
 *
 * An in-memory counter would reset on every deploy and would not be shared
 * across processes; a row-per-hit ledger in SQLite is durable, cheap at this
 * scale (indexed on bucket + timestamp) and self-pruning.
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  /** Seconds until the window frees up — sent as Retry-After. */
  retryAfter: number;
  limit: number;
};

/** Named policies so callers can't invent inconsistent limits inline. */
export const POLICIES = {
  login: { limit: config.rateLimit.loginAttempts, windowMinutes: config.rateLimit.windowMinutes },
  contact: { limit: 5, windowMinutes: 30 },
  projectRequest: { limit: 4, windowMinutes: 60 },
  chatbot: { limit: 40, windowMinutes: 30 },
  aiAdmin: { limit: 120, windowMinutes: 60 },
  passwordReset: { limit: 4, windowMinutes: 60 },
  upload: { limit: 60, windowMinutes: 10 },
  briefSave: { limit: 200, windowMinutes: 60 },
  /**
   * Moodboard captures from outside the app (browser extension, share sheet).
   * Generous enough to clip a page's worth of images in one sitting, tight
   * enough that a leaked token cannot be used to fill the disk.
   */
  capture: { limit: 120, windowMinutes: 60 },
  api: { limit: 300, windowMinutes: 5 },
} as const;

export type PolicyName = keyof typeof POLICIES;

/**
 * Consumes one unit from a bucket. Call once per attempt; `allowed: false`
 * means the caller must stop and return 429.
 */
export function rateLimit(policy: PolicyName, key: string): RateLimitResult {
  const { limit, windowMinutes } = POLICIES[policy];
  const bucket = `${policy}:${key}`;
  const since = `-${windowMinutes} minutes`;

  // Opportunistic cleanup so the table cannot grow without bound.
  run(`DELETE FROM rate_limit_hits WHERE created_at < datetime('now', '-1 day')`);

  const used = scalar<number>(
    `SELECT COUNT(*) AS c FROM rate_limit_hits WHERE bucket = ? AND created_at > datetime('now', ?)`,
    [bucket, since],
    0,
  );

  if (used >= limit) {
    const oldest = scalar<string | null>(
      `SELECT MIN(created_at) AS t FROM rate_limit_hits WHERE bucket = ? AND created_at > datetime('now', ?)`,
      [bucket, since],
      null,
    );
    const retryAfter = oldest
      ? Math.max(
          1,
          Math.ceil(
            (new Date(`${oldest.replace(' ', 'T')}Z`).getTime() + windowMinutes * 60_000 - Date.now()) / 1000,
          ),
        )
      : windowMinutes * 60;
    return { allowed: false, remaining: 0, retryAfter, limit };
  }

  run('INSERT INTO rate_limit_hits (bucket) VALUES (?)', [bucket]);
  return { allowed: true, remaining: Math.max(0, limit - used - 1), retryAfter: 0, limit };
}

/** Inspects a bucket without consuming from it. */
export function rateLimitStatus(policy: PolicyName, key: string): { used: number; limit: number } {
  const { limit, windowMinutes } = POLICIES[policy];
  const used = scalar<number>(
    `SELECT COUNT(*) AS c FROM rate_limit_hits WHERE bucket = ? AND created_at > datetime('now', ?)`,
    [`${policy}:${key}`, `-${windowMinutes} minutes`],
    0,
  );
  return { used, limit };
}

/** Clears a bucket — called after a successful login so one typo isn't punished. */
export function resetRateLimit(policy: PolicyName, key: string): void {
  run('DELETE FROM rate_limit_hits WHERE bucket = ?', [`${policy}:${key}`]);
}

// ── Login attempt ledger (separate, for the security log) ────────────────

export function recordLoginAttempt(identifier: string, ip: string | null, successful: boolean): void {
  run(
    'INSERT INTO login_attempts (identifier, ip_address, successful) VALUES (?, ?, ?)',
    [identifier.slice(0, 120), ip, successful ? 1 : 0],
  );
  run(`DELETE FROM login_attempts WHERE created_at < datetime('now', '-30 days')`);
}

export function recentFailedAttempts(identifier: string, windowMinutes = 15): number {
  return scalar<number>(
    `SELECT COUNT(*) AS c FROM login_attempts
     WHERE identifier = ? AND successful = 0 AND created_at > datetime('now', ?)`,
    [identifier, `-${windowMinutes} minutes`],
    0,
  );
}

/**
 * Extracts the client IP from proxy headers. Used only for rate-limit bucketing
 * and audit lines — never for authorisation, since these headers are spoofable
 * unless the proxy is trusted.
 */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) {
    const first = forwarded.split(',')[0]?.trim();
    if (first) return first;
  }
  return (
    request.headers.get('x-real-ip') ??
    request.headers.get('cf-connecting-ip') ??
    'unknown'
  );
}

/** 429 response with the standard Retry-After header. */
export function tooManyRequests(result: RateLimitResult, message?: string): Response {
  return Response.json(
    {
      error: message ?? 'Trop de requêtes. Merci de réessayer dans quelques minutes.',
      retryAfter: result.retryAfter,
    },
    {
      status: 429,
      headers: {
        'Retry-After': String(result.retryAfter),
        'X-RateLimit-Limit': String(result.limit),
        'X-RateLimit-Remaining': '0',
      },
    },
  );
}
