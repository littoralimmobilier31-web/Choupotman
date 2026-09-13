import { all, one, run, scalar, transaction } from '../client';
import type { MoodboardItemRow, MoodboardRow } from '../types';
import { indexEntity, removeFromIndex } from './search';
import { generateToken, hashToken } from '@/lib/auth/password';
import { slugify } from '@/lib/utils';

/**
 * Moodboards — a free canvas of images, notes, colours and links.
 *
 * `capture tokens` exist so an image can be pushed onto a board from outside the
 * app (a browser extension, a share sheet) without a session: the token is
 * stored hashed, is scoped to exactly one board, and can be revoked. That is the
 * architecture the "send an image to my moodboard from the browser" requirement
 * needs, without granting anything more than "append one item to this board".
 */

export type MoodboardWithMeta = MoodboardRow & {
  project_title: string | null;
  client_name: string | null;
  item_count: number;
  cover_url: string | null;
};

const MOODBOARD_SELECT = `
  SELECT m.*, p.title AS project_title, c.name AS client_name,
    (SELECT COUNT(*) FROM moodboard_items i WHERE i.moodboard_id = m.id) AS item_count,
    (SELECT COALESCE(i.url, '/api/fichiers/' || i.file_id) FROM moodboard_items i
      WHERE i.moodboard_id = m.id AND i.kind = 'image'
      ORDER BY i.z_index, i.id LIMIT 1) AS cover_url
  FROM moodboards m
  LEFT JOIN projects p ON p.id = m.project_id
  LEFT JOIN clients c ON c.id = m.client_id
`;

export function findMoodboard(id: number): MoodboardWithMeta | null {
  return one<MoodboardWithMeta>(`${MOODBOARD_SELECT} WHERE m.id = ?`, [id]);
}

export function findMoodboardByShareToken(token: string): MoodboardWithMeta | null {
  return one<MoodboardWithMeta>(`${MOODBOARD_SELECT} WHERE m.share_token = ?`, [token]);
}

export function listMoodboards(filter: { projectId?: number; clientId?: number; limit?: number } = {}): MoodboardWithMeta[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.projectId) { where.push('m.project_id = ?'); params.push(filter.projectId); }
  if (filter.clientId) { where.push('m.client_id = ?'); params.push(filter.clientId); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(filter.limit ?? 100);
  return all<MoodboardWithMeta>(
    `${MOODBOARD_SELECT} ${clause} ORDER BY m.updated_at DESC LIMIT ?`,
    params,
  );
}

export function createMoodboard(input: {
  title: string;
  projectId?: number | null;
  clientId?: number | null;
  description?: string | null;
  background?: string | null;
  isDemo?: boolean;
  createdBy?: number | null;
}): number {
  const base = slugify(input.title) || 'moodboard';
  let slug = base;
  let n = 2;
  while (scalar<number>('SELECT COUNT(*) AS c FROM moodboards WHERE slug = ?', [slug], 0) > 0) {
    slug = `${base}-${n}`;
    n += 1;
  }
  const result = run(
    `INSERT INTO moodboards (title, slug, project_id, client_id, description, background, is_demo, created_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.title, slug, input.projectId ?? null, input.clientId ?? null,
      input.description ?? null, input.background ?? null, input.isDemo ? 1 : 0,
      input.createdBy ?? null,
    ],
  );
  const id = Number(result.lastInsertRowid);
  indexEntity({
    type: 'moodboard', id, title: input.title, subtitle: 'Moodboard',
    body: input.description, url: `/espace-admin/moodboards/${id}`,
  });
  return id;
}

export function updateMoodboard(
  id: number,
  patch: { title?: string; description?: string | null; background?: string | null; projectId?: number | null; clientId?: number | null },
): void {
  const map: Record<string, unknown> = {
    title: patch.title, description: patch.description, background: patch.background,
    project_id: patch.projectId, client_id: patch.clientId,
  };
  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(value);
  }
  if (fields.length === 0) return;
  params.push(id);
  run(`UPDATE moodboards SET ${fields.join(', ')}, updated_at = datetime('now') WHERE id = ?`, params);
}

export function deleteMoodboard(id: number): void {
  run('DELETE FROM moodboards WHERE id = ?', [id]);
  removeFromIndex('moodboard', id);
}

/** Creates or rotates the read-only public share link. */
export function setMoodboardShare(id: number, enabled: boolean): string | null {
  if (!enabled) {
    run('UPDATE moodboards SET share_token = NULL WHERE id = ?', [id]);
    return null;
  }
  const token = generateToken(18);
  run(`UPDATE moodboards SET share_token = ?, updated_at = datetime('now') WHERE id = ?`, [token, id]);
  return token;
}

// ── Items ────────────────────────────────────────────────────────────────

export function listMoodboardItems(moodboardId: number): MoodboardItemRow[] {
  return all<MoodboardItemRow>(
    'SELECT * FROM moodboard_items WHERE moodboard_id = ? ORDER BY z_index, id',
    [moodboardId],
  );
}

export function addMoodboardItem(input: {
  moodboardId: number;
  kind?: MoodboardItemRow['kind'];
  fileId?: number | null;
  url?: string | null;
  sourceUrl?: string | null;
  content?: string | null;
  color?: string | null;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  notes?: string | null;
}): number {
  return transaction(() => {
    const zIndex = scalar<number>(
      'SELECT COALESCE(MAX(z_index), 0) + 1 AS z FROM moodboard_items WHERE moodboard_id = ?',
      [input.moodboardId], 1,
    );
    // New items land on a loose grid so a burst of captures doesn't stack.
    const index = scalar<number>(
      'SELECT COUNT(*) AS c FROM moodboard_items WHERE moodboard_id = ?',
      [input.moodboardId], 0,
    );
    const x = input.x ?? 40 + (index % 4) * 250;
    const y = input.y ?? 40 + Math.floor(index / 4) * 200;

    const result = run(
      `INSERT INTO moodboard_items
        (moodboard_id, kind, file_id, url, source_url, content, color, x, y, width, height, z_index, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.moodboardId, input.kind ?? 'image', input.fileId ?? null, input.url ?? null,
        input.sourceUrl ?? null, input.content ?? null, input.color ?? null,
        x, y, input.width ?? 220, input.height ?? 160, zIndex, input.notes ?? null,
      ],
    );
    run(`UPDATE moodboards SET updated_at = datetime('now') WHERE id = ?`, [input.moodboardId]);
    return Number(result.lastInsertRowid);
  });
}

export function updateMoodboardItem(
  id: number,
  patch: {
    x?: number; y?: number; width?: number; height?: number; rotation?: number;
    z_index?: number; content?: string | null; color?: string | null; notes?: string | null; url?: string | null;
  },
): void {
  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(value);
  }
  if (fields.length === 0) return;
  params.push(id);
  run(`UPDATE moodboard_items SET ${fields.join(', ')} WHERE id = ?`, params);
}

/** Batch position save after a drag session — one transaction, one round-trip. */
export function saveMoodboardLayout(
  moodboardId: number,
  items: { id: number; x: number; y: number; width?: number; height?: number; z_index?: number }[],
): void {
  transaction(() => {
    for (const item of items) {
      run(
        `UPDATE moodboard_items
         SET x = ?, y = ?, width = COALESCE(?, width), height = COALESCE(?, height),
             z_index = COALESCE(?, z_index)
         WHERE id = ? AND moodboard_id = ?`,
        [item.x, item.y, item.width ?? null, item.height ?? null, item.z_index ?? null, item.id, moodboardId],
      );
    }
    run(`UPDATE moodboards SET updated_at = datetime('now') WHERE id = ?`, [moodboardId]);
  });
}

export function deleteMoodboardItem(id: number): void {
  run('DELETE FROM moodboard_items WHERE id = ?', [id]);
}

// ── Capture tokens (browser-extension hook) ──────────────────────────────

export type CaptureToken = {
  id: number;
  moodboard_id: number;
  label: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
};

/** Returns the raw token exactly once — only its hash is stored. */
export function createCaptureToken(input: {
  moodboardId: number;
  label?: string | null;
  expiresInDays?: number | null;
  createdBy?: number | null;
}): { token: string; id: number } {
  const token = generateToken(24);
  const expiresAt = input.expiresInDays
    ? new Date(Date.now() + input.expiresInDays * 86400000).toISOString()
    : null;
  const result = run(
    `INSERT INTO moodboard_capture_tokens (moodboard_id, token_hash, label, created_by, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [input.moodboardId, hashToken(token), input.label ?? null, input.createdBy ?? null, expiresAt],
  );
  return { token, id: Number(result.lastInsertRowid) };
}

export function listCaptureTokens(moodboardId: number): CaptureToken[] {
  return all<CaptureToken>(
    `SELECT id, moodboard_id, label, expires_at, revoked_at, last_used_at, created_at
     FROM moodboard_capture_tokens WHERE moodboard_id = ? ORDER BY created_at DESC`,
    [moodboardId],
  );
}

/** Resolves a capture token to its board, or null when invalid/expired/revoked. */
export function resolveCaptureToken(token: string): { id: number; moodboardId: number } | null {
  const row = one<{ id: number; moodboard_id: number }>(
    `SELECT id, moodboard_id FROM moodboard_capture_tokens
     WHERE token_hash = ? AND revoked_at IS NULL AND (expires_at IS NULL OR expires_at > ?)`,
    [hashToken(token), new Date().toISOString()],
  );
  if (!row) return null;
  run(`UPDATE moodboard_capture_tokens SET last_used_at = datetime('now') WHERE id = ?`, [row.id]);
  return { id: row.id, moodboardId: row.moodboard_id };
}

export function revokeCaptureToken(id: number): void {
  run(`UPDATE moodboard_capture_tokens SET revoked_at = datetime('now') WHERE id = ?`, [id]);
}
