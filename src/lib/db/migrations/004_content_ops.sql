-- ═══════════════════════════════════════════════════════════════════════
-- 004 — Public content, communication, ops: services, portfolio, blog,
--        briefs, moodboards, messages, notifications, calendar, AI,
--        automation, backups
-- ═══════════════════════════════════════════════════════════════════════

-- ── Services (CMS-managed) ──────────────────────────────────────────────
CREATE TABLE services (
  id            INTEGER PRIMARY KEY,
  slug          TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  category_id   INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  -- Top-level grouping shown on /services: web|it|marketing|audiovisual|ai
  family        TEXT NOT NULL DEFAULT 'web',
  short_description TEXT,
  description   TEXT,
  icon          TEXT,
  -- JSON string arrays, editable in the admin without touching code
  bullet_points TEXT,
  deliverables  TEXT,
  starting_price REAL,
  currency      TEXT NOT NULL DEFAULT 'DZD',
  price_note    TEXT,
  duration_note TEXT,
  position      INTEGER NOT NULL DEFAULT 0,
  is_published  INTEGER NOT NULL DEFAULT 1,
  is_featured   INTEGER NOT NULL DEFAULT 0,
  seo_title     TEXT,
  seo_description TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_services_family ON services(family, position);
CREATE INDEX idx_services_published ON services(is_published);

-- ── Public portfolio ────────────────────────────────────────────────────
-- Deliberately separate from `projects` (the internal delivery record): what
-- is published is a curated story, and an internal project may never be shown.
CREATE TABLE portfolio_projects (
  id             INTEGER PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  title          TEXT NOT NULL,
  subtitle       TEXT,
  project_id     INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  client_name    TEXT,
  client_id      INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  category_id    INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  summary        TEXT,
  description    TEXT,
  challenge      TEXT,
  objectives     TEXT,
  solution       TEXT,
  results        TEXT,
  testimonial_quote  TEXT,
  testimonial_author TEXT,
  testimonial_role   TEXT,
  cover_file_id  INTEGER REFERENCES files(id) ON DELETE SET NULL,
  cover_url      TEXT,
  project_date   TEXT,
  year           INTEGER,
  -- published|draft|archived (publication state, not delivery state)
  status         TEXT NOT NULL DEFAULT 'draft',
  delivery_status TEXT NOT NULL DEFAULT 'completed',
  -- JSON arrays of strings / objects
  technologies   TEXT,
  services_done  TEXT,
  links          TEXT,   -- [{"label":"Site","url":"…"}]
  videos         TEXT,   -- [{"title":"…","url":"…","provider":"youtube"}]
  metrics        TEXT,   -- [{"label":"…","value":"…"}]
  position       INTEGER NOT NULL DEFAULT 0,
  is_featured    INTEGER NOT NULL DEFAULT 0,
  is_demo        INTEGER NOT NULL DEFAULT 0,
  view_count     INTEGER NOT NULL DEFAULT 0,
  seo_title      TEXT,
  seo_description TEXT,
  published_at   TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_portfolio_status ON portfolio_projects(status, position);
CREATE INDEX idx_portfolio_year ON portfolio_projects(year);
CREATE INDEX idx_portfolio_featured ON portfolio_projects(is_featured);

CREATE TABLE portfolio_media (
  id          INTEGER PRIMARY KEY,
  portfolio_id INTEGER NOT NULL REFERENCES portfolio_projects(id) ON DELETE CASCADE,
  file_id     INTEGER REFERENCES files(id) ON DELETE CASCADE,
  url         TEXT,
  kind        TEXT NOT NULL DEFAULT 'image',  -- image|video|embed
  caption     TEXT,
  alt_text    TEXT,
  position    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_portfolio_media ON portfolio_media(portfolio_id, position);

CREATE TABLE case_studies (
  id             INTEGER PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  portfolio_id   INTEGER REFERENCES portfolio_projects(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  subtitle       TEXT,
  problem        TEXT,
  objectives     TEXT,
  strategy       TEXT,
  solution       TEXT,
  development    TEXT,
  tools_used     TEXT,
  result         TEXT,
  metrics        TEXT,   -- JSON [{"label":"…","value":"…","note":"…"}]
  testimonial_quote  TEXT,
  testimonial_author TEXT,
  cover_url      TEXT,
  status         TEXT NOT NULL DEFAULT 'draft',
  reading_minutes INTEGER,
  position       INTEGER NOT NULL DEFAULT 0,
  is_demo        INTEGER NOT NULL DEFAULT 0,
  seo_title      TEXT,
  seo_description TEXT,
  published_at   TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_case_studies_status ON case_studies(status, position);

-- ── Blog / CMS ──────────────────────────────────────────────────────────
CREATE TABLE blog_posts (
  id             INTEGER PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  title          TEXT NOT NULL,
  excerpt        TEXT,
  content        TEXT,
  cover_url      TEXT,
  cover_file_id  INTEGER REFERENCES files(id) ON DELETE SET NULL,
  author_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author_name    TEXT,
  category_id    INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  status         TEXT NOT NULL DEFAULT 'draft',  -- draft|published|archived
  locale         TEXT NOT NULL DEFAULT 'fr',
  seo_title      TEXT,
  seo_description TEXT,
  reading_minutes INTEGER,
  view_count     INTEGER NOT NULL DEFAULT 0,
  is_featured    INTEGER NOT NULL DEFAULT 0,
  is_demo        INTEGER NOT NULL DEFAULT 0,
  published_at   TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_posts_status ON blog_posts(status, published_at DESC);
CREATE INDEX idx_posts_category ON blog_posts(category_id);

-- Profile content for /a-propos. Seeded EMPTY on purpose: the site must never
-- claim a diploma, employer or certification that was not entered by hand.
CREATE TABLE profile_entries (
  id           INTEGER PRIMARY KEY,
  kind         TEXT NOT NULL,        -- experience|education|certification|skill|tool|interest|expertise
  title        TEXT NOT NULL,
  organisation TEXT,
  location     TEXT,
  start_date   TEXT,
  end_date     TEXT,
  is_current   INTEGER NOT NULL DEFAULT 0,
  description  TEXT,
  level        INTEGER,              -- 0-100 for skills, NULL otherwise
  icon         TEXT,
  url          TEXT,
  position     INTEGER NOT NULL DEFAULT 0,
  is_published INTEGER NOT NULL DEFAULT 1,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_profile_kind ON profile_entries(kind, position);

CREATE TABLE testimonials (
  id           INTEGER PRIMARY KEY,
  author_name  TEXT NOT NULL,
  author_role  TEXT,
  company      TEXT,
  avatar_url   TEXT,
  quote        TEXT NOT NULL,
  rating       INTEGER,
  client_id    INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  project_id   INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  locale       TEXT NOT NULL DEFAULT 'fr',
  is_published INTEGER NOT NULL DEFAULT 0,
  is_demo      INTEGER NOT NULL DEFAULT 0,
  position     INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE faqs (
  id           INTEGER PRIMARY KEY,
  question     TEXT NOT NULL,
  answer       TEXT NOT NULL,
  category     TEXT,
  position     INTEGER NOT NULL DEFAULT 0,
  is_published INTEGER NOT NULL DEFAULT 1,
  locale       TEXT NOT NULL DEFAULT 'fr',
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Interactive brief ───────────────────────────────────────────────────
CREATE TABLE briefs (
  id            INTEGER PRIMARY KEY,
  -- Public, unguessable token used by /brief/[token]; no session required.
  token         TEXT NOT NULL UNIQUE,
  title         TEXT NOT NULL,
  client_id     INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  project_id    INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  lead_id       INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  template_key  TEXT NOT NULL DEFAULT 'standard',
  status        TEXT NOT NULL DEFAULT 'sent',   -- draft|sent|in_progress|completed|expired
  locale        TEXT NOT NULL DEFAULT 'fr',
  intro_text    TEXT,
  expires_at    TEXT,
  completed_at  TEXT,
  last_activity_at TEXT,
  is_demo       INTEGER NOT NULL DEFAULT 0,
  created_by    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE brief_questions (
  id          INTEGER PRIMARY KEY,
  brief_id    INTEGER NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  key         TEXT NOT NULL,
  label       TEXT NOT NULL,
  help_text   TEXT,
  -- text|textarea|select|multiselect|number|date|color|url|file|rating
  input_type  TEXT NOT NULL DEFAULT 'text',
  options     TEXT,                     -- JSON array for select types
  is_required INTEGER NOT NULL DEFAULT 0,
  position    INTEGER NOT NULL DEFAULT 0,
  section     TEXT
);
CREATE INDEX idx_brief_questions ON brief_questions(brief_id, position);

-- One row per answer, appended on every save so the admin sees a timeline of
-- how the client's thinking evolved rather than only the final value.
CREATE TABLE brief_responses (
  id           INTEGER PRIMARY KEY,
  brief_id     INTEGER NOT NULL REFERENCES briefs(id) ON DELETE CASCADE,
  question_id  INTEGER REFERENCES brief_questions(id) ON DELETE CASCADE,
  question_key TEXT NOT NULL,
  value        TEXT,
  file_id      INTEGER REFERENCES files(id) ON DELETE SET NULL,
  answered_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_brief_responses ON brief_responses(brief_id, answered_at);

-- ── Moodboards ──────────────────────────────────────────────────────────
CREATE TABLE moodboards (
  id          INTEGER PRIMARY KEY,
  title       TEXT NOT NULL,
  slug        TEXT NOT NULL UNIQUE,
  project_id  INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  client_id   INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  description TEXT,
  -- Optional public share token so a client can view without an account.
  share_token TEXT UNIQUE,
  background  TEXT,
  is_demo     INTEGER NOT NULL DEFAULT 0,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Free-canvas items: x/y/w/h keep drag & drop positions. `source_url` and
-- `capture_token` exist so a future browser extension can POST an image
-- straight onto a board — the architecture the spec asks to leave room for.
CREATE TABLE moodboard_items (
  id           INTEGER PRIMARY KEY,
  moodboard_id INTEGER NOT NULL REFERENCES moodboards(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL DEFAULT 'image',   -- image|text|color|link|note
  file_id      INTEGER REFERENCES files(id) ON DELETE SET NULL,
  url          TEXT,
  source_url   TEXT,
  content      TEXT,
  color        TEXT,
  x            REAL NOT NULL DEFAULT 0,
  y            REAL NOT NULL DEFAULT 0,
  width        REAL NOT NULL DEFAULT 220,
  height       REAL NOT NULL DEFAULT 160,
  rotation     REAL NOT NULL DEFAULT 0,
  z_index      INTEGER NOT NULL DEFAULT 0,
  notes        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_moodboard_items ON moodboard_items(moodboard_id, z_index);

CREATE TABLE moodboard_capture_tokens (
  id           INTEGER PRIMARY KEY,
  moodboard_id INTEGER NOT NULL REFERENCES moodboards(id) ON DELETE CASCADE,
  token_hash   TEXT NOT NULL UNIQUE,
  label        TEXT,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  expires_at   TEXT,
  revoked_at   TEXT,
  last_used_at TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Messaging & email ───────────────────────────────────────────────────
CREATE TABLE message_templates (
  id          INTEGER PRIMARY KEY,
  key         TEXT NOT NULL UNIQUE,
  name        TEXT NOT NULL,
  channel     TEXT NOT NULL DEFAULT 'email',   -- email|whatsapp|internal
  subject     TEXT,
  body        TEXT NOT NULL,
  locale      TEXT NOT NULL DEFAULT 'fr',
  description TEXT,
  is_system   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Also the outbox: when SMTP is not configured, messages stay here with
-- status='queued' and are visible in the admin, so nothing is silently lost.
CREATE TABLE messages (
  id           INTEGER PRIMARY KEY,
  direction    TEXT NOT NULL DEFAULT 'outbound', -- outbound|inbound
  channel      TEXT NOT NULL DEFAULT 'email',
  template_key TEXT,
  client_id    INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  project_id   INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  lead_id      INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  invoice_id   INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  to_name      TEXT,
  to_address   TEXT,
  from_address TEXT,
  subject      TEXT,
  body         TEXT,
  -- draft|queued|sent|failed|received
  status       TEXT NOT NULL DEFAULT 'draft',
  error        TEXT,
  sent_at      TEXT,
  read_at      TEXT,
  is_demo      INTEGER NOT NULL DEFAULT 0,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_messages_status ON messages(status, created_at DESC);
CREATE INDEX idx_messages_client ON messages(client_id);

-- Public contact-form submissions, kept verbatim even after conversion to a lead.
CREATE TABLE contact_submissions (
  id           INTEGER PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL,
  phone        TEXT,
  company      TEXT,
  service      TEXT,
  budget       TEXT,
  deadline     TEXT,
  message      TEXT,
  file_id      INTEGER REFERENCES files(id) ON DELETE SET NULL,
  locale       TEXT NOT NULL DEFAULT 'fr',
  source       TEXT NOT NULL DEFAULT 'contact_form', -- contact_form|project_request|chatbot
  payload      TEXT,
  ip_address   TEXT,
  user_agent   TEXT,
  lead_id      INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  status       TEXT NOT NULL DEFAULT 'new',          -- new|read|converted|spam
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_contact_status ON contact_submissions(status, created_at DESC);

-- ── Notifications ───────────────────────────────────────────────────────
CREATE TABLE notifications (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER REFERENCES users(id) ON DELETE CASCADE,
  -- task|deadline|payment_received|payment_overdue|feedback|revision|client|message|form|project|subscription|system
  kind        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT,
  severity    TEXT NOT NULL DEFAULT 'info',   -- info|success|warning|danger
  url         TEXT,
  entity_type TEXT,
  entity_id   INTEGER,
  -- Stops the automation engine from re-notifying the same fact every run.
  dedupe_key  TEXT,
  read_at     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_notifications_user ON notifications(user_id, read_at, created_at DESC);
CREATE UNIQUE INDEX idx_notifications_dedupe ON notifications(dedupe_key) WHERE dedupe_key IS NOT NULL;

-- ── Calendar ────────────────────────────────────────────────────────────
-- Holds real events. Deadlines, payments and renewals are *projected* into the
-- calendar by a query union instead of being duplicated here, so they can
-- never drift out of sync with their source record.
CREATE TABLE calendar_events (
  id          INTEGER PRIMARY KEY,
  title       TEXT NOT NULL,
  description TEXT,
  -- meeting|delivery|deadline|task|payment|revision|reminder|other
  kind        TEXT NOT NULL DEFAULT 'meeting',
  starts_at   TEXT NOT NULL,
  ends_at     TEXT,
  all_day     INTEGER NOT NULL DEFAULT 0,
  location    TEXT,
  url         TEXT,
  client_id   INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  project_id  INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  task_id     INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  color       TEXT,
  status      TEXT NOT NULL DEFAULT 'confirmed', -- tentative|confirmed|cancelled
  is_demo     INTEGER NOT NULL DEFAULT 0,
  created_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_calendar_start ON calendar_events(starts_at);

-- ── AI ──────────────────────────────────────────────────────────────────
CREATE TABLE ai_conversations (
  id           INTEGER PRIMARY KEY,
  surface      TEXT NOT NULL DEFAULT 'public',  -- public|admin|project|portfolio
  title        TEXT,
  user_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  visitor_key  TEXT,                            -- anonymous public visitors
  project_id   INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  lead_id      INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  locale       TEXT NOT NULL DEFAULT 'fr',
  -- Cumulative token usage, so cost is visible in the admin.
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  model        TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_ai_conversations_surface ON ai_conversations(surface, created_at DESC);

CREATE TABLE ai_messages (
  id              INTEGER PRIMARY KEY,
  conversation_id INTEGER NOT NULL REFERENCES ai_conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL,   -- user|assistant|system|tool
  content         TEXT NOT NULL,
  -- Proposed tool call awaiting confirmation, or the executed result.
  tool_name       TEXT,
  tool_payload    TEXT,
  tool_status     TEXT,            -- proposed|confirmed|executed|rejected|failed
  tokens          INTEGER,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_ai_messages_conv ON ai_messages(conversation_id, created_at);

-- ── Automation engine ───────────────────────────────────────────────────
CREATE TABLE automations (
  id           INTEGER PRIMARY KEY,
  key          TEXT NOT NULL UNIQUE,
  name         TEXT NOT NULL,
  description  TEXT,
  trigger_type TEXT NOT NULL,   -- event|schedule
  trigger_key  TEXT NOT NULL,   -- "project.created" | "daily"
  -- JSON config: thresholds, notification targets, etc.
  config       TEXT,
  is_enabled   INTEGER NOT NULL DEFAULT 1,
  is_system    INTEGER NOT NULL DEFAULT 1,
  last_run_at  TEXT,
  run_count    INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE automation_runs (
  id            INTEGER PRIMARY KEY,
  automation_id INTEGER REFERENCES automations(id) ON DELETE CASCADE,
  automation_key TEXT NOT NULL,
  trigger_key   TEXT,
  status        TEXT NOT NULL DEFAULT 'success',  -- success|skipped|failed
  actions_count INTEGER NOT NULL DEFAULT 0,
  summary       TEXT,
  error         TEXT,
  payload       TEXT,
  duration_ms   INTEGER,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_automation_runs ON automation_runs(automation_key, created_at DESC);

-- ── Backups ─────────────────────────────────────────────────────────────
CREATE TABLE backups (
  id           INTEGER PRIMARY KEY,
  filename     TEXT NOT NULL,
  kind         TEXT NOT NULL DEFAULT 'database',  -- database|files|full
  size_bytes   INTEGER NOT NULL DEFAULT 0,
  checksum     TEXT,
  note         TEXT,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Lightweight analytics (first-party, no third-party tracker) ──────────
CREATE TABLE page_views (
  id          INTEGER PRIMARY KEY,
  path        TEXT NOT NULL,
  locale      TEXT,
  referrer    TEXT,
  -- Daily-rotating salted hash, never a raw IP or a durable identifier.
  visitor_key TEXT,
  entity_type TEXT,
  entity_id   INTEGER,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_page_views_path ON page_views(path, created_at);
CREATE INDEX idx_page_views_created ON page_views(created_at);

CREATE TABLE conversions (
  id          INTEGER PRIMARY KEY,
  kind        TEXT NOT NULL,      -- contact_form|project_request|chatbot_lead|quote_accepted
  entity_type TEXT,
  entity_id   INTEGER,
  value       REAL NOT NULL DEFAULT 0,
  currency    TEXT NOT NULL DEFAULT 'DZD',
  visitor_key TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_conversions_created ON conversions(kind, created_at);
