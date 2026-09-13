import { all, getDb, hasFts, run, transaction } from '../client';
import type { SearchIndexRow } from '../types';
import { stripHtml, truncate } from '@/lib/utils';

/**
 * Global search (Ctrl+K).
 *
 * Writes go through `indexEntity`, which keeps the plain `search_index` table
 * and its FTS5 mirror in step. Reads prefer FTS5 (prefix matching, ranked) and
 * degrade to LIKE when the SQLite build has no FTS5 — the feature still works,
 * just without ranking.
 */

export type SearchEntityType =
  | 'client' | 'project' | 'task' | 'invoice' | 'quote' | 'contract'
  | 'file' | 'message' | 'post' | 'portfolio' | 'case_study'
  | 'lead' | 'service' | 'brief' | 'moodboard' | 'expense' | 'subscription';

/** Ranking weight when relevance ties: people and work above paperwork. */
const WEIGHTS: Record<SearchEntityType, number> = {
  client: 100, project: 95, lead: 85, task: 80, invoice: 75, quote: 70,
  contract: 65, portfolio: 60, case_study: 55, post: 50, service: 45,
  brief: 40, moodboard: 35, file: 30, message: 25, expense: 20, subscription: 15,
};

export const ENTITY_LABELS: Record<SearchEntityType, string> = {
  client: 'Client', project: 'Projet', task: 'Tâche', invoice: 'Facture',
  quote: 'Devis', contract: 'Contrat', file: 'Fichier', message: 'Message',
  post: 'Article', portfolio: 'Portfolio', case_study: 'Étude de cas',
  lead: 'Prospect', service: 'Service', brief: 'Brief', moodboard: 'Moodboard',
  expense: 'Dépense', subscription: 'Abonnement',
};

export type IndexInput = {
  type: SearchEntityType;
  id: number;
  title: string;
  subtitle?: string | null;
  body?: string | null;
  url: string;
  icon?: string | null;
};

export function indexEntity(input: IndexInput): void {
  const body = truncate(stripHtml(input.body ?? ''), 1200);
  const weight = WEIGHTS[input.type] ?? 0;

  transaction((db) => {
    db.prepare(
      `INSERT INTO search_index (entity_type, entity_id, title, subtitle, body, url, icon, weight, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(entity_type, entity_id) DO UPDATE SET
         title = excluded.title, subtitle = excluded.subtitle, body = excluded.body,
         url = excluded.url, icon = excluded.icon, weight = excluded.weight,
         updated_at = datetime('now')`,
    ).run(input.type, input.id, input.title, input.subtitle ?? null, body, input.url, input.icon ?? null, weight);

    if (hasFts(db)) {
      db.prepare('DELETE FROM search_fts WHERE entity_type = ? AND entity_id = ?').run(input.type, input.id);
      db.prepare(
        'INSERT INTO search_fts (title, subtitle, body, entity_type, entity_id) VALUES (?, ?, ?, ?, ?)',
      ).run(input.title, input.subtitle ?? '', body, input.type, input.id);
    }
  });
}

export function removeFromIndex(type: SearchEntityType, id: number): void {
  transaction((db) => {
    db.prepare('DELETE FROM search_index WHERE entity_type = ? AND entity_id = ?').run(type, id);
    if (hasFts(db)) {
      db.prepare('DELETE FROM search_fts WHERE entity_type = ? AND entity_id = ?').run(type, id);
    }
  });
}

export type SearchHit = SearchIndexRow & { type_label: string; snippet: string | null };

/**
 * Escapes an FTS5 query. User input is quoted term-by-term so operators typed
 * by accident (`NEAR`, `*`, `"`) can never produce a syntax error or an
 * unexpectedly broad match; a trailing `*` gives prefix search on the last word.
 */
function ftsQuery(raw: string): string {
  const terms = raw
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(/["']/g, ''))
    .filter((t) => t.length > 0)
    .slice(0, 8);
  if (terms.length === 0) return '';
  return terms.map((t, i) => (i === terms.length - 1 ? `"${t}"*` : `"${t}"`)).join(' AND ');
}

export function search(
  query: string,
  options: { types?: SearchEntityType[]; limit?: number } = {},
): SearchHit[] {
  const term = query.trim();
  if (term.length < 2) return [];
  const limit = Math.min(50, options.limit ?? 20);
  const db = getDb();

  const typeFilter = options.types?.length
    ? `AND si.entity_type IN (${options.types.map(() => '?').join(',')})`
    : '';
  const typeParams = options.types ?? [];

  if (hasFts(db)) {
    const fts = ftsQuery(term);
    if (fts) {
      try {
        const rows = all<SearchIndexRow & { rank: number }>(
          `SELECT si.*, bm25(search_fts, 10.0, 4.0, 1.0) AS rank
           FROM search_fts
           JOIN search_index si
             ON si.entity_type = search_fts.entity_type AND si.entity_id = search_fts.entity_id
           WHERE search_fts MATCH ? ${typeFilter}
           ORDER BY rank ASC, si.weight DESC
           LIMIT ?`,
          [fts, ...typeParams, limit],
        );
        return rows.map(decorate(term));
      } catch {
        // Fall through to LIKE on any FTS syntax edge case.
      }
    }
  }

  const like = `%${term}%`;
  const rows = all<SearchIndexRow>(
    `SELECT si.* FROM search_index si
     WHERE (si.title LIKE ? OR si.subtitle LIKE ? OR si.body LIKE ?) ${typeFilter}
     ORDER BY
       CASE WHEN si.title LIKE ? THEN 0 ELSE 1 END,
       si.weight DESC,
       si.updated_at DESC
     LIMIT ?`,
    [like, like, like, ...typeParams, `${term}%`, limit],
  );
  return rows.map(decorate(term));
}

/** Builds a short excerpt around the first match so hits are scannable. */
function decorate(term: string) {
  const needle = term.toLowerCase();
  return (row: SearchIndexRow): SearchHit => {
    const body = row.body ?? '';
    const at = body.toLowerCase().indexOf(needle);
    const snippet =
      at >= 0 ? truncate(body.slice(Math.max(0, at - 50)), 150) : body ? truncate(body, 120) : null;
    return {
      ...row,
      type_label: ENTITY_LABELS[row.entity_type as SearchEntityType] ?? row.entity_type,
      snippet,
    };
  };
}

/** Counts per entity type, for the search palette's filter chips. */
export function searchFacets(query: string): { type: SearchEntityType; label: string; count: number }[] {
  const term = query.trim();
  if (term.length < 2) return [];
  const like = `%${term}%`;
  const rows = all<{ entity_type: SearchEntityType; c: number }>(
    `SELECT entity_type, COUNT(*) AS c FROM search_index
     WHERE title LIKE ? OR subtitle LIKE ? OR body LIKE ?
     GROUP BY entity_type ORDER BY c DESC`,
    [like, like, like],
  );
  return rows.map((r) => ({
    type: r.entity_type,
    label: ENTITY_LABELS[r.entity_type] ?? r.entity_type,
    count: r.c,
  }));
}

export function clearIndex(): void {
  transaction((db) => {
    db.exec('DELETE FROM search_index');
    if (hasFts(db)) db.exec('DELETE FROM search_fts');
  });
}

export function indexSize(): number {
  const row = all<{ c: number }>('SELECT COUNT(*) AS c FROM search_index')[0];
  return row?.c ?? 0;
}

/**
 * Full rebuild from the source tables. Used by `npm run db:reindex` and after
 * a restore, where the index may be out of date relative to the data.
 */
export function rebuildIndex(): number {
  clearIndex();
  let count = 0;
  const add = (input: IndexInput) => { indexEntity(input); count += 1; };

  for (const r of all<{ id: number; name: string; company: string | null; email: string | null; notes: string | null }>(
    'SELECT id, name, company, email, notes FROM clients',
  )) {
    add({ type: 'client', id: r.id, title: r.name, subtitle: r.company ?? r.email, body: r.notes, url: `/espace-admin/clients/${r.id}` });
  }

  for (const r of all<{ id: number; title: string; reference: string; description: string | null }>(
    'SELECT id, title, reference, description FROM projects',
  )) {
    add({ type: 'project', id: r.id, title: r.title, subtitle: r.reference, body: r.description, url: `/espace-admin/projets/${r.id}` });
  }

  for (const r of all<{ id: number; title: string; description: string | null; project_id: number | null }>(
    'SELECT id, title, description, project_id FROM tasks',
  )) {
    add({ type: 'task', id: r.id, title: r.title, subtitle: null, body: r.description, url: r.project_id ? `/espace-admin/projets/${r.project_id}?tache=${r.id}` : `/espace-admin/taches?tache=${r.id}` });
  }

  for (const r of all<{ id: number; number: string; title: string | null; total: number }>(
    'SELECT id, number, title, total FROM invoices',
  )) {
    add({ type: 'invoice', id: r.id, title: r.number, subtitle: r.title, body: null, url: `/espace-admin/factures/${r.id}` });
  }

  for (const r of all<{ id: number; number: string; title: string | null }>('SELECT id, number, title FROM quotes')) {
    add({ type: 'quote', id: r.id, title: r.number, subtitle: r.title, body: null, url: `/espace-admin/devis/${r.id}` });
  }

  for (const r of all<{ id: number; number: string; title: string }>('SELECT id, number, title FROM contracts')) {
    add({ type: 'contract', id: r.id, title: r.number, subtitle: r.title, body: null, url: `/espace-admin/contrats/${r.id}` });
  }

  for (const r of all<{ id: number; name: string; company: string | null; message: string | null }>(
    'SELECT id, name, company, message FROM leads',
  )) {
    add({ type: 'lead', id: r.id, title: r.name, subtitle: r.company, body: r.message, url: `/espace-admin/prospects/${r.id}` });
  }

  for (const r of all<{ id: number; title: string; excerpt: string | null; content: string | null }>(
    'SELECT id, title, excerpt, content FROM blog_posts',
  )) {
    add({ type: 'post', id: r.id, title: r.title, subtitle: r.excerpt, body: r.content, url: `/espace-admin/blog/${r.id}` });
  }

  for (const r of all<{ id: number; title: string; summary: string | null; description: string | null }>(
    'SELECT id, title, summary, description FROM portfolio_projects',
  )) {
    add({ type: 'portfolio', id: r.id, title: r.title, subtitle: r.summary, body: r.description, url: `/espace-admin/portfolio/${r.id}` });
  }

  for (const r of all<{ id: number; title: string; subtitle: string | null; problem: string | null }>(
    'SELECT id, title, subtitle, problem FROM case_studies',
  )) {
    add({ type: 'case_study', id: r.id, title: r.title, subtitle: r.subtitle, body: r.problem, url: `/espace-admin/etudes-de-cas/${r.id}` });
  }

  for (const r of all<{ id: number; name: string; short_description: string | null }>(
    'SELECT id, name, short_description FROM services',
  )) {
    add({ type: 'service', id: r.id, title: r.name, subtitle: r.short_description, body: null, url: `/espace-admin/services/${r.id}` });
  }

  for (const r of all<{ id: number; original_name: string; project_id: number | null }>(
    'SELECT id, original_name, project_id FROM files',
  )) {
    add({ type: 'file', id: r.id, title: r.original_name, subtitle: null, body: null, url: `/espace-admin/fichiers?fichier=${r.id}` });
  }

  for (const r of all<{ id: number; subject: string | null; to_name: string | null; body: string | null }>(
    'SELECT id, subject, to_name, body FROM messages',
  )) {
    add({ type: 'message', id: r.id, title: r.subject ?? '(sans objet)', subtitle: r.to_name, body: r.body, url: `/espace-admin/messages/${r.id}` });
  }

  for (const r of all<{ id: number; title: string; status: string }>('SELECT id, title, status FROM briefs')) {
    add({ type: 'brief', id: r.id, title: r.title, subtitle: r.status, body: null, url: `/espace-admin/briefs/${r.id}` });
  }

  for (const r of all<{ id: number; title: string; description: string | null }>(
    'SELECT id, title, description FROM moodboards',
  )) {
    add({ type: 'moodboard', id: r.id, title: r.title, subtitle: null, body: r.description, url: `/espace-admin/moodboards/${r.id}` });
  }

  return count;
}

/** Removes index rows whose source record no longer exists. */
export function pruneIndex(): number {
  const tables: Record<SearchEntityType, string> = {
    client: 'clients', project: 'projects', task: 'tasks', invoice: 'invoices',
    quote: 'quotes', contract: 'contracts', file: 'files', message: 'messages',
    post: 'blog_posts', portfolio: 'portfolio_projects', case_study: 'case_studies',
    lead: 'leads', service: 'services', brief: 'briefs', moodboard: 'moodboards',
    expense: 'expenses', subscription: 'subscriptions',
  };
  let removed = 0;
  for (const [type, table] of Object.entries(tables)) {
    const result = run(
      `DELETE FROM search_index
       WHERE entity_type = ? AND entity_id NOT IN (SELECT id FROM ${table})`,
      [type],
    );
    removed += result.changes;
  }
  return removed;
}
