/**
 * Central, typed configuration. Every environment-dependent value is read
 * here exactly once so no module reaches into `process.env` directly.
 *
 * Values are exposed as **getters**, not as a snapshot taken at import time.
 * ESM hoists `import` statements above module-body code, so a script that calls
 * `dotenv.config()` in its body would otherwise see an already-frozen config
 * built from an empty environment. Reading lazily makes the load order
 * irrelevant.
 */

type AppEnv = 'development' | 'staging' | 'production';

function str(key: string, fallback = ''): string {
  const v = process.env[key];
  return v === undefined || v === '' ? fallback : v;
}

function int(key: string, fallback: number): number {
  const v = Number.parseInt(process.env[key] ?? '', 10);
  return Number.isFinite(v) ? v : fallback;
}

function bool(key: string, fallback = false): boolean {
  const v = str(key);
  if (v === '') return fallback;
  return v === '1' || v.toLowerCase() === 'true';
}

function appEnv(): AppEnv {
  const value = str('APP_ENV', 'development');
  return value === 'production' || value === 'staging' ? value : 'development';
}

/** Never let production boot with a missing or placeholder secret. */
function sessionSecret(): string {
  const secret = str('SESSION_SECRET');
  if (secret.length >= 32) return secret;
  if (appEnv() === 'production') {
    throw new Error(
      'SESSION_SECRET is missing or too short (need >= 32 chars). Refusing to start in production.',
    );
  }
  // Dev-only deterministic fallback so `npm run dev` works before .env.local exists.
  return 'dev-only-insecure-secret-choupotman-os-0000000000';
}

export const config = {
  get env(): AppEnv { return appEnv(); },
  get isProd(): boolean { return appEnv() === 'production'; },
  get isDev(): boolean { return appEnv() === 'development'; },

  site: {
    get url(): string { return str('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000').replace(/\/$/, ''); },
    get name(): string { return str('NEXT_PUBLIC_SITE_NAME', 'CHOUPOTMAN OS'); },
    productName: 'CHOUPOTMAN OS',
    tagline: 'My Work. My Clients. My Projects. My Business.',
    owner: 'Boubaker Choupotman',
    domain: 'choupotman.com',
  },

  auth: {
    get secret(): string { return sessionSecret(); },
    get ttlHours(): number { return int('SESSION_TTL_HOURS', 12); },
    get cookieSecure(): boolean { return bool('COOKIE_SECURE', appEnv() === 'production'); },
    sessionCookie: 'chp_session',
    csrfCookie: 'chp_csrf',
    clientCookie: 'chp_client_session',
  },

  bootstrap: {
    get username(): string { return str('BOOTSTRAP_ADMIN_USERNAME', 'Choupotman'); },
    get email(): string { return str('BOOTSTRAP_ADMIN_EMAIL', 'contact@choupotman.com'); },
    get password(): string { return str('BOOTSTRAP_ADMIN_PASSWORD'); },
  },

  db: {
    get path(): string { return str('DATABASE_PATH', './data/choupotman.db'); },
  },

  storage: {
    get uploadDir(): string { return str('UPLOAD_DIR', './data/uploads'); },
    get backupDir(): string { return str('BACKUP_DIR', './data/backups'); },
    get maxUploadBytes(): number { return int('MAX_UPLOAD_MB', 25) * 1024 * 1024; },
  },

  ai: {
    get apiKey(): string { return str('ANTHROPIC_API_KEY'); },
    get model(): string { return str('AI_MODEL', 'claude-sonnet-5'); },
    get maxTokens(): number { return int('AI_MAX_TOKENS', 1600); },
    /** False when no key is configured — the AI layer then uses its
     *  database-grounded deterministic fallback instead of failing. */
    get enabled(): boolean { return str('ANTHROPIC_API_KEY').length > 10; },
  },

  mail: {
    get host(): string { return str('SMTP_HOST'); },
    get port(): number { return int('SMTP_PORT', 587); },
    get user(): string { return str('SMTP_USER'); },
    get password(): string { return str('SMTP_PASSWORD'); },
    get from(): string { return str('SMTP_FROM', 'Boubaker Choupotman <contact@choupotman.com>'); },
    /** False when SMTP is unconfigured — messages are queued in the database
     *  and shown in the admin instead of being silently dropped. */
    get enabled(): boolean { return str('SMTP_HOST').length > 0; },
  },

  rateLimit: {
    get loginAttempts(): number { return int('RATE_LIMIT_LOGIN_ATTEMPTS', 5); },
    get windowMinutes(): number { return int('RATE_LIMIT_WINDOW_MINUTES', 15); },
  },
} as const;

export type Config = typeof config;
