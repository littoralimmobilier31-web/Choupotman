-- ═══════════════════════════════════════════════════════════════════════
-- 005 — Global search (Ctrl+K)
-- ═══════════════════════════════════════════════════════════════════════
--
-- Rather than fanning a query across a dozen tables with LIKE, every
-- searchable record is projected into one denormalised row. Repositories call
-- indexEntity()/removeFromIndex() on write; `npm run db:reindex` rebuilds from
-- scratch. The FTS5 mirror gives prefix matching and ranking; the plain table
-- remains the source of truth and keeps the app working even on a SQLite build
-- compiled without FTS5.

CREATE TABLE search_index (
  entity_type TEXT NOT NULL,
  entity_id   INTEGER NOT NULL,
  title       TEXT NOT NULL,
  subtitle    TEXT,
  body        TEXT,
  url         TEXT NOT NULL,
  icon        TEXT,
  -- Higher wins when relevance ties (clients/projects above log entries).
  weight      INTEGER NOT NULL DEFAULT 0,
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (entity_type, entity_id)
);
CREATE INDEX idx_search_title ON search_index(title);
CREATE INDEX idx_search_type ON search_index(entity_type);

CREATE VIRTUAL TABLE search_fts USING fts5(
  title,
  subtitle,
  body,
  entity_type UNINDEXED,
  entity_id UNINDEXED,
  tokenize = "unicode61 remove_diacritics 2"
);
