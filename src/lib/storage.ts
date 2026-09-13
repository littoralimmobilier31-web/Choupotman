// Server-only by construction: this module imports Node built-ins / native
// bindings, which the bundler refuses in a client component. The `server-only`
// guard is deliberately NOT used here so the CLI scripts in scripts/ can
// import it directly (that package throws outside the Next bundler).
import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { extname, join, resolve, sep } from 'node:path';
import { config } from '@/lib/config';

/**
 * File storage.
 *
 * Uploads are the highest-risk surface in the app, so the rules here are strict
 * and centralised:
 *
 *   • the on-disk name is random — the user's filename is metadata only, which
 *     removes path traversal and "shell.php" style problems by construction;
 *   • the extension must be on an allow-list AND agree with the declared MIME
 *     type, so a renamed executable is rejected rather than merely mislabelled;
 *   • every resolved path is verified to stay inside the upload directory before
 *     any read or write;
 *   • files are served through an authenticated route with
 *     `Content-Disposition: attachment`, never from a public static folder.
 */

export type AllowedKind = 'image' | 'video' | 'document' | 'archive';

/** extension → { mime prefixes accepted, kind }. Anything absent is refused. */
const ALLOWED: Record<string, { mimes: string[]; kind: AllowedKind }> = {
  // Images
  '.jpg': { mimes: ['image/jpeg'], kind: 'image' },
  '.jpeg': { mimes: ['image/jpeg'], kind: 'image' },
  '.png': { mimes: ['image/png'], kind: 'image' },
  '.webp': { mimes: ['image/webp'], kind: 'image' },
  '.avif': { mimes: ['image/avif'], kind: 'image' },
  '.gif': { mimes: ['image/gif'], kind: 'image' },
  // SVG is deliberately NOT allowed: it can carry script and would execute in
  // the browser's origin when previewed.

  // Documents
  '.pdf': { mimes: ['application/pdf'], kind: 'document' },
  '.txt': { mimes: ['text/plain'], kind: 'document' },
  '.md': { mimes: ['text/plain', 'text/markdown'], kind: 'document' },
  '.csv': { mimes: ['text/csv', 'text/plain', 'application/vnd.ms-excel'], kind: 'document' },
  '.doc': { mimes: ['application/msword'], kind: 'document' },
  '.docx': { mimes: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'], kind: 'document' },
  '.xls': { mimes: ['application/vnd.ms-excel'], kind: 'document' },
  '.xlsx': { mimes: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'], kind: 'document' },
  '.ppt': { mimes: ['application/vnd.ms-powerpoint'], kind: 'document' },
  '.pptx': { mimes: ['application/vnd.openxmlformats-officedocument.presentationml.presentation'], kind: 'document' },
  '.odt': { mimes: ['application/vnd.oasis.opendocument.text'], kind: 'document' },
  '.ods': { mimes: ['application/vnd.oasis.opendocument.spreadsheet'], kind: 'document' },

  // Media
  '.mp4': { mimes: ['video/mp4'], kind: 'video' },
  '.webm': { mimes: ['video/webm'], kind: 'video' },
  '.mov': { mimes: ['video/quicktime'], kind: 'video' },
  '.mp3': { mimes: ['audio/mpeg'], kind: 'video' },
  '.wav': { mimes: ['audio/wav', 'audio/x-wav'], kind: 'video' },

  // Archives
  '.zip': { mimes: ['application/zip', 'application/x-zip-compressed'], kind: 'archive' },
  '.rar': { mimes: ['application/vnd.rar', 'application/x-rar-compressed'], kind: 'archive' },
  '.7z': { mimes: ['application/x-7z-compressed'], kind: 'archive' },
};

/** Magic-byte signatures for the formats where a cheap check is meaningful. */
const SIGNATURES: { ext: string[]; bytes: number[]; offset?: number }[] = [
  { ext: ['.png'], bytes: [0x89, 0x50, 0x4e, 0x47] },
  { ext: ['.jpg', '.jpeg'], bytes: [0xff, 0xd8, 0xff] },
  { ext: ['.gif'], bytes: [0x47, 0x49, 0x46, 0x38] },
  { ext: ['.pdf'], bytes: [0x25, 0x50, 0x44, 0x46] },
  { ext: ['.zip', '.docx', '.xlsx', '.pptx', '.odt', '.ods'], bytes: [0x50, 0x4b, 0x03, 0x04] },
  { ext: ['.webp'], bytes: [0x52, 0x49, 0x46, 0x46] },
  { ext: ['.rar'], bytes: [0x52, 0x61, 0x72, 0x21] },
  { ext: ['.7z'], bytes: [0x37, 0x7a, 0xbc, 0xaf] },
];

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadError';
  }
}

function uploadRoot(): string {
  return resolve(process.cwd(), config.storage.uploadDir);
}

/** Refuses any path that escapes the upload root, however it was constructed. */
function assertInsideRoot(candidate: string): string {
  const root = uploadRoot();
  const resolved = resolve(candidate);
  if (resolved !== root && !resolved.startsWith(root + sep)) {
    throw new UploadError('Chemin de fichier refusé.');
  }
  return resolved;
}

/** `2026/09/ab12cd…ef.png` — dated folders keep directories small. */
function buildStoredName(extension: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}/${month}/${randomBytes(20).toString('hex')}${extension}`;
}

export type StoredFile = {
  storedName: string;
  originalName: string;
  mimeType: string;
  extension: string;
  kind: AllowedKind;
  sizeBytes: number;
  checksum: string;
};

export type SaveOptions = {
  /** Restrict to a subset of kinds, e.g. only images for a moodboard capture. */
  allowedKinds?: AllowedKind[];
  maxBytes?: number;
};

/**
 * Validates and writes an uploaded file. Throws `UploadError` with a
 * user-presentable message on any rejection.
 */
export async function saveUpload(file: File, options: SaveOptions = {}): Promise<StoredFile> {
  const maxBytes = options.maxBytes ?? config.storage.maxUploadBytes;

  if (!file || typeof file.arrayBuffer !== 'function') {
    throw new UploadError('Aucun fichier reçu.');
  }
  if (file.size === 0) throw new UploadError('Le fichier est vide.');
  if (file.size > maxBytes) {
    throw new UploadError(`Fichier trop volumineux (maximum ${Math.floor(maxBytes / (1024 * 1024))} Mo).`);
  }

  const originalName = (file.name || 'fichier').slice(-200);
  const extension = extname(originalName).toLowerCase();
  const rule = ALLOWED[extension];

  if (!rule) {
    throw new UploadError(`Type de fichier non autorisé (${extension || 'sans extension'}).`);
  }

  // The declared MIME type must match the extension. Browsers sometimes send an
  // empty type, which is tolerated — the magic-byte check below still applies.
  const declaredMime = (file.type || '').toLowerCase();
  if (declaredMime && !rule.mimes.includes(declaredMime)) {
    throw new UploadError('L’extension du fichier ne correspond pas à son contenu déclaré.');
  }

  if (options.allowedKinds && !options.allowedKinds.includes(rule.kind)) {
    throw new UploadError('Ce type de fichier n’est pas accepté ici.');
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  // Magic bytes, where we have a signature for the format.
  const signature = SIGNATURES.find((entry) => entry.ext.includes(extension));
  if (signature) {
    const offset = signature.offset ?? 0;
    const matches = signature.bytes.every((byte, index) => buffer[offset + index] === byte);
    if (!matches) {
      throw new UploadError('Le contenu du fichier ne correspond pas à son extension.');
    }
  }

  const storedName = buildStoredName(extension);
  const target = assertInsideRoot(join(uploadRoot(), storedName));

  await mkdir(resolve(target, '..'), { recursive: true });
  await writeFile(target, buffer, { mode: 0o640 });

  return {
    storedName,
    originalName,
    mimeType: declaredMime || rule.mimes[0] || 'application/octet-stream',
    extension,
    kind: rule.kind,
    sizeBytes: buffer.byteLength,
    checksum: createHash('sha256').update(buffer).digest('hex'),
  };
}

/** Absolute path for a stored file, validated to stay inside the upload root. */
export function resolveStoredPath(storedName: string): string {
  return assertInsideRoot(join(uploadRoot(), storedName));
}

export async function readStoredFile(storedName: string): Promise<Buffer> {
  const path = resolveStoredPath(storedName);
  const { readFile } = await import('node:fs/promises');
  return readFile(path);
}

/** Node stream for a stored file, for streaming large downloads. */
export function streamStoredFile(storedName: string): ReturnType<typeof createReadStream> {
  return createReadStream(resolveStoredPath(storedName));
}

export async function storedFileExists(storedName: string): Promise<boolean> {
  try {
    const info = await stat(resolveStoredPath(storedName));
    return info.isFile();
  } catch {
    return false;
  }
}

/** Deletes a stored blob. A missing file is not an error — the row is gone too. */
export async function deleteStoredFile(storedName: string): Promise<void> {
  try {
    await rm(resolveStoredPath(storedName), { force: true });
  } catch {
    // Already absent, or refused by the root check — nothing further to do.
  }
}

export async function ensureStorageDirs(): Promise<void> {
  await mkdir(uploadRoot(), { recursive: true });
  await mkdir(resolve(process.cwd(), config.storage.backupDir), { recursive: true });
}

/** Human-readable list of accepted extensions, for form hints. */
export function allowedExtensions(kinds?: AllowedKind[]): string[] {
  return Object.entries(ALLOWED)
    .filter(([, rule]) => !kinds || kinds.includes(rule.kind))
    .map(([extension]) => extension);
}
