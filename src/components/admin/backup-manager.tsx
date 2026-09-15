'use client';

import * as React from 'react';
import { AlertTriangle, DatabaseBackup, Download, HardDrive, Info, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { TableWrap, Table, Thead, Th, Tbody, Tr, Td, TableEmpty } from '@/components/ui/table';
import { ConfirmDialog } from '@/components/ui/modal';
import { useAction } from './use-resource-form';

/**
 * Backups.
 *
 * Two things are stated plainly rather than assumed:
 *
 *   • a backup covers the database and not the uploaded files. Someone who
 *     believes otherwise discovers it on the day it matters;
 *   • restoring is not offered as a button. The running process holds the
 *     database open, and overwriting it discards everything recorded since — a
 *     decision for a person at a terminal, with the application stopped. The
 *     exact commands are printed instead.
 */

export type BackupRecord = {
  name: string;
  sizeBytes: number;
  sizeLabel: string;
  createdAt: string;
};

export function BackupManager({
  csrf,
  backups,
  restore,
  uploadDir,
  canCreate,
  canDelete,
  canExport,
}: {
  csrf: string;
  backups: BackupRecord[];
  restore: { dbPath: string; backupFile: string; steps: string[] };
  uploadDir: string;
  canCreate: boolean;
  canDelete: boolean;
  canExport: boolean;
}) {
  const { run, busy } = useAction(csrf);
  const [confirmDelete, setConfirmDelete] = React.useState<BackupRecord | null>(null);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Ce que contient une sauvegarde</CardTitle>
              <CardDescription>
                La base complète : clients, projets, devis, factures, paiements, contenus du site, journaux.
              </CardDescription>
            </div>
            {canCreate && (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => run('/api/sauvegardes', { success: 'Sauvegarde créée.' })}
              >
                <DatabaseBackup className="size-4" />
                {busy ? 'Sauvegarde…' : 'Sauvegarder maintenant'}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardBody>
          <div className="flex items-start gap-2.5 rounded-lg bg-warning-soft px-3 py-2.5">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning" />
            <div className="min-w-0">
              <p className="text-[0.8125rem] font-semibold text-fg">Les fichiers envoyés ne sont pas inclus</p>
              <p className="mt-0.5 text-[0.8125rem] leading-relaxed text-fg-muted">
                Le dossier <code className="font-mono text-[0.75rem]">{uploadDir}</code> contient vos images,
                livrables et justificatifs. Il doit être sauvegardé séparément, au niveau du serveur. Une
                sauvegarde qui couvrirait la moitié de ce qu’on croit est pire qu’une sauvegarde qui annonce ce
                qu’elle contient.
              </p>
            </div>
          </div>

          <p className="mt-3 flex items-start gap-2 text-[0.75rem] leading-relaxed text-fg-muted">
            <Info className="mt-0.5 size-3.5 shrink-0 text-accent" />
            La copie est prise par le moteur de base de données lui-même, pendant que l’application tourne : elle
            est cohérente, contrairement à une copie de fichier faite pendant une écriture.
          </p>
        </CardBody>
      </Card>

      <TableWrap>
        <Table>
          <Thead>
            <tr>
              <Th>Fichier</Th>
              <Th>Date</Th>
              <Th alignment="end">Taille</Th>
              <Th alignment="end">Actions</Th>
            </tr>
          </Thead>
          <Tbody>
            {backups.length === 0 ? (
              <TableEmpty colSpan={4}>
                Aucune sauvegarde. Prenez-en une maintenant, puis planifiez-en une quotidienne sur le serveur.
              </TableEmpty>
            ) : (
              backups.map((file) => (
                <Tr key={file.name}>
                  <Td>
                    <span className="flex items-center gap-2">
                      <HardDrive className="size-3.5 shrink-0 text-fg-subtle" />
                      <span className="truncate font-mono text-[0.75rem] text-fg">{file.name}</span>
                    </span>
                  </Td>
                  <Td className="whitespace-nowrap text-[0.75rem] text-fg-muted">
                    {file.createdAt.slice(0, 16).replace('T', ' à ')}
                  </Td>
                  <Td alignment="end" className="whitespace-nowrap tabular-nums text-[0.75rem] text-fg-muted">
                    {file.sizeLabel}
                  </Td>
                  <Td alignment="end">
                    <span className="flex items-center justify-end gap-1">
                      {canExport && (
                        <a
                          href={`/api/sauvegardes/telecharger?fichier=${encodeURIComponent(file.name)}`}
                          aria-label={`Télécharger ${file.name}`}
                          title="Télécharger — ce fichier contient toutes vos données"
                          className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                        >
                          <Download className="size-3.5" />
                        </a>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(file)}
                          aria-label={`Supprimer ${file.name}`}
                          className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </span>
                  </Td>
                </Tr>
              ))
            )}
          </Tbody>
        </Table>
      </TableWrap>

      <Card>
        <CardHeader>
          <CardTitle>Restaurer une sauvegarde</CardTitle>
          <CardDescription>
            La restauration ne se fait pas depuis cette interface : l’application garde la base ouverte, et
            remplacer le fichier sous une connexion active produit une base à moitié restaurée. Voici les étapes,
            à exécuter sur le serveur.
          </CardDescription>
        </CardHeader>
        <CardBody>
          <ol className="space-y-1.5">
            {restore.steps.map((step, index) => (
              <li key={index} className="flex gap-2.5 text-[0.8125rem] leading-relaxed text-fg-muted">
                <span className="shrink-0 tabular-nums text-fg-subtle">{index + 1}.</span>
                <span className="min-w-0">{step}</span>
              </li>
            ))}
          </ol>

          <p className="mt-3 text-[0.75rem] leading-relaxed text-fg-subtle">
            Écraser la base remplace aussi tout ce qui a été enregistré depuis la sauvegarde. C’est pourquoi
            l’étape 2 met l’ancienne base de côté au lieu de la supprimer.
          </p>
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          const target = confirmDelete;
          setConfirmDelete(null);
          if (!target) return;
          await run(`/api/sauvegardes?fichier=${encodeURIComponent(target.name)}`, {
            method: 'DELETE',
            success: 'Sauvegarde supprimée.',
          });
        }}
        title="Supprimer cette sauvegarde ?"
        message="Le fichier est effacé du serveur. Assurez-vous d’en avoir une copie ailleurs si c’est la seule dont vous disposez."
        confirmLabel="Supprimer"
        busy={busy}
      />
    </div>
  );
}
