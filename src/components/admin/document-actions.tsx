'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Mail, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/modal';
import { useAction } from './use-resource-form';

/**
 * Header actions on a quote or invoice: duplicate, bill, mark as sent.
 *
 * Billing a quote and issuing an invoice both have consequences the user should
 * not discover afterwards, so each states what will happen before it runs.
 */
export function DocumentActions({
  csrf,
  kind,
  documentId,
  status,
  canCreateInvoice = false,
  canDuplicate = false,
  canUpdate = true,
}: {
  csrf: string;
  kind: 'quote' | 'invoice';
  documentId: number;
  status: string;
  canCreateInvoice?: boolean;
  canDuplicate?: boolean;
  canUpdate?: boolean;
}) {
  const router = useRouter();
  const { run, busy } = useAction(csrf);
  const [confirmInvoice, setConfirmInvoice] = React.useState(false);
  const [confirmIssue, setConfirmIssue] = React.useState(false);

  const base = kind === 'quote' ? '/api/devis' : '/api/factures';

  return (
    <>
      {canUpdate && status === 'draft' && (
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirmIssue(true)}>
          <Mail className="size-3.5" />
          {kind === 'quote' ? 'Marquer envoyé' : 'Émettre'}
        </Button>
      )}

      {kind === 'quote' && canCreateInvoice && status !== 'refused' && status !== 'archived' && (
        <Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirmInvoice(true)}>
          <Receipt className="size-3.5" />
          Facturer
        </Button>
      )}

      {kind === 'quote' && canDuplicate && (
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={async () => {
            const result = await run<{ id: number }>(`${base}/${documentId}`, {
              method: 'PUT',
              success: 'Devis dupliqué.',
            });
            if (result?.id) router.push(`/espace-admin/devis/${result.id}`);
          }}
        >
          <Copy className="size-3.5" />
          Dupliquer
        </Button>
      )}

      <ConfirmDialog
        open={confirmIssue}
        onClose={() => setConfirmIssue(false)}
        onConfirm={async () => {
          setConfirmIssue(false);
          await run(`${base}/${documentId}`, {
            method: 'PATCH',
            body: { status: 'sent' },
            success: kind === 'quote' ? 'Devis marqué comme envoyé.' : 'Facture émise.',
          });
        }}
        title={kind === 'quote' ? 'Marquer ce devis comme envoyé ?' : 'Émettre cette facture ?'}
        message={
          kind === 'quote'
            ? 'Le devis passe en « envoyé » et sa date d’envoi est enregistrée. Vous pourrez toujours le modifier ensuite.'
            : 'Une fois émise, les montants de la facture sont verrouillés : son numéro fait partie de la séquence comptable. Une erreur se corrige en annulant et en refacturant.'
        }
        confirmLabel={kind === 'quote' ? 'Marquer envoyé' : 'Émettre'}
        busy={busy}
      />

      <ConfirmDialog
        open={confirmInvoice}
        onClose={() => setConfirmInvoice(false)}
        onConfirm={async () => {
          setConfirmInvoice(false);
          const result = await run<{ invoiceId: number }>(`${base}/${documentId}/facturer`, {
            method: 'POST',
            success: 'Facture créée.',
          });
          if (result?.invoiceId) router.push(`/espace-admin/factures/${result.invoiceId}`);
        }}
        title="Transformer ce devis en facture ?"
        message="Les lignes, la remise et la TVA sont reprises à l’identique dans une facture brouillon. Le devis passe en « accepté ». Vous pourrez vérifier la facture avant de l’émettre."
        confirmLabel="Créer la facture"
        busy={busy}
      />
    </>
  );
}
