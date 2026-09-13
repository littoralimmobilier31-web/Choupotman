import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { config } from '@/lib/config';

export type DB = Database.Database;

/**
 * One connection per process, cached on `globalThis` so Next's dev-mode module
 * reloading doesn't leak handles or re-run PRAGMAs on every hot reload.
 */
const globalForDb = globalThis as unknown as { __choupotmanDb?: DB };

function pragmas(db: DB): void {
  // WAL: concurrent readers while a writer commits — the right mode for a
  // read-heavy dashboard with occasional writes.
  db.pragma('journal_mode = WAL');
  // NORMAL is safe under WAL and avoids an fsync per transaction.
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.pragma('cache_size = -16000'); // ~16 MB page cache
  db.pragma('temp_store = MEMORY');
}

export function getDb(): DB {
  if (globalForDb.__choupotmanDb) return globalForDb.__choupotmanDb;

  const dbPath = resolve(process.cwd(), config.db.path);
  mkdirSync(dirname(dbPath), { recursive: true });

  const db = new Database(dbPath);
  pragmas(db);
  globalForDb.__choupotmanDb = db;
  return db;
}

export function closeDb(): void {
  globalForDb.__choupotmanDb?.close();
  globalForDb.__choupotmanDb = undefined;
}

/** True when FTS5 is compiled into this SQLite build. */
export function hasFts(db: DB = getDb()): boolean {
  try {
    const row = db
      .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='search_fts'`)
      .get();
    return Boolean(row);
  } catch {
    return false;
  }
}

// ── Migrations ───────────────────────────────────────────────────────────

const MIGRATIONS_DIR = join(process.cwd(), 'src', 'lib', 'db', 'migrations');

function ensureMigrationsTable(db: DB): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      name       TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

export type MigrationResult = { applied: string[]; skipped: string[] };

/**
 * Applies every .sql file in migrations/ in lexical order, each inside its own
 * transaction, recording the name so re-running is a no-op. FTS5 statements are
 * tolerated failing so the app still installs on a SQLite build without it.
 */
export function migrate(db: DB = getDb(), { verbose = false } = {}): MigrationResult {
  ensureMigrationsTable(db);

  const applied = new Set(
    db.prepare('SELECT name FROM _migrations').all().map((r) => (r as { name: string }).name),
  );

  if (!existsSync(MIGRATIONS_DIR)) return { applied: [], skipped: [] };

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  const result: MigrationResult = { applied: [], skipped: [] };
  const insert = db.prepare('INSERT INTO _migrations (name) VALUES (?)');

  for (const file of files) {
    if (applied.has(file)) {
      result.skipped.push(file);
      continue;
    }
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
    const run = db.transaction(() => {
      try {
        db.exec(sql);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // A missing FTS5 module must not block installation.
        if (/fts5/i.test(message)) {
          const withoutFts = sql.replace(/CREATE VIRTUAL TABLE[\s\S]*?;/gi, '');
          db.exec(withoutFts);
          if (verbose) console.warn(`  ⚠ ${file}: FTS5 unavailable, search falls back to LIKE`);
        } else {
          throw new Error(`Migration ${file} failed: ${message}`);
        }
      }
      insert.run(file);
    });
    run();
    result.applied.push(file);
    if (verbose) console.log(`  ✓ ${file}`);
  }

  return result;
}

// ── Query helpers ────────────────────────────────────────────────────────

export function all<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T[] {
  return getDb().prepare(sql).all(...params) as T[];
}

export function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): T | null {
  return (getDb().prepare(sql).get(...params) as T | undefined) ?? null;
}

export function run(sql: string, params: unknown[] = []): Database.RunResult {
  return getDb().prepare(sql).run(...params);
}

/** Scalar aggregate helper: count(*), sum(x), etc. */
export function scalar<T = number>(sql: string, params: unknown[] = [], fallback?: T): T {
  const row = getDb().prepare(sql).get(...params) as Record<string, unknown> | undefined;
  if (!row) return fallback as T;
  const value = Object.values(row)[0];
  return (value ?? fallback) as T;
}

/** Wraps a unit of work in a transaction; rolls back on any throw. */
export function transaction<T>(fn: (db: DB) => T): T {
  const db = getDb();
  return db.transaction(fn)(db);
}
