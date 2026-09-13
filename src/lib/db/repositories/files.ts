import { all, one, run, scalar, transaction } from '../client';
import type { FileFolderRow, FileKind, FileRow, FolderTemplateItemRow, FolderTemplateRow } from '../types';
import { indexEntity, removeFromIndex } from './search';

/**
 * File library.
 *
 * Folders carry a materialised `path` ("/Client/Projet/01-Documents") so listing
 * or moving a whole subtree is one indexed LIKE query instead of a recursive
 * walk. On disk, files are stored under a randomised `stored_name` — the user's
 * original filename is metadata only and never touches the filesystem, which
 * removes path traversal and executable-extension risks in one stroke.
 */

/** Default structure created for every new project. */
export const DEFAULT_FOLDER_TEMPLATE = [
  '01-Documents', '02-Design', '03-Photos', '04-Videos', '05-Livrables', '06-Factures',
];

/** Richer production structure, selectable per project. */
export const PRODUCTION_FOLDER_TEMPLATE = [
  '01-Documents', '02-Design', '03-Assets', '04-Production', '05-Exports', '06-Livrables', '07-Archives',
];

export function classifyFile(mimeType: string, extension: string | null): FileKind {
  const ext = (extension ?? '').toLowerCase();
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (['zip', 'rar', '7z', 'tar', 'gz'].includes(ext)) return 'archive';
  if (
    mimeType.startsWith('text/') ||
    mimeType === 'application/pdf' ||
    ['doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'csv', 'md', 'txt'].includes(ext)
  ) {
    return 'document';
  }
  return 'other';
}

// ── Folders ──────────────────────────────────────────────────────────────

export function findFolder(id: number): FileFolderRow | null {
  return one<FileFolderRow>('SELECT * FROM file_folders WHERE id = ?', [id]);
}

export function listFolders(filter: { projectId?: number; clientId?: number; parentId?: number | null } = {}): (FileFolderRow & { file_count: number; child_count: number })[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.projectId !== undefined) { where.push('f.project_id = ?'); params.push(filter.projectId); }
  if (filter.clientId !== undefined) { where.push('f.client_id = ?'); params.push(filter.clientId); }
  if (filter.parentId === null) where.push('f.parent_id IS NULL');
  else if (filter.parentId !== undefined) { where.push('f.parent_id = ?'); params.push(filter.parentId); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return all(
    `SELECT f.*,
       (SELECT COUNT(*) FROM files x WHERE x.folder_id = f.id) AS file_count,
       (SELECT COUNT(*) FROM file_folders c WHERE c.parent_id = f.id) AS child_count
     FROM file_folders f ${clause} ORDER BY f.position, f.name`,
    params,
  );
}

/** Whole subtree under a folder, by path prefix. */
export function folderSubtree(folderId: number): FileFolderRow[] {
  const folder = findFolder(folderId);
  if (!folder) return [];
  return all<FileFolderRow>(
    'SELECT * FROM file_folders WHERE path = ? OR path LIKE ? ORDER BY path',
    [folder.path, `${folder.path}/%`],
  );
}

export function createFolder(input: {
  name: string;
  parentId?: number | null;
  clientId?: number | null;
  projectId?: number | null;
  position?: number;
  isSystem?: boolean;
}): number {
  const parent = input.parentId ? findFolder(input.parentId) : null;
  // Slashes in a folder name would corrupt the materialised path.
  const safeName = input.name.replace(/[/\\]/g, '-').trim() || 'Dossier';
  const path = `${parent?.path ?? ''}/${safeName}`;
  const position = input.position ?? scalar<number>(
    `SELECT COALESCE(MAX(position), -1) + 1 AS p FROM file_folders
     WHERE parent_id IS ? AND project_id IS ?`,
    [input.parentId ?? null, input.projectId ?? null], 0,
  );

  const result = run(
    `INSERT INTO file_folders (parent_id, client_id, project_id, name, path, position, is_system)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      input.parentId ?? null, input.clientId ?? parent?.client_id ?? null,
      input.projectId ?? parent?.project_id ?? null, safeName, path, position,
      input.isSystem ? 1 : 0,
    ],
  );
  return Number(result.lastInsertRowid);
}

/** Renames a folder and rewrites the path of every descendant. */
export function renameFolder(id: number, name: string): void {
  const folder = findFolder(id);
  if (!folder) return;
  const safeName = name.replace(/[/\\]/g, '-').trim();
  if (!safeName) return;
  const parentPath = folder.path.slice(0, folder.path.lastIndexOf('/'));
  const newPath = `${parentPath}/${safeName}`;

  transaction(() => {
    run('UPDATE file_folders SET name = ?, path = ? WHERE id = ?', [safeName, newPath, id]);
    run(
      `UPDATE file_folders SET path = ? || substr(path, ?) WHERE path LIKE ?`,
      [newPath, folder.path.length + 1, `${folder.path}/%`],
    );
  });
}

export function deleteFolder(id: number): void {
  run('DELETE FROM file_folders WHERE id = ?', [id]);
}

/**
 * Materialises a folder template for a project. Idempotent: a folder that
 * already exists at the target path is left alone, so re-running never
 * duplicates the tree.
 */
export function applyFolderTemplate(input: {
  projectId: number;
  clientId?: number | null;
  rootName: string;
  names?: string[];
  templateId?: number;
}): number {
  return transaction(() => {
    const names = input.templateId
      ? listFolderTemplateItems(input.templateId).map((i) => i.name)
      : (input.names ?? DEFAULT_FOLDER_TEMPLATE);

    const existingRoot = one<FileFolderRow>(
      'SELECT * FROM file_folders WHERE project_id = ? AND parent_id IS NULL LIMIT 1',
      [input.projectId],
    );
    const rootId = existingRoot?.id ?? createFolder({
      name: input.rootName,
      clientId: input.clientId ?? null,
      projectId: input.projectId,
      isSystem: true,
    });

    const existing = new Set(
      all<{ name: string }>('SELECT name FROM file_folders WHERE parent_id = ?', [rootId]).map((r) => r.name),
    );

    let created = 0;
    names.forEach((name, index) => {
      if (existing.has(name)) return;
      createFolder({
        name,
        parentId: rootId,
        clientId: input.clientId ?? null,
        projectId: input.projectId,
        position: index,
        isSystem: true,
      });
      created += 1;
    });
    return created;
  });
}

// ── Folder templates ─────────────────────────────────────────────────────

export function listFolderTemplates(): (FolderTemplateRow & { item_count: number })[] {
  return all(
    `SELECT t.*, (SELECT COUNT(*) FROM folder_template_items i WHERE i.template_id = t.id) AS item_count
     FROM folder_templates t ORDER BY t.is_default DESC, t.name`,
  );
}

export function findFolderTemplate(id: number): FolderTemplateRow | null {
  return one<FolderTemplateRow>('SELECT * FROM folder_templates WHERE id = ?', [id]);
}

export function defaultFolderTemplate(): FolderTemplateRow | null {
  return (
    one<FolderTemplateRow>('SELECT * FROM folder_templates WHERE is_default = 1 LIMIT 1') ??
    one<FolderTemplateRow>('SELECT * FROM folder_templates ORDER BY id LIMIT 1')
  );
}

export function listFolderTemplateItems(templateId: number): FolderTemplateItemRow[] {
  return all<FolderTemplateItemRow>(
    'SELECT * FROM folder_template_items WHERE template_id = ? ORDER BY position, id',
    [templateId],
  );
}

export function upsertFolderTemplate(input: {
  id?: number; name: string; description?: string | null; isDefault?: boolean; items: string[];
}): number {
  return transaction(() => {
    let id = input.id;
    if (id) {
      run(
        'UPDATE folder_templates SET name = ?, description = ?, is_default = ? WHERE id = ?',
        [input.name, input.description ?? null, input.isDefault ? 1 : 0, id],
      );
    } else {
      const result = run(
        'INSERT INTO folder_templates (name, description, is_default) VALUES (?, ?, ?)',
        [input.name, input.description ?? null, input.isDefault ? 1 : 0],
      );
      id = Number(result.lastInsertRowid);
    }
    run('DELETE FROM folder_template_items WHERE template_id = ?', [id]);
    input.items.forEach((name, index) => {
      run(
        'INSERT INTO folder_template_items (template_id, name, position) VALUES (?, ?, ?)',
        [id, name.trim(), index],
      );
    });
    if (input.isDefault) run('UPDATE folder_templates SET is_default = 0 WHERE id != ?', [id]);
    return id;
  });
}

export function deleteFolderTemplate(id: number): void {
  run('DELETE FROM folder_templates WHERE id = ?', [id]);
}

// ── Files ────────────────────────────────────────────────────────────────

export function findFile(id: number): FileRow | null {
  return one<FileRow>('SELECT * FROM files WHERE id = ?', [id]);
}

export function findFileByStoredName(storedName: string): FileRow | null {
  return one<FileRow>('SELECT * FROM files WHERE stored_name = ?', [storedName]);
}

export type FileFilter = {
  folderId?: number | null;
  projectId?: number;
  clientId?: number;
  entityType?: string;
  entityId?: number;
  kind?: FileKind;
  search?: string;
  clientVisibleOnly?: boolean;
  limit?: number;
  offset?: number;
};

export function listFiles(filter: FileFilter = {}): FileRow[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.folderId === null) where.push('folder_id IS NULL');
  else if (filter.folderId !== undefined) { where.push('folder_id = ?'); params.push(filter.folderId); }
  if (filter.projectId) { where.push('project_id = ?'); params.push(filter.projectId); }
  if (filter.clientId) { where.push('client_id = ?'); params.push(filter.clientId); }
  if (filter.entityType) { where.push('entity_type = ?'); params.push(filter.entityType); }
  if (filter.entityId) { where.push('entity_id = ?'); params.push(filter.entityId); }
  if (filter.kind) { where.push('kind = ?'); params.push(filter.kind); }
  if (filter.clientVisibleOnly) where.push('is_client_visible = 1');
  if (filter.search) { where.push('original_name LIKE ?'); params.push(`%${filter.search}%`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(filter.limit ?? 200, filter.offset ?? 0);
  return all<FileRow>(
    `SELECT * FROM files ${clause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
    params,
  );
}

export function countFiles(filter: FileFilter = {}): number {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.projectId) { where.push('project_id = ?'); params.push(filter.projectId); }
  if (filter.kind) { where.push('kind = ?'); params.push(filter.kind); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  return scalar<number>(`SELECT COUNT(*) AS c FROM files ${clause}`, params, 0);
}

export function totalStorageBytes(): number {
  return scalar<number>('SELECT COALESCE(SUM(size_bytes), 0) AS s FROM files', [], 0);
}

export type FileInput = {
  folderId?: number | null;
  clientId?: number | null;
  projectId?: number | null;
  entityType?: string | null;
  entityId?: number | null;
  originalName: string;
  storedName: string;
  mimeType: string;
  extension?: string | null;
  sizeBytes: number;
  checksum?: string | null;
  width?: number | null;
  height?: number | null;
  caption?: string | null;
  isClientVisible?: boolean;
  isDemo?: boolean;
  uploadedBy?: number | null;
};

export function createFile(input: FileInput): number {
  const kind = classifyFile(input.mimeType, input.extension ?? null);
  const result = run(
    `INSERT INTO files
      (folder_id, client_id, project_id, entity_type, entity_id, original_name, stored_name,
       mime_type, extension, size_bytes, checksum, kind, width, height, caption,
       is_client_visible, is_demo, uploaded_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      input.folderId ?? null, input.clientId ?? null, input.projectId ?? null,
      input.entityType ?? null, input.entityId ?? null, input.originalName, input.storedName,
      input.mimeType, input.extension ?? null, input.sizeBytes, input.checksum ?? null, kind,
      input.width ?? null, input.height ?? null, input.caption ?? null,
      input.isClientVisible ? 1 : 0, input.isDemo ? 1 : 0, input.uploadedBy ?? null,
    ],
  );
  const id = Number(result.lastInsertRowid);
  indexEntity({
    type: 'file', id, title: input.originalName, subtitle: kind, body: input.caption,
    url: `/espace-admin/fichiers?fichier=${id}`,
  });
  return id;
}

export function updateFile(
  id: number,
  patch: { original_name?: string; caption?: string | null; folder_id?: number | null; is_client_visible?: boolean },
): void {
  const map: Record<string, unknown> = {
    original_name: patch.original_name, caption: patch.caption, folder_id: patch.folder_id,
  };
  if (patch.is_client_visible !== undefined) map.is_client_visible = patch.is_client_visible ? 1 : 0;
  const fields: string[] = [];
  const params: unknown[] = [];
  for (const [key, value] of Object.entries(map)) {
    if (value === undefined) continue;
    fields.push(`${key} = ?`);
    params.push(value);
  }
  if (fields.length === 0) return;
  params.push(id);
  run(`UPDATE files SET ${fields.join(', ')} WHERE id = ?`, params);

  const file = findFile(id);
  if (file) {
    indexEntity({
      type: 'file', id, title: file.original_name, subtitle: file.kind, body: file.caption,
      url: `/espace-admin/fichiers?fichier=${id}`,
    });
  }
}

/** Removes the row; the caller unlinks the blob (see lib/storage.ts). */
export function deleteFileRecord(id: number): FileRow | null {
  const file = findFile(id);
  if (!file) return null;
  run('DELETE FROM files WHERE id = ?', [id]);
  removeFromIndex('file', id);
  return file;
}

/** Breadcrumb trail for a folder, root first. */
export function folderBreadcrumb(folderId: number): FileFolderRow[] {
  const trail: FileFolderRow[] = [];
  let current = findFolder(folderId);
  let guard = 0;
  while (current && guard < 20) {
    trail.unshift(current);
    current = current.parent_id ? findFolder(current.parent_id) : null;
    guard += 1;
  }
  return trail;
}

/** Storage used per file kind, for the library header. */
export function storageByKind(): { kind: FileKind; count: number; bytes: number }[] {
  return all<{ kind: FileKind; count: number; bytes: number }>(
    `SELECT kind, COUNT(*) AS count, COALESCE(SUM(size_bytes), 0) AS bytes
     FROM files GROUP BY kind ORDER BY bytes DESC`,
  );
}
