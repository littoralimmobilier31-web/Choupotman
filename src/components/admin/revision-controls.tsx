'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Receipt } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/field';
import { useAction } from './use-resource-form';

/**
 * Inline controls for the revisions list.
 *
 * Status and billing are one click from the list because that is where the work
 * actually happens; the full revision lives on its project.
 */

const STATUS_LABELS: Record<string, string> = {
  open: 'Ouverte', in_progress: 'En cours', done: 'Terminée', rejected: 'Refusée',
};

const STATUS_TONES: Record<string, 'neutral' | 'brand' | 'success' | 'danger'> = {
  open: 'neutral', in_progress: 'brand', done: 'success', rejected: 'danger',
};

export function RevisionStatusCell({
  csrf,
  revisionId,
  status,
  canUpdate,
}: {
  csrf: string;
  revisionId: number;
  status: string;
  canUpdate: boolean;
}) {
  const { run, busy } = useAction(csrf);

  if (!canUpdate) {
    return <Badge tone={STATUS_TONES[status] ?? 'neutral'}>{STATUS_LABELS[status] ?? status}</Badge>;
  }

  return (
    <Select
      value={status}
      disabled={busy}
      aria-label="Statut de la révision"
      className="h-7 w-auto min-w-28 text-[0.6875rem]"
      onChange={(event) =>
        run(`/api/revisions/${revisionId}`, {
          method: 'PATCH',
          body: { status: event.target.value },
          success: 'Révision mise à jour.',
        })
      }
    >
      {Object.entries(STATUS_LABELS).map(([value, label]) => (
        <option key={value} value={value}>
          {label}
        </option>
      ))}
    </Select>
  );
}

export function RevisionBillButton({
  csrf,
  revisionId,
  enabled,
}: {
  csrf: string;
  revisionId: number;
  enabled: boolean;
}) {
  const router = useRouter();
  const { run, busy } = useAction(csrf);

  if (!enabled) {
    return <span className="block text-[0.625rem] text-warning">non facturé</span>;
  }

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        const result = await run<{ invoiceId: number }>(`/api/revisions/${revisionId}/facturer`, {
          method: 'POST',
          success: 'Facture brouillon créée.',
        });
        // Land on the draft so the amount can be checked before sending.
        if (result?.invoiceId) router.push(`/espace-admin/factures/${result.invoiceId}`);
      }}
      className="mt-0.5 inline-flex items-center gap-1 text-[0.625rem] font-semibold text-accent hover:underline disabled:opacity-50"
    >
      <Receipt className="size-3" />
      Facturer
    </button>
  );
}
