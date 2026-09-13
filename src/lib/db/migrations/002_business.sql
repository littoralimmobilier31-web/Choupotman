-- ═══════════════════════════════════════════════════════════════════════
-- 002 — Business core: CRM, projects, stages, tasks, files
-- ═══════════════════════════════════════════════════════════════════════

-- ── CRM: clients ────────────────────────────────────────────────────────
CREATE TABLE clients (
  id            INTEGER PRIMARY KEY,
  name          TEXT NOT NULL,
  company       TEXT,
  email         TEXT,
  phone         TEXT,
  whatsapp      TEXT,
  country       TEXT,
  city          TEXT,
  address       TEXT,
  website       TEXT,
  -- JSON: {"linkedin":"…","instagram":"…","facebook":"…"}
  social_links  TEXT,
  tax_id        TEXT,
  currency      TEXT NOT NULL DEFAULT 'DZD',
  preferred_locale TEXT NOT NULL DEFAULT 'fr',
  status        TEXT NOT NULL DEFAULT 'active',   -- active|inactive|archived
  source        TEXT,                             -- contact_form|chatbot|referral|…
  notes         TEXT,
  avatar_path   TEXT,
  is_demo       INTEGER NOT NULL DEFAULT 0,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_clients_status ON clients(status);
CREATE INDEX idx_clients_name ON clients(name);
CREATE INDEX idx_clients_demo ON clients(is_demo);

-- Portal accounts, deliberately separate from admin `users` so a client can
-- never hold an admin role by accident.
CREATE TABLE client_users (
  id                   INTEGER PRIMARY KEY,
  client_id            INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  email                TEXT NOT NULL UNIQUE,
  full_name            TEXT,
  password_hash        TEXT,
  -- Magic-link style invitation; hash only, same rule as sessions.
  invite_token_hash    TEXT,
  invite_expires_at    TEXT,
  must_change_password INTEGER NOT NULL DEFAULT 1,
  is_active            INTEGER NOT NULL DEFAULT 1,
  last_login_at        TEXT,
  locale               TEXT NOT NULL DEFAULT 'fr',
  created_at           TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_client_users_client ON client_users(client_id);

CREATE TABLE client_sessions (
  id            TEXT PRIMARY KEY,
  client_user_id INTEGER NOT NULL REFERENCES client_users(id) ON DELETE CASCADE,
  token_hash    TEXT NOT NULL UNIQUE,
  csrf_secret   TEXT NOT NULL,
  ip_address    TEXT,
  user_agent    TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL,
  revoked_at    TEXT
);
CREATE INDEX idx_client_sessions_user ON client_sessions(client_user_id);

-- ── Sales pipeline ──────────────────────────────────────────────────────
CREATE TABLE leads (
  id              INTEGER PRIMARY KEY,
  name            TEXT NOT NULL,
  company         TEXT,
  email           TEXT,
  phone           TEXT,
  country         TEXT,
  city            TEXT,
  -- new|contacted|qualified|proposal|negotiation|won|lost
  stage           TEXT NOT NULL DEFAULT 'new',
  source          TEXT NOT NULL DEFAULT 'contact_form',
  service_interest TEXT,
  budget_range    TEXT,
  estimated_value REAL NOT NULL DEFAULT 0,
  currency        TEXT NOT NULL DEFAULT 'DZD',
  deadline_hint   TEXT,
  message         TEXT,
  -- JSON blob of the whole submitted form / chatbot transcript summary
  payload         TEXT,
  score           INTEGER NOT NULL DEFAULT 0,      -- 0-100 qualification score
  lost_reason     TEXT,
  client_id       INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  project_id      INTEGER,
  assigned_to     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  is_demo         INTEGER NOT NULL DEFAULT 0,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_leads_stage ON leads(stage);
CREATE INDEX idx_leads_created ON leads(created_at DESC);

-- ── Projects ────────────────────────────────────────────────────────────
CREATE TABLE projects (
  id                 INTEGER PRIMARY KEY,
  reference           TEXT NOT NULL UNIQUE,        -- PRJ-2026-0001
  title              TEXT NOT NULL,
  slug               TEXT NOT NULL UNIQUE,
  client_id          INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  category_id        INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  description        TEXT,
  -- prospect|planning|in_progress|in_review|awaiting_client|completed|archived
  status             TEXT NOT NULL DEFAULT 'prospect',
  priority           TEXT NOT NULL DEFAULT 'medium',  -- low|medium|high|urgent
  budget             REAL NOT NULL DEFAULT 0,
  currency           TEXT NOT NULL DEFAULT 'DZD',
  start_date         TEXT,
  delivery_date      TEXT,
  completed_at       TEXT,
  progress           INTEGER NOT NULL DEFAULT 0,      -- 0-100, derived from tasks
  -- Revision policy, enforced by the revisions module + automation engine
  revisions_included INTEGER NOT NULL DEFAULT 3,
  revision_extra_cost REAL NOT NULL DEFAULT 0,
  notes              TEXT,
  color              TEXT,
  is_demo            INTEGER NOT NULL DEFAULT 0,
  created_by         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at         TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_projects_client ON projects(client_id);
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_delivery ON projects(delivery_date);
CREATE INDEX idx_projects_demo ON projects(is_demo);

CREATE TABLE project_services (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  service_id INTEGER NOT NULL,
  PRIMARY KEY (project_id, service_id)
);

CREATE TABLE project_stages (
  id           INTEGER PRIMARY KEY,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  position     INTEGER NOT NULL DEFAULT 0,
  status       TEXT NOT NULL DEFAULT 'todo',   -- todo|in_progress|done|blocked
  started_at   TEXT,
  completed_at TEXT,
  due_date     TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_stages_project ON project_stages(project_id, position);

CREATE TABLE tasks (
  id            INTEGER PRIMARY KEY,
  project_id    INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  stage_id      INTEGER REFERENCES project_stages(id) ON DELETE SET NULL,
  title         TEXT NOT NULL,
  description   TEXT,
  assignee_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  priority      TEXT NOT NULL DEFAULT 'medium',
  -- Kanban columns
  status        TEXT NOT NULL DEFAULT 'todo',   -- todo|in_progress|review|done|blocked
  due_date      TEXT,
  started_at    TEXT,
  completed_at  TEXT,
  estimate_hours REAL,
  spent_hours   REAL NOT NULL DEFAULT 0,
  position      INTEGER NOT NULL DEFAULT 0,
  is_demo       INTEGER NOT NULL DEFAULT 0,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_status ON tasks(status);
CREATE INDEX idx_tasks_due ON tasks(due_date);
CREATE INDEX idx_tasks_assignee ON tasks(assignee_id);

CREATE TABLE task_checklist_items (
  id         INTEGER PRIMARY KEY,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,
  is_done    INTEGER NOT NULL DEFAULT 0,
  position   INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_checklist_task ON task_checklist_items(task_id, position);

CREATE TABLE task_comments (
  id         INTEGER PRIMARY KEY,
  task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_label TEXT,
  body       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_task_comments_task ON task_comments(task_id, created_at);

-- ── Unified per-project timeline ────────────────────────────────────────
-- Every meaningful event lands here so the project page can render one
-- chronological story (brief received → design started → feedback → …).
CREATE TABLE project_events (
  id          INTEGER PRIMARY KEY,
  project_id  INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,   -- created|status|stage|task|feedback|revision|invoice|payment|file|brief|message|ai
  title       TEXT NOT NULL,
  body        TEXT,
  actor_label TEXT,
  metadata    TEXT,            -- JSON
  entity_type TEXT,
  entity_id   INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_project_events ON project_events(project_id, created_at DESC);

-- ── Files & folders ─────────────────────────────────────────────────────
CREATE TABLE file_folders (
  id          INTEGER PRIMARY KEY,
  parent_id   INTEGER REFERENCES file_folders(id) ON DELETE CASCADE,
  client_id   INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  project_id  INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  -- Materialised path ("/Client/Projet/01-Documents") so a subtree can be
  -- listed or moved with a single LIKE query.
  path        TEXT NOT NULL,
  position    INTEGER NOT NULL DEFAULT 0,
  is_system   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_folders_project ON file_folders(project_id);
CREATE INDEX idx_folders_client ON file_folders(client_id);
CREATE INDEX idx_folders_path ON file_folders(path);

CREATE TABLE files (
  id            INTEGER PRIMARY KEY,
  folder_id     INTEGER REFERENCES file_folders(id) ON DELETE SET NULL,
  client_id     INTEGER REFERENCES clients(id) ON DELETE CASCADE,
  project_id    INTEGER REFERENCES projects(id) ON DELETE CASCADE,
  -- Generic attachment target (task, feedback, invoice, brief response, …)
  entity_type   TEXT,
  entity_id     INTEGER,
  original_name TEXT NOT NULL,
  stored_name   TEXT NOT NULL UNIQUE,   -- randomised on disk; never user input
  mime_type     TEXT NOT NULL,
  extension     TEXT,
  size_bytes    INTEGER NOT NULL DEFAULT 0,
  checksum      TEXT,
  kind          TEXT NOT NULL DEFAULT 'document', -- image|video|document|archive|other
  width         INTEGER,
  height        INTEGER,
  caption       TEXT,
  -- Files shared with the client portal are opt-in, never by default.
  is_client_visible INTEGER NOT NULL DEFAULT 0,
  is_demo       INTEGER NOT NULL DEFAULT 0,
  uploaded_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_files_project ON files(project_id);
CREATE INDEX idx_files_folder ON files(folder_id);
CREATE INDEX idx_files_entity ON files(entity_type, entity_id);

-- Folder-structure templates applied automatically on project creation.
CREATE TABLE folder_templates (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  is_default  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE folder_template_items (
  id          INTEGER PRIMARY KEY,
  template_id INTEGER NOT NULL REFERENCES folder_templates(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  parent_name TEXT,               -- NULL = top level of the template
  position    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_folder_template_items ON folder_template_items(template_id, position);
