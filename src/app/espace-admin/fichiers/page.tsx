import { PageHeader, SummaryStrip } from '@/components/admin/page-kit';
import { FileLibrary } from '@/components/admin/file-library';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import {
  countFiles,
  folderBreadcrumb,
  listFiles,
  listFolderTemplates,
  listFolders,
  listFolderTemplateItems,
  storageByKind,
  totalStorageBytes,
} from '@/lib/db/repositories/files';
import { clientOptions } from '@/lib/db/repositories/clients';
import { projectOptions } from '@/lib/db/repositories/projects';
import { allowedExtensions } from '@/lib/storage';
import { config } from '@/lib/config';
import type { FileKind } from '@/lib/db/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Fichiers' };

/** 1 234 567 → « 1,2 Mo ». */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const units = ['Ko', 'Mo', 'Go', 'To'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0).replace('.', ',')} ${units[unit]}`;
}

const KIND_LABELS: Record<string, string> = {
  image: 'Images',
  video: 'Médias',
  document: 'Documents',
  archive: 'Archives',
  other: 'Autres',
};

export default async function FilesPage({
  searchParams,
}: {
  searchParams: Promise<{ dossier?: string; q?: string; type?: string; partages?: string }>;
}) {
  const user = await requirePermission('files.view');
  const query = await searchParams;
  const csrf = (await getCsrfToken()) ?? '';

  const folderId = query.dossier ? Number.parseInt(query.dossier, 10) || null : null;

  const files = listFiles({
    // Inside a folder, show that folder; at the root, show everything so a file
    // detached from a deleted folder is never invisible.
    folderId: folderId ?? undefined,
    kind: (query.type as FileKind) || undefined,
    search: query.q?.trim() || undefined,
    clientVisibleOnly: query.partages === '1',
    limit: 300,
  });

  const folders = listFolders({ parentId: folderId });
  const breadcrumb = folderId ? folderBreadcrumb(folderId) : [];
  const usage = storageByKind();
  const templates = listFolderTemplates().map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    is_default: template.is_default,
    items: listFolderTemplateItems(template.id).map((item) => item.name),
  }));

  return (
    <>
      <PageHeader
        title="Fichiers"
        description="Bibliothèque de fichiers, organisée par client et par projet. Les fichiers ne sont jamais visibles par le client sans un partage explicite."
      />

      <SummaryStrip
        items={[
          { label: 'Fichiers', value: countFiles() },
          { label: 'Espace utilisé', value: formatBytes(totalStorageBytes()) },
          ...usage.slice(0, 3).map((entry) => ({
            label: KIND_LABELS[entry.kind] ?? entry.kind,
            value: `${entry.count} · ${formatBytes(entry.bytes)}`,
          })),
        ]}
      />

      <FileLibrary
        csrf={csrf}
        files={files.map((file) => ({
          id: file.id,
          original_name: file.original_name,
          caption: file.caption,
          kind: file.kind,
          mime_type: file.mime_type,
          size_bytes: file.size_bytes,
          folder_id: file.folder_id,
          project_id: file.project_id,
          client_id: file.client_id,
          is_client_visible: file.is_client_visible,
          is_demo: file.is_demo,
          created_at: file.created_at,
        }))}
        folders={folders.map((folder) => ({
          id: folder.id,
          name: folder.name,
          file_count: folder.file_count,
          child_count: folder.child_count,
          is_system: folder.is_system,
        }))}
        breadcrumb={breadcrumb.map((folder) => ({ id: folder.id, name: folder.name }))}
        currentFolderId={folderId}
        templates={templates}
        clients={clientOptions().map((client) => ({ value: String(client.id), label: client.label }))}
        projects={projectOptions().map((project) => ({ value: String(project.id), label: project.label }))}
        acceptedExtensions={allowedExtensions()}
        maxUploadMb={Math.floor(config.storage.maxUploadBytes / (1024 * 1024))}
        canCreate={can(user, 'files.create')}
        canUpdate={can(user, 'files.update')}
        canDelete={can(user, 'files.delete')}
      />
    </>
  );
}
