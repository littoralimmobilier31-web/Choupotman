'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Eye, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/modal';
import { useAction } from './use-resource-form';

/**
 * Triage actions on a client's feedback.
 *
 * Turning a "changes requested" into a revision is the consequential one — it
 * consumes the project's allowance and may generate a supplementary invoice — so
 * it asks for confirmation and says what will happen.
 */
export function FeedbackActions({
  csrf,
  feedbackId,
  status,
  decision,
  canUpdate,
  canCreateRevision,
}: {
  csrf: string;
  feedbackId: number;
  status: string;
  decision: string;
  canUpdate: boolean;
  canCreateRevision: boolean;
}) {
  const router = useRouter();
  const { run, busy } = useAction(csrf);
  const [confirmRevision, setConfirmRevision] = React.useState(false);

  const setStatus = (next: 'acknowledged' | 'resolved') =>
    run(`/api/feedback/${feedbackId}`, {
      method: 'PATCH',
      body: { status: next },
      success: next === 'resolved' ? 'Feedback traité.' : 'Feedback pris en compte.',
    });

  return (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      {canUpdate && status === 'new' && (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setStatus('acknowledged')}>
          <Eye className="size-3.5" />
          Vu
        </Button>
      )}

      {canUpdate && status !== 'resolved' && (
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => setStatus('resolved')}>
          <Check className="size-3.5" />
          Traité
        </Button>
      )}

      {canCreateRevision && decision === 'changes_requested' && (
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => setConfirmRevision(true)}>
          <RefreshCw className="size-3.5" />
          Créer une révision
        </Button>
      )}

      <ConfirmDialog
        open={confirmRevision}
        onClose={() => setConfirmRevision(false)}
        onConfirm={async () => {
          setConfirmRevision(false);
          const result = await run<{ isExtra?: boolean; revisionId?: number }>(
            `/api/feedback/${feedbackId}`,
            { method: 'POST', success: 'Révision créée.' },
          );
          if (result) router.push('/espace-admin/revisions');
        }}
        title="Créer une révision depuis ce retour ?"
        message="La révision est comptée dans le forfait du projet. Si le forfait est dépassé, un supplément est calculé et une facture brouillon peut être créée automatiquement."
        confirmLabel="Créer la révision"
        busy={busy}
      />
    </div>
  );
}
