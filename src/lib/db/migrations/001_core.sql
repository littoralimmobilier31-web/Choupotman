-- ═══════════════════════════════════════════════════════════════════════
-- 001 — Core schema: identity, access control, audit, settings, content
-- ═══════════════════════════════════════════════════════════════════════
--
-- Conventions used across every migration:
--   * ids            INTEGER PRIMARY KEY (SQLite rowid alias)
--   * timestamps     TEXT, ISO-8601 UTC ("2026-09-13T10:00:00.000Z")
--   * booleans       INTEGER 0/1
--   * money          REAL in the row's own `currency`, always rounded to 2dp
--                    by the application layer (see lib/money.ts)
--   * JSON payloads  TEXT holding JSON, read through safeJson()
--   * is_demo        1 marks seeded demonstration rows so they can be purged
--                    in one statement without touching real data
-- ═══════════════════════════════════════════════════════════════════════

-- ── Roles & permissions (RBAC) ─────────────────────────────────────────
CREATE TABLE roles (
  id           INTEGER PRIMARY KEY,
  slug         TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  description  TEXT,
  -- System roles cannot be renamed or deleted; custom roles can.
  is_system    INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Permissions are seeded from a single source of truth in lib/auth/permissions.ts
CREATE TABLE permissions (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,   -- e.g. "invoices.create"
  resource    TEXT NOT NULL,          -- e.g. "invoices"
  action      TEXT NOT NULL,          -- e.g. "create"
  description TEXT
);

CREATE TABLE role_permissions (
  role_id       INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

-- ── Users ───────────────────────────────────────────────────────────────
CREATE TABLE users (
  id                    INTEGER PRIMARY KEY,
  username              TEXT NOT NULL UNIQUE,
  email                 TEXT NOT NULL UNIQUE,
  full_name             TEXT,
  -- scrypt: "scrypt$N$r$p$salt_b64$hash_b64". Never a reversible value.
  password_hash         TEXT NOT NULL,
  role_id               INTEGER NOT NULL REFERENCES roles(id),
  avatar_path           TEXT,
  phone                 TEXT,
  locale                TEXT NOT NULL DEFAULT 'fr',
  theme                 TEXT NOT NULL DEFAULT 'system',
  -- Forces the change-password screen before any other admin route renders.
  must_change_password  INTEGER NOT NULL DEFAULT 1,
  is_active             INTEGER NOT NULL DEFAULT 1,
  last_login_at         TEXT,
  failed_login_count    INTEGER NOT NULL DEFAULT 0,
  locked_until          TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_users_role ON users(role_id);
CREATE INDEX idx_users_active ON users(is_active);

-- ── Sessions ────────────────────────────────────────────────────────────
-- Only a SHA-256 of the session token is stored; the raw token lives solely
-- in the client's httpOnly cookie, so a database leak cannot be replayed.
CREATE TABLE sessions (
  id             TEXT PRIMARY KEY,
  user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash     TEXT NOT NULL UNIQUE,
  csrf_secret    TEXT NOT NULL,
  ip_address     TEXT,
  user_agent     TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  last_seen_at   TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at     TEXT NOT NULL,
  revoked_at     TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE password_resets (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TEXT NOT NULL,
  used_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_password_resets_user ON password_resets(user_id);

-- Rate-limiting ledger: one row per attempt, pruned by the limiter.
CREATE TABLE login_attempts (
  id          INTEGER PRIMARY KEY,
  identifier  TEXT NOT NULL,          -- username or "ip:1.2.3.4"
  ip_address  TEXT,
  successful  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_login_attempts_lookup ON login_attempts(identifier, created_at);

-- Generic request-rate ledger used by public endpoints (contact form, chatbot).
CREATE TABLE rate_limit_hits (
  id          INTEGER PRIMARY KEY,
  bucket      TEXT NOT NULL,          -- e.g. "contact:1.2.3.4"
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_rate_limit_bucket ON rate_limit_hits(bucket, created_at);

-- ── Audit trail ─────────────────────────────────────────────────────────
CREATE TABLE activity_logs (
  id            INTEGER PRIMARY KEY,
  user_id       INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor_label   TEXT,                 -- kept so the log survives user deletion
  action        TEXT NOT NULL,        -- "login" | "create" | "update" | "delete" | "ai.action" | …
  entity_type   TEXT,                 -- "invoice" | "project" | …
  entity_id     INTEGER,
  entity_label  TEXT,
  summary       TEXT,
  metadata      TEXT,                 -- JSON: before/after diff, amounts, etc.
  ip_address    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_activity_created ON activity_logs(created_at DESC);
CREATE INDEX idx_activity_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX idx_activity_user ON activity_logs(user_id);

-- ── Settings (key/value, typed by `group`) ──────────────────────────────
CREATE TABLE settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  group_name  TEXT NOT NULL DEFAULT 'general',
  value_type  TEXT NOT NULL DEFAULT 'string',  -- string|number|boolean|json|richtext
  label       TEXT,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_settings_group ON settings(group_name);

-- ── Translations ────────────────────────────────────────────────────────
-- One row per (entity, field, locale). Keeps CMS content multilingual without
-- adding three columns per translatable field, and lets a new language be
-- added with zero schema change.
CREATE TABLE translations (
  id           INTEGER PRIMARY KEY,
  entity_type  TEXT NOT NULL,
  entity_id    INTEGER NOT NULL,
  field        TEXT NOT NULL,
  locale       TEXT NOT NULL,
  value        TEXT,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (entity_type, entity_id, field, locale)
);
CREATE INDEX idx_translations_lookup ON translations(entity_type, entity_id, locale);

-- ── Taxonomy shared by portfolio, blog, services ────────────────────────
CREATE TABLE categories (
  id           INTEGER PRIMARY KEY,
  slug         TEXT NOT NULL,
  name         TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'project',  -- project|post|service|expense
  description  TEXT,
  color        TEXT,
  icon         TEXT,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (kind, slug)
);

CREATE TABLE tags (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Polymorphic tag join: one table for every taggable entity.
CREATE TABLE taggables (
  tag_id       INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  entity_type  TEXT NOT NULL,
  entity_id    INTEGER NOT NULL,
  PRIMARY KEY (tag_id, entity_type, entity_id)
);
CREATE INDEX idx_taggables_entity ON taggables(entity_type, entity_id);

CREATE TABLE technologies (
  id          INTEGER PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  category    TEXT,          -- frontend|backend|devops|design|ai|network|media
  icon        TEXT,
  color       TEXT,
  position    INTEGER NOT NULL DEFAULT 0,
  is_featured INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
