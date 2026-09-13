-- ═══════════════════════════════════════════════════════════════════════
-- 003 — Money: quotes, invoices, payments, contracts, expenses, subscriptions
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE quotes (
  id             INTEGER PRIMARY KEY,
  number         TEXT NOT NULL UNIQUE,        -- DEV-2026-0001
  client_id      INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  project_id     INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  lead_id        INTEGER REFERENCES leads(id) ON DELETE SET NULL,
  title          TEXT,
  -- draft|sent|accepted|refused|expired|archived
  status         TEXT NOT NULL DEFAULT 'draft',
  issue_date     TEXT NOT NULL DEFAULT (date('now')),
  valid_until    TEXT,
  currency       TEXT NOT NULL DEFAULT 'DZD',
  -- Totals are stored (not recomputed on read) so a historical document never
  -- changes when tax rates or item prices are edited later. recalcQuote()
  -- is the single writer.
  subtotal       REAL NOT NULL DEFAULT 0,
  discount_type  TEXT NOT NULL DEFAULT 'none',  -- none|percent|amount
  discount_value REAL NOT NULL DEFAULT 0,
  discount_total REAL NOT NULL DEFAULT 0,
  tax_rate       REAL NOT NULL DEFAULT 0,       -- configurable VAT, e.g. 19
  tax_total      REAL NOT NULL DEFAULT 0,
  total          REAL NOT NULL DEFAULT 0,
  delivery_terms TEXT,
  payment_terms  TEXT,
  conditions     TEXT,
  notes          TEXT,
  sent_at        TEXT,
  accepted_at    TEXT,
  locale         TEXT NOT NULL DEFAULT 'fr',
  is_demo        INTEGER NOT NULL DEFAULT 0,
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_quotes_client ON quotes(client_id);
CREATE INDEX idx_quotes_status ON quotes(status);

CREATE TABLE quote_items (
  id          INTEGER PRIMARY KEY,
  quote_id    INTEGER NOT NULL REFERENCES quotes(id) ON DELETE CASCADE,
  service_id  INTEGER,
  label       TEXT NOT NULL,
  description TEXT,
  quantity    REAL NOT NULL DEFAULT 1,
  unit        TEXT NOT NULL DEFAULT 'forfait',
  unit_price  REAL NOT NULL DEFAULT 0,
  discount    REAL NOT NULL DEFAULT 0,       -- percent on the line
  line_total  REAL NOT NULL DEFAULT 0,
  position    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_quote_items_quote ON quote_items(quote_id, position);

CREATE TABLE invoices (
  id             INTEGER PRIMARY KEY,
  number         TEXT NOT NULL UNIQUE,        -- FAC-2026-0001
  client_id      INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  project_id     INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  quote_id       INTEGER REFERENCES quotes(id) ON DELETE SET NULL,
  title          TEXT,
  -- draft|sent|partially_paid|paid|overdue|cancelled
  status         TEXT NOT NULL DEFAULT 'draft',
  kind           TEXT NOT NULL DEFAULT 'standard', -- standard|deposit|revision_extra|final
  issue_date     TEXT NOT NULL DEFAULT (date('now')),
  due_date       TEXT,
  currency       TEXT NOT NULL DEFAULT 'DZD',
  subtotal       REAL NOT NULL DEFAULT 0,
  discount_type  TEXT NOT NULL DEFAULT 'none',
  discount_value REAL NOT NULL DEFAULT 0,
  discount_total REAL NOT NULL DEFAULT 0,
  tax_rate       REAL NOT NULL DEFAULT 0,
  tax_total      REAL NOT NULL DEFAULT 0,
  total          REAL NOT NULL DEFAULT 0,
  -- Mirror of SUM(payments.amount); kept in sync by recalcInvoice().
  amount_paid    REAL NOT NULL DEFAULT 0,
  balance_due    REAL NOT NULL DEFAULT 0,
  payment_terms  TEXT,
  notes          TEXT,
  sent_at        TEXT,
  paid_at        TEXT,
  last_reminder_at TEXT,
  reminder_count INTEGER NOT NULL DEFAULT 0,
  locale         TEXT NOT NULL DEFAULT 'fr',
  is_demo        INTEGER NOT NULL DEFAULT 0,
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_invoices_client ON invoices(client_id);
CREATE INDEX idx_invoices_status ON invoices(status);
CREATE INDEX idx_invoices_due ON invoices(due_date);
CREATE INDEX idx_invoices_project ON invoices(project_id);

CREATE TABLE invoice_items (
  id          INTEGER PRIMARY KEY,
  invoice_id  INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  service_id  INTEGER,
  label       TEXT NOT NULL,
  description TEXT,
  quantity    REAL NOT NULL DEFAULT 1,
  unit        TEXT NOT NULL DEFAULT 'forfait',
  unit_price  REAL NOT NULL DEFAULT 0,
  discount    REAL NOT NULL DEFAULT 0,
  line_total  REAL NOT NULL DEFAULT 0,
  position    INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_invoice_items_invoice ON invoice_items(invoice_id, position);

CREATE TABLE payments (
  id           INTEGER PRIMARY KEY,
  invoice_id   INTEGER REFERENCES invoices(id) ON DELETE CASCADE,
  client_id    INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  project_id   INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  amount       REAL NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'DZD',
  -- cash|transfer|ccp|card|other
  method       TEXT NOT NULL DEFAULT 'transfer',
  reference    TEXT,
  paid_at      TEXT NOT NULL DEFAULT (date('now')),
  status       TEXT NOT NULL DEFAULT 'confirmed',  -- pending|confirmed|refunded
  notes        TEXT,
  is_demo      INTEGER NOT NULL DEFAULT 0,
  recorded_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_payments_invoice ON payments(invoice_id);
CREATE INDEX idx_payments_date ON payments(paid_at);

-- ── Contracts ───────────────────────────────────────────────────────────
CREATE TABLE contract_templates (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  description TEXT,
  -- Body holds {{client_name}}, {{project_name}} … placeholders; the render
  -- step substitutes from a strictly whitelisted variable map.
  body        TEXT NOT NULL,
  locale      TEXT NOT NULL DEFAULT 'fr',
  is_default  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE contracts (
  id           INTEGER PRIMARY KEY,
  number       TEXT NOT NULL UNIQUE,          -- CTR-2026-0001
  template_id  INTEGER REFERENCES contract_templates(id) ON DELETE SET NULL,
  client_id    INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  project_id   INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  title        TEXT NOT NULL,
  -- Rendered body is frozen at generation time so later template edits never
  -- rewrite a contract that has already been sent or signed.
  body         TEXT NOT NULL,
  variables    TEXT,                          -- JSON snapshot of substitutions
  status       TEXT NOT NULL DEFAULT 'draft', -- draft|sent|signed|cancelled
  issue_date   TEXT NOT NULL DEFAULT (date('now')),
  start_date   TEXT,
  delivery_date TEXT,
  amount       REAL NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'DZD',
  signed_at    TEXT,
  locale       TEXT NOT NULL DEFAULT 'fr',
  is_demo      INTEGER NOT NULL DEFAULT 0,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_contracts_client ON contracts(client_id);
CREATE INDEX idx_contracts_project ON contracts(project_id);

-- ── Revisions ───────────────────────────────────────────────────────────
-- `index_number` is the 1-based counter compared against
-- projects.revisions_included; anything above the limit is flagged as extra
-- and can be turned into a supplementary invoice.
CREATE TABLE revisions (
  id             INTEGER PRIMARY KEY,
  project_id     INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  index_number   INTEGER NOT NULL,
  title          TEXT,
  description    TEXT,
  requested_by   TEXT,                          -- client|internal
  status         TEXT NOT NULL DEFAULT 'open',  -- open|in_progress|done|rejected
  is_extra       INTEGER NOT NULL DEFAULT 0,
  extra_cost     REAL NOT NULL DEFAULT 0,
  currency       TEXT NOT NULL DEFAULT 'DZD',
  extra_invoice_id INTEGER REFERENCES invoices(id) ON DELETE SET NULL,
  requested_at   TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at   TEXT,
  is_demo        INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_revisions_project ON revisions(project_id, index_number);

-- ── Client feedback ─────────────────────────────────────────────────────
CREATE TABLE feedback (
  id           INTEGER PRIMARY KEY,
  project_id   INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  client_id    INTEGER REFERENCES clients(id) ON DELETE SET NULL,
  stage_id     INTEGER REFERENCES project_stages(id) ON DELETE SET NULL,
  task_id      INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
  author_label TEXT,
  comment      TEXT,
  rating       INTEGER,                         -- 1-5, NULL when not rated
  -- approved|changes_requested|comment
  decision     TEXT NOT NULL DEFAULT 'comment',
  status       TEXT NOT NULL DEFAULT 'new',     -- new|acknowledged|resolved
  source       TEXT NOT NULL DEFAULT 'portal',  -- portal|email|meeting|admin
  is_demo      INTEGER NOT NULL DEFAULT 0,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  resolved_at  TEXT
);
CREATE INDEX idx_feedback_project ON feedback(project_id, created_at DESC);

-- ── Expenses & subscriptions ────────────────────────────────────────────
CREATE TABLE expenses (
  id           INTEGER PRIMARY KEY,
  label        TEXT NOT NULL,
  -- software|hosting|advertising|hardware|transport|training|subcontracting|other
  category     TEXT NOT NULL DEFAULT 'other',
  amount       REAL NOT NULL DEFAULT 0,
  currency     TEXT NOT NULL DEFAULT 'DZD',
  spent_at     TEXT NOT NULL DEFAULT (date('now')),
  supplier     TEXT,
  project_id   INTEGER REFERENCES projects(id) ON DELETE SET NULL,
  receipt_file_id INTEGER REFERENCES files(id) ON DELETE SET NULL,
  is_recurring INTEGER NOT NULL DEFAULT 0,
  notes        TEXT,
  is_demo      INTEGER NOT NULL DEFAULT 0,
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_expenses_date ON expenses(spent_at);
CREATE INDEX idx_expenses_category ON expenses(category);

CREATE TABLE subscriptions (
  id            INTEGER PRIMARY KEY,
  service_name  TEXT NOT NULL,
  category      TEXT NOT NULL DEFAULT 'software', -- software|hosting|ai|saas|marketing|other
  amount        REAL NOT NULL DEFAULT 0,
  currency      TEXT NOT NULL DEFAULT 'DZD',
  -- monthly|quarterly|yearly|one_time
  frequency     TEXT NOT NULL DEFAULT 'monthly',
  renewal_date  TEXT,
  status        TEXT NOT NULL DEFAULT 'active',   -- active|paused|cancelled
  auto_renew    INTEGER NOT NULL DEFAULT 1,
  url           TEXT,
  notes         TEXT,
  is_demo       INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_subscriptions_renewal ON subscriptions(renewal_date);
