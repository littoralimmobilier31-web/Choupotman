import { randomBytes, scrypt as scryptCb, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * Password hashing with scrypt from Node's own crypto module.
 *
 * scrypt is memory-hard and part of the standard library, so there is no native
 * build step and no third-party dependency in the authentication path. The
 * parameters are stored inside the hash string, which means they can be raised
 * later and old hashes stay verifiable (see `needsRehash`).
 *
 * Format: scrypt$N$r$p$<salt-base64>$<hash-base64>
 */

const PARAMS = { N: 2 ** 15, r: 8, p: 1, keylen: 64 } as const;
// scrypt needs roughly 128 × N × r bytes; give it headroom or Node throws.
const MAXMEM = 256 * PARAMS.N * PARAMS.r;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = await scrypt(password.normalize('NFKC'), salt, PARAMS.keylen, {
    N: PARAMS.N, r: PARAMS.r, p: PARAMS.p, maxmem: MAXMEM,
  });
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), derived.toString('base64')].join('$');
}

/**
 * Constant-time verification. Returns false for any malformed stored value
 * rather than throwing, so a corrupted row can't crash the login route.
 */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const [, nRaw, rRaw, pRaw, saltB64, hashB64] = parts;
  const N = Number.parseInt(nRaw!, 10);
  const r = Number.parseInt(rRaw!, 10);
  const p = Number.parseInt(pRaw!, 10);
  if (!Number.isFinite(N) || !Number.isFinite(r) || !Number.isFinite(p)) return false;

  try {
    const salt = Buffer.from(saltB64!, 'base64');
    const expected = Buffer.from(hashB64!, 'base64');
    const derived = await scrypt(password.normalize('NFKC'), salt, expected.length, {
      N, r, p, maxmem: 256 * N * r,
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/** True when a hash was made with weaker parameters and should be upgraded on next login. */
export function needsRehash(stored: string | null | undefined): boolean {
  if (!stored) return true;
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return true;
  return Number.parseInt(parts[1]!, 10) < PARAMS.N;
}

// ── Token helpers ────────────────────────────────────────────────────────

/** URL-safe random token for sessions, invites, brief links, share links. */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/**
 * Only a SHA-256 of a bearer token is ever persisted. A token is high-entropy
 * random (not a password), so a single fast hash is the right primitive: it
 * makes a database leak unusable for replay without adding login latency.
 */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

// ── Password policy ──────────────────────────────────────────────────────

export type PasswordCheck = { ok: boolean; score: 0 | 1 | 2 | 3 | 4; errors: string[] };

/**
 * Policy enforced server-side on every password write (the client shows the
 * same feedback, but the server is the authority).
 */
export function checkPasswordStrength(password: string, context: string[] = []): PasswordCheck {
  const errors: string[] = [];
  const value = password ?? '';

  if (value.length < 10) errors.push('Le mot de passe doit contenir au moins 10 caractères.');
  if (value.length > 200) errors.push('Le mot de passe ne peut pas dépasser 200 caractères.');
  if (!/[a-z]/.test(value)) errors.push('Ajoutez au moins une lettre minuscule.');
  if (!/[A-Z]/.test(value)) errors.push('Ajoutez au moins une lettre majuscule.');
  if (!/[0-9]/.test(value)) errors.push('Ajoutez au moins un chiffre.');
  if (!/[^A-Za-z0-9]/.test(value)) errors.push('Ajoutez au moins un caractère spécial.');

  const lower = value.toLowerCase();
  for (const hint of context) {
    if (hint && hint.length >= 4 && lower.includes(hint.toLowerCase())) {
      errors.push('Le mot de passe ne doit pas contenir votre nom d’utilisateur ou votre email.');
      break;
    }
  }

  const COMMON = [
    'password', 'motdepasse', '123456', 'azerty', 'qwerty', 'admin',
    'welcome', 'letmein', 'choupotman', '000000', 'iloveyou',
  ];
  if (COMMON.some((c) => lower.includes(c))) {
    errors.push('Ce mot de passe est trop courant.');
  }

  let score = 0;
  if (value.length >= 10) score += 1;
  if (value.length >= 14) score += 1;
  if (/[a-z]/.test(value) && /[A-Z]/.test(value) && /[0-9]/.test(value)) score += 1;
  if (/[^A-Za-z0-9]/.test(value) && value.length >= 12) score += 1;

  return {
    ok: errors.length === 0,
    score: Math.min(4, score) as PasswordCheck['score'],
    errors,
  };
}
