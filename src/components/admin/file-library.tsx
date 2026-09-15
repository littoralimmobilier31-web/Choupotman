'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Archive, ChevronRight, Download, Eye, EyeOff, File as FileIcon, FileText, Film,
  FolderPlus, Folder, Home, Image as ImageIcon, Lock, Pencil, Trash2, Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Field, Input, Select, Switch } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { useAction } from './use-resource-form';

/**
 * The file library.
 *
 * Two rules from the specification are enforced in the interface as well as in the
 * API, because both are easy to get wrong by accident:
 *
 *   • a file is never visible to the client unless someone shares it, and the
 *     sharing state is shown on every row rather than hidden in a menu;
 *   • uploads are validated server-side; the picker's `accept` list is a
 *     convenience, and a refused file is reported with the reason instead of
 *     failing silently.
 */

export type FileRecord = {
  id: number;
  original_name: string;
  caption: string | null;
  kind: string;
  mime_type: string;
  size_bytes: number;
  folder_id: number | null;
  project_id: number | null;
  client_id: number | null;
  is_client_visible: 0 | 1;
  is_demo: 0 | 1;
  created_at: string;
};

export type FolderRecord = {
  id: number;
  name: string;
  file_count: number;
  child_count: number;
  is_system: 0 | 1;
};

export type TemplateRecord = {
  id: number;
  name: string;
  description: string | null;
  is_default: 0 | 1;
  items: string[];
};

export type Option = { value: string; label: string };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} o`;
  const units = ['Ko', 'Mo', 'Go'];
  let value = bytes / 1024;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0).replace('.', ',')} ${units[unit]}`;
}

function KindIcon({ kind, className }: { kind: string; className?: string }) {
  if (kind === 'image') return <ImageIcon className={className} />;
  if (kind === 'video') return <Film className={className} />;
  if (kind === 'archive') return <Archive className={className} />;
  if (kind === 'document') return <FileText className={className} />;
  return <FileIcon className={className} />;
}

export function FileLibrary({
  csrf,
  files,
  folders,
  breadcrumb,
  currentFolderId,
  templates,
  clients,
  projects,
  acceptedExtensions,
  maxUploadMb,
  canCreate,
  canUpdate,
  canDelete,
}: {
  csrf: string;
  files: FileRecord[];
  folders: FolderRecord[];
  breadcrumb: { id: number; name: string }[];
  currentFolderId: number | null;
  templates: TemplateRecord[];
  clients: Option[];
  projects: Option[];
  acceptedExtensions: string[];
  maxUploadMb: number;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const [newFolder, setNewFolder] = React.useState(false);
  const [renaming, setRenaming] = React.useState<FolderRecord | null>(null);
  const [editing, setEditing] = React.useState<FileRecord | null>(null);
  const [applyTemplate, setApplyTemplate] = React.useState(false);

  return (
    <div className="space-y-4">
      {/* Breadcrumb + actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav aria-label="Dossier courant" className="flex min-w-0 flex-wrap items-center gap-1 text-[0.8125rem]">
          <Link
            href="/espace-admin/fichiers"
            className={cn(
              'inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors',
              currentFolderId === null ? 'font-medium text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            <Home className="size-3.5" />
            Bibliothèque
          </Link>
          {breadcrumb.map((folder, index) => (
            <span key={folder.id} className="flex items-center gap-1">
              <ChevronRight className="size-3 text-fg-subtle rtl:-scale-x-100" aria-hidden />
              <Link
                href={`/espace-admin/fichiers?dossier=${folder.id}`}
                className={cn(
                  'rounded px-1.5 py-0.5 transition-colors',
                  index === breadcrumb.length - 1 ? 'font-medium text-fg' : 'text-fg-muted hover:text-fg',
                )}
              >
                {folder.name}
              </Link>
            </span>
          ))}
        </nav>

        {canCreate && (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" size="sm" onClick={() => setNewFolder(true)}>
              <FolderPlus className="size-3.5" />
              Nouveau dossier
            </Button>
            {templates.length > 0 && projects.length > 0 && (
              <Button variant="secondary" size="sm" onClick={() => setApplyTemplate(true)}>
                <Folder className="size-3.5" />
                Appliquer un modèle
              </Button>
            )}
          </div>
        )}
      </div>

      {canCreate && (
        <UploadZone
          csrf={csrf}
          folderId={currentFolderId}
          acceptedExtensions={acceptedExtensions}
          maxUploadMb={maxUploadMb}
        />
      )}

      {/* Folders */}
      {folders.length > 0 && (
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {folders.map((folder) => (
            <FolderCard
              key={folder.id}
              csrf={csrf}
              folder={folder}
              canUpdate={canUpdate}
              canDelete={canDelete}
              onRename={() => setRenaming(folder)}
            />
          ))}
        </ul>
      )}

      {/* Files */}
      {files.length === 0 ? (
        <Card>
          <CardBody className="py-8 text-center">
            <Upload className="mx-auto mb-2 size-5 text-fg-subtle" />
            <p className="text-[0.875rem] font-medium text-fg">Aucun fichier ici</p>
            <p className="mx-auto mt-1 max-w-md text-[0.8125rem] leading-relaxed text-fg-muted">
              Déposez vos livrables, contrats signés et sources dans les dossiers du projet concerné. Rien n’est
              partagé avec le client tant que vous ne le décidez pas.
            </p>
          </CardBody>
        </Card>
      ) : (
        <ul className="space-y-1.5">
          {files.map((file) => (
            <FileRow
              key={file.id}
              csrf={csrf}
              file={file}
              canUpdate={canUpdate}
              canDelete={canDelete}
              onEdit={() => setEditing(file)}
            />
          ))}
        </ul>
      )}

      {newFolder && (
        <FolderModal csrf={csrf} parentId={currentFolderId} clients={clients} projects={projects} onClose={() => setNewFolder(false)} />
      )}
      {renaming && <RenameFolderModal csrf={csrf} folder={renaming} onClose={() => setRenaming(null)} />}
      {editing && (
        <FileModal csrf={csrf} file={editing} folders={folders} onClose={() => setEditing(null)} />
      )}
      {applyTemplate && (
        <TemplateModal csrf={csrf} templates={templates} projects={projects} onClose={() => setApplyTemplate(false)} />
      )}
    </div>
  );
}

function UploadZone({
  csrf,
  folderId,
  acceptedExtensions,
  maxUploadMb,
}: {
  csrf: string;
  folderId: number | null;
  acceptedExtensions: string[];
  maxUploadMb: number;
}) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [rejected, setRejected] = React.useState<{ name: string; reason: string }[]>([]);

  const send = async (selected: FileList | File[]) => {
    const list = Array.from(selected);
    if (list.length === 0 || busy) return;

    setBusy(true);
    setRejected([]);

    try {
      const form = new FormData();
      for (const file of list.slice(0, 20)) form.append('fichiers', file);
      if (folderId !== null) form.append('folder_id', String(folderId));
      form.append('csrf', csrf);

      const response = await fetch('/api/fichiers', {
        method: 'POST',
        headers: { 'x-csrf-token': csrf },
        body: form,
      });
      const result = (await response.json().catch(() => ({}))) as {
        error?: string;
        created?: { id: number; name: string }[];
        rejected?: { name: string; reason: string }[];
      };

      if (result.rejected && result.rejected.length > 0) setRejected(result.rejected);

      const created = result.created?.length ?? 0;
      if (created > 0) {
        toast.success(created === 1 ? 'Fichier envoyé.' : `${created} fichiers envoyés.`);
        router.refresh();
      } else if (!response.ok) {
        // A batch entirely refused reports per-file reasons below, so only the
        // generic failure needs a toast of its own.
        if (!result.rejected || result.rejected.length === 0) {
          toast.error(result.error ?? 'Envoi impossible.');
        }
      }
    } catch {
      toast.error('Envoi impossible.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div>
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void send(event.dataTransfer.files);
        }}
        className={cn(
          'rounded-[var(--radius-card)] border border-dashed px-4 py-6 text-center transition-colors',
          dragging ? 'border-accent bg-accent-soft' : 'border-line bg-surface-sunken',
        )}
      >
        <Upload className={cn('mx-auto mb-2 size-5', dragging ? 'text-accent' : 'text-fg-subtle')} />
        <p className="text-[0.8125rem] font-medium text-fg">
          {busy ? 'Envoi en cours…' : 'Glissez des fichiers ici'}
        </p>
        <p className="mt-0.5 text-[0.75rem] text-fg-muted">
          ou{' '}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="font-medium text-accent underline-offset-2 hover:underline"
          >
            parcourez vos fichiers
          </button>
          {' · '}
          {maxUploadMb} Mo maximum par fichier
        </p>
        <p className="mx-auto mt-1.5 max-w-xl text-[0.6875rem] leading-relaxed text-fg-subtle">
          Formats acceptés : {acceptedExtensions.join(' ')}
        </p>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={acceptedExtensions.join(',')}
          onChange={(event) => event.target.files && void send(event.target.files)}
          className="hidden"
          aria-label="Choisir des fichiers"
        />
      </div>

      {rejected.length > 0 && (
        <div className="mt-2 rounded-lg bg-danger-soft px-3 py-2.5" role="alert">
          <p className="text-[0.75rem] font-semibold text-danger">
            {rejected.length} fichier{rejected.length === 1 ? '' : 's'} refusé{rejected.length === 1 ? '' : 's'}
          </p>
          <ul className="mt-1 space-y-0.5">
            {rejected.map((entry, index) => (
              <li key={`${entry.name}-${index}`} className="text-[0.75rem] text-danger">
                <span className="font-medium">{entry.name}</span> — {entry.reason}
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => setRejected([])}
            className="mt-1.5 text-[0.6875rem] font-medium text-danger underline-offset-2 hover:underline"
          >
            Masquer
          </button>
        </div>
      )}
    </div>
  );
}

function FolderCard({
  csrf,
  folder,
  canUpdate,
  canDelete,
  onRename,
}: {
  csrf: string;
  folder: FolderRecord;
  canUpdate: boolean;
  canDelete: boolean;
  onRename: () => void;
}) {
  const { run, busy } = useAction(csrf);
  const [confirm, setConfirm] = React.useState<{ reason: string; force: boolean } | null>(null);

  return (
    <li className="flex items-center gap-2 rounded-[var(--radius-card)] border border-line bg-surface-raised p-3">
      <Link
        href={`/espace-admin/fichiers?dossier=${folder.id}`}
        className="group flex min-w-0 flex-1 items-center gap-2.5"
      >
        <Folder className="size-4 shrink-0 text-accent" />
        <span className="min-w-0">
          <span className="block truncate text-[0.8125rem] font-medium text-fg group-hover:text-accent">
            {folder.name}
          </span>
          <span className="block text-[0.6875rem] text-fg-subtle">
            {folder.file_count} fichier{folder.file_count === 1 ? '' : 's'}
            {folder.child_count > 0 && ` · ${folder.child_count} sous-dossier${folder.child_count === 1 ? '' : 's'}`}
          </span>
        </span>
      </Link>

      <div className="flex shrink-0 items-center gap-1">
        {canUpdate && (
          <button
            type="button"
            onClick={onRename}
            aria-label={`Renommer ${folder.name}`}
            className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <Pencil className="size-3.5" />
          </button>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={async () => {
              // Ask the API first: it knows what is inside and refuses with the
              // exact consequence, which is a better warning than a guess.
              const response = await fetch(`/api/dossiers/${folder.id}`, {
                method: 'DELETE',
                headers: { 'x-csrf-token': csrf },
              });
              const result = (await response.json().catch(() => ({}))) as { reason?: string };
              if (response.status === 409) {
                setConfirm({ reason: result.reason ?? 'Le dossier n’est pas vide.', force: true });
              } else if (response.ok) {
                window.location.reload();
              }
            }}
            aria-label={`Supprimer ${folder.name}`}
            className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirm !== null}
        onClose={() => setConfirm(null)}
        onConfirm={async () => {
          setConfirm(null);
          await run(`/api/dossiers/${folder.id}?force=1`, { method: 'DELETE', success: 'Dossier supprimé.' });
        }}
        title={`Supprimer « ${folder.name} » ?`}
        message={confirm?.reason ?? ''}
        confirmLabel="Supprimer quand même"
        busy={busy}
      />
    </li>
  );
}

function FileRow({
  csrf,
  file,
  canUpdate,
  canDelete,
  onEdit,
}: {
  csrf: string;
  file: FileRecord;
  canUpdate: boolean;
  canDelete: boolean;
  onEdit: () => void;
}) {
  const { run, busy } = useAction(csrf);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const previewable = file.kind === 'image' || file.mime_type === 'application/pdf';

  return (
    <li className="flex items-center gap-3 rounded-lg border border-line bg-surface-raised px-3 py-2.5">
      <KindIcon kind={file.kind} className="size-4 shrink-0 text-fg-subtle" />

      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="truncate text-[0.8125rem] font-medium text-fg">{file.original_name}</span>
          {file.is_demo === 1 && <Badge tone="warning">DÉMO</Badge>}
          {file.is_client_visible === 1 ? (
            <Badge tone="success">Partagé</Badge>
          ) : (
            <Lock className="size-3 shrink-0 text-fg-subtle" aria-label="Privé" />
          )}
        </p>
        <p className="truncate text-[0.6875rem] text-fg-subtle">
          {formatBytes(file.size_bytes)} · {file.created_at.slice(0, 10)}
          {file.caption && ` · ${file.caption}`}
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {previewable && (
          <a
            href={`/api/fichiers/${file.id}/telecharger?apercu=1`}
            target="_blank"
            rel="noreferrer"
            aria-label={`Aperçu de ${file.original_name}`}
            className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <Eye className="size-3.5" />
          </a>
        )}
        <a
          href={`/api/fichiers/${file.id}/telecharger`}
          aria-label={`Télécharger ${file.original_name}`}
          className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
        >
          <Download className="size-3.5" />
        </a>

        {canUpdate && (
          <>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run(`/api/fichiers/${file.id}`, {
                  method: 'PATCH',
                  body: { is_client_visible: file.is_client_visible === 0 },
                  success:
                    file.is_client_visible === 1
                      ? 'Partage retiré : le client ne voit plus ce fichier.'
                      : 'Fichier partagé avec le client.',
                })
              }
              aria-label={file.is_client_visible === 1 ? 'Retirer le partage client' : 'Partager avec le client'}
              className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
            >
              {file.is_client_visible === 1 ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
            </button>
            <button
              type="button"
              onClick={onEdit}
              aria-label={`Modifier ${file.original_name}`}
              className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
            >
              <Pencil className="size-3.5" />
            </button>
          </>
        )}
        {canDelete && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            aria-label={`Supprimer ${file.original_name}`}
            className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 className="size-3.5" />
          </button>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          await run(`/api/fichiers/${file.id}`, { method: 'DELETE', success: 'Fichier supprimé.' });
        }}
        title={`Supprimer « ${file.original_name} » ?`}
        message="Le fichier est effacé du disque. Cette action est irréversible — assurez-vous d’en avoir une copie si c’est un livrable."
        confirmLabel="Supprimer"
        busy={busy}
      />
    </li>
  );
}

function FolderModal({
  csrf,
  parentId,
  clients,
  projects,
  onClose,
}: {
  csrf: string;
  parentId: number | null;
  clients: Option[];
  projects: Option[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { run, busy } = useAction(csrf);
  const [name, setName] = React.useState('');
  const [clientId, setClientId] = React.useState('');
  const [projectId, setProjectId] = React.useState('');

  return (
    <Modal
      open
      onClose={onClose}
      title="Nouveau dossier"
      description={parentId ? 'Créé dans le dossier courant.' : 'Créé à la racine de la bibliothèque.'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={busy || name.trim() === ''}
            onClick={async () => {
              const result = await run('/api/dossiers', {
                body: {
                  name: name.trim(),
                  parent_id: parentId,
                  client_id: clientId ? Number(clientId) : null,
                  project_id: projectId ? Number(projectId) : null,
                },
                success: 'Dossier créé.',
              });
              if (result) {
                router.refresh();
                onClose();
              }
            }}
          >
            Créer
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Nom du dossier" htmlFor="fd-name" required>
          <Input
            id="fd-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={120}
            autoFocus
            placeholder="01 - Documents"
          />
        </Field>

        {!parentId && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Client" htmlFor="fd-client" hint="Optionnel : rattache le dossier à un client.">
              <Select id="fd-client" value={clientId} onChange={(event) => setClientId(event.target.value)}>
                <option value="">Aucun</option>
                {clients.map((client) => (
                  <option key={client.value} value={client.value}>
                    {client.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Projet" htmlFor="fd-project">
              <Select id="fd-project" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                <option value="">Aucun</option>
                {projects.map((project) => (
                  <option key={project.value} value={project.value}>
                    {project.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        )}
      </div>
    </Modal>
  );
}

function RenameFolderModal({
  csrf,
  folder,
  onClose,
}: {
  csrf: string;
  folder: FolderRecord;
  onClose: () => void;
}) {
  const router = useRouter();
  const { run, busy } = useAction(csrf);
  const [name, setName] = React.useState(folder.name);

  return (
    <Modal
      open
      onClose={onClose}
      title="Renommer le dossier"
      description="Les sous-dossiers suivent automatiquement."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={busy || name.trim() === '' || name === folder.name}
            onClick={async () => {
              const result = await run(`/api/dossiers/${folder.id}`, {
                method: 'PATCH',
                body: { name: name.trim() },
                success: 'Dossier renommé.',
              });
              if (result) {
                router.refresh();
                onClose();
              }
            }}
          >
            Renommer
          </Button>
        </>
      }
    >
      <Field label="Nom" htmlFor="fr-name" required>
        <Input id="fr-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={120} autoFocus />
      </Field>
    </Modal>
  );
}

function FileModal({
  csrf,
  file,
  folders,
  onClose,
}: {
  csrf: string;
  file: FileRecord;
  folders: FolderRecord[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { run, busy } = useAction(csrf);
  const [values, setValues] = React.useState({
    original_name: file.original_name,
    caption: file.caption ?? '',
    folder_id: file.folder_id !== null ? String(file.folder_id) : '',
    is_client_visible: file.is_client_visible === 1,
  });

  return (
    <Modal
      open
      onClose={onClose}
      title="Modifier le fichier"
      description="Le nom affiché et la légende sont des métadonnées : le fichier reste stocké sous un nom aléatoire."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={busy || values.original_name.trim() === ''}
            onClick={async () => {
              const result = await run(`/api/fichiers/${file.id}`, {
                method: 'PATCH',
                body: {
                  original_name: values.original_name.trim(),
                  caption: values.caption.trim() || null,
                  folder_id: values.folder_id ? Number(values.folder_id) : null,
                  is_client_visible: values.is_client_visible,
                },
                success: 'Fichier enregistré.',
              });
              if (result) {
                router.refresh();
                onClose();
              }
            }}
          >
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Nom affiché" htmlFor="fl-name" required>
          <Input
            id="fl-name"
            value={values.original_name}
            onChange={(event) => setValues((previous) => ({ ...previous, original_name: event.target.value }))}
            maxLength={240}
            autoFocus
          />
        </Field>

        <Field label="Légende" htmlFor="fl-caption" hint="Visible par le client si le fichier est partagé.">
          <Input
            id="fl-caption"
            value={values.caption}
            onChange={(event) => setValues((previous) => ({ ...previous, caption: event.target.value }))}
            maxLength={500}
          />
        </Field>

        {folders.length > 0 && (
          <Field label="Déplacer vers" htmlFor="fl-folder">
            <Select
              id="fl-folder"
              value={values.folder_id}
              onChange={(event) => setValues((previous) => ({ ...previous, folder_id: event.target.value }))}
            >
              <option value="">Racine de la bibliothèque</option>
              {folders.map((folder) => (
                <option key={folder.id} value={String(folder.id)}>
                  {folder.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div className="flex items-start justify-between gap-4 rounded-lg bg-surface-sunken px-3 py-2.5">
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-medium text-fg">Partager avec le client</p>
            <p className="mt-0.5 text-[0.75rem] leading-relaxed text-fg-muted">
              Le fichier apparaît dans l’espace client. Tant que ce réglage est désactivé, il n’est visible que
              depuis l’administration.
            </p>
          </div>
          <Switch
            checked={values.is_client_visible}
            onChange={(next) => setValues((previous) => ({ ...previous, is_client_visible: next }))}
            label={values.is_client_visible ? 'Partagé' : 'Privé'}
          />
        </div>
      </div>
    </Modal>
  );
}

function TemplateModal({
  csrf,
  templates,
  projects,
  onClose,
}: {
  csrf: string;
  templates: TemplateRecord[];
  projects: Option[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { run, busy } = useAction(csrf);
  const [templateId, setTemplateId] = React.useState(
    String(templates.find((template) => template.is_default === 1)?.id ?? templates[0]?.id ?? ''),
  );
  const [projectId, setProjectId] = React.useState('');
  const selected = templates.find((template) => String(template.id) === templateId);

  return (
    <Modal
      open
      onClose={onClose}
      title="Appliquer un modèle de dossiers"
      description="Crée l’arborescence type dans un projet. Réappliquer un modèle ne crée que les dossiers manquants."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={busy || projectId === '' || templateId === ''}
            onClick={async () => {
              const result = await run('/api/dossiers/modeles', {
                method: 'PUT',
                body: { project_id: Number(projectId), template_id: Number(templateId) },
                success: 'Arborescence créée.',
              });
              if (result) {
                router.refresh();
                onClose();
              }
            }}
          >
            Appliquer
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Projet" htmlFor="tp-project" required>
          <Select id="tp-project" value={projectId} onChange={(event) => setProjectId(event.target.value)}>
            <option value="">Choisir un projet…</option>
            {projects.map((project) => (
              <option key={project.value} value={project.value}>
                {project.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Modèle" htmlFor="tp-template" required>
          <Select id="tp-template" value={templateId} onChange={(event) => setTemplateId(event.target.value)}>
            {templates.map((template) => (
              <option key={template.id} value={String(template.id)}>
                {template.name}
                {template.is_default === 1 ? ' (par défaut)' : ''}
              </option>
            ))}
          </Select>
        </Field>

        {selected && (
          <div className="rounded-lg bg-surface-sunken px-3 py-2.5">
            <p className="mb-1.5 text-[0.75rem] font-medium text-fg">
              {selected.items.length} dossier{selected.items.length === 1 ? '' : 's'} seront créés
            </p>
            <ul className="flex flex-wrap gap-1.5">
              {selected.items.map((item) => (
                <li
                  key={item}
                  className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 text-[0.6875rem] text-fg-muted"
                >
                  <Folder className="size-2.5" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Modal>
  );
}
