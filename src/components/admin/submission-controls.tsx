'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Ban, Eye, Trash2, UserPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/modal';
import { useAction } from './use-resource-form';

/**
 * Triage actions on a received request.
 *
 * What a visitor wrote is never edited here — only read, promoted to the sales
 * pipeline, flagged as spam, or deleted.
 */
export function SubmissionActions({
  csrf,
  submissionId,
  status,
  canUpdate,
  canCreateLead,
  canDelete,
}: {
  csrf: string;
  submissionId: number;
  status: string;
  canUpdate: boolean;
  canCreateLead: boolean;
  canDelete: boolean;
}) {
  const router = useRouter();
  const { run, busy } = useAction(csrf);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {canUpdate && status === 'new' && (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() =>
            run(`/api/demandes/${submissionId}`, {
              method: 'PATCH',
              body: { status: 'read' },
              success: 'Marquée comme lue.',
            })
          }
        >
          <Eye className="size-3.5" />
          Lu
        </Button>
      )}

      {canCreateLead && status !== 'converted' && status !== 'spam' && (
        <Button
          variant="secondary"
          size="sm"
          disabled={busy}
          onClick={async () => {
            const result = await run<{ leadId: number }>(`/api/demandes/${submissionId}`, {
              method: 'POST',
              success: 'Prospect créé.',
            });
            if (result?.leadId) router.push('/espace-admin/prospects?vue=liste');
          }}
        >
          <UserPlus className="size-3.5" />
          En faire un prospect
        </Button>
      )}

      {canUpdate && status !== 'spam' && status !== 'converted' && (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() =>
            run(`/api/demandes/${submissionId}`, {
              method: 'PATCH',
              body: { status: 'spam' },
              success: 'Classée en indésirable.',
            })
          }
        >
          <Ban className="size-3.5" />
          Indésirable
        </Button>
      )}

      {canDelete && (
        <Button
          variant="ghost"
          size="sm"
          className="text-danger hover:bg-danger-soft"
          disabled={busy}
          onClick={() => setConfirmDelete(true)}
          aria-label="Supprimer la demande"
        >
          <Trash2 className="size-3.5" />
        </Button>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          await run(`/api/demandes/${submissionId}`, { method: 'DELETE', success: 'Demande supprimée.' });
        }}
        title="Supprimer cette demande ?"
        message="Le message du visiteur sera définitivement perdu. Préférez « Indésirable » pour le conserver sans l’afficher."
        confirmLabel="Supprimer"
        busy={busy}
      />
    </div>
  );
}
