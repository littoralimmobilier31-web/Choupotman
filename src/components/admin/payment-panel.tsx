'use client';

import * as React from 'react';
import { Banknote, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { useAction } from './use-resource-form';
import { formatMoney, formatShortDate } from '@/lib/i18n/format';

/**
 * Payments recorded against an invoice.
 *
 * Partial payments are the normal case, so the form defaults to the outstanding
 * balance and refuses to offer more than that — the API rejects an over-payment
 * anyway, and a form that lets you type it is a form that wastes your time.
 */

const METHODS = [
  { value: 'cash', label: 'Espèces' },
  { value: 'transfer', label: 'Virement' },
  { value: 'ccp', label: 'CCP' },
  { value: 'card', label: 'Carte' },
  { value: 'other', label: 'Autre' },
];

const METHOD_LABELS: Record<string, string> = Object.fromEntries(
  METHODS.map((method) => [method.value, method.label]),
);

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente', confirmed: 'Confirmé', refunded: 'Remboursé',
};

const STATUS_TONES: Record<string, 'warning' | 'success' | 'danger'> = {
  pending: 'warning', confirmed: 'success', refunded: 'danger',
};

export type PaymentRecord = {
  id: number;
  amount: number;
  currency: string;
  method: string;
  reference: string | null;
  paid_at: string;
  status: string;
  notes: string | null;
};

export function PaymentPanel({
  csrf,
  invoiceId,
  clientId,
  projectId,
  currency,
  balanceDue,
  payments,
  canCreate,
  canDelete,
}: {
  csrf: string;
  invoiceId: number;
  clientId: number | null;
  projectId: number | null;
  currency: string;
  balanceDue: number;
  payments: PaymentRecord[];
  canCreate: boolean;
  canDelete: boolean;
}) {
  const { run, busy } = useAction(csrf);
  const [open, setOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState<PaymentRecord | null>(null);

  return (
    <div className="space-y-3">
      {payments.length === 0 ? (
        <p className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-[0.75rem] text-fg-subtle">
          Aucun règlement enregistré.
        </p>
      ) : (
        <ul className="space-y-2">
          {payments.map((payment) => (
            <li
              key={payment.id}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-line bg-surface-raised px-3 py-2.5"
            >
              <Banknote className="size-4 shrink-0 text-success" />
              <div className="min-w-0 flex-1">
                <p className="text-[0.8125rem] font-semibold tabular-nums text-fg">
                  {formatMoney(payment.amount, payment.currency)}
                </p>
                <p className="text-[0.625rem] text-fg-subtle">
                  {[
                    METHOD_LABELS[payment.method] ?? payment.method,
                    formatShortDate(payment.paid_at, 'fr'),
                    payment.reference,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              <Badge tone={STATUS_TONES[payment.status] ?? 'neutral'}>
                {STATUS_LABELS[payment.status] ?? payment.status}
              </Badge>
              {canDelete && (
                <button
                  type="button"
                  onClick={() => setDeleting(payment)}
                  aria-label="Supprimer ce règlement"
                  className="rounded p-1 text-fg-subtle transition-colors hover:text-danger"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {canCreate && balanceDue > 0 && (
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)} className="w-full">
          <Plus className="size-3.5" />
          Enregistrer un règlement
        </Button>
      )}

      {canCreate && balanceDue === 0 && payments.length > 0 && (
        <p className="rounded-lg bg-success-soft px-3 py-2 text-center text-[0.75rem] font-medium text-success">
          Facture soldée
        </p>
      )}

      {open && (
        <NewPaymentModal
          csrf={csrf}
          invoiceId={invoiceId}
          clientId={clientId}
          projectId={projectId}
          currency={currency}
          balanceDue={balanceDue}
          onClose={() => setOpen(false)}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={async () => {
          const payment = deleting;
          setDeleting(null);
          if (payment) {
            await run(`/api/paiements/${payment.id}`, { method: 'DELETE', success: 'Règlement supprimé.' });
          }
        }}
        title="Supprimer ce règlement ?"
        message="Le solde de la facture et son statut seront recalculés. À n’utiliser que pour corriger une saisie erronée."
        confirmLabel="Supprimer"
        busy={busy}
      />
    </div>
  );
}

function NewPaymentModal({
  csrf,
  invoiceId,
  clientId,
  projectId,
  currency,
  balanceDue,
  onClose,
}: {
  csrf: string;
  invoiceId: number;
  clientId: number | null;
  projectId: number | null;
  currency: string;
  balanceDue: number;
  onClose: () => void;
}) {
  const { run, busy } = useAction(csrf);
  const [values, setValues] = React.useState({
    amount: String(balanceDue),
    method: 'transfer',
    reference: '',
    paid_at: new Date().toISOString().slice(0, 10),
    notes: '',
  });

  const set = (key: keyof typeof values, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const amount = Number(values.amount) || 0;
  // The API refuses an over-payment; say so before the request, not after.
  const tooMuch = amount > balanceDue + 0.01;
  const partial = amount > 0 && amount < balanceDue;

  return (
    <Modal
      open
      onClose={onClose}
      title="Enregistrer un règlement"
      description={`Reste dû : ${formatMoney(balanceDue, currency)}`}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={busy || amount <= 0 || tooMuch}
            onClick={async () => {
              const result = await run('/api/paiements', {
                method: 'POST',
                body: {
                  invoice_id: invoiceId,
                  client_id: clientId,
                  project_id: projectId,
                  amount,
                  currency,
                  method: values.method,
                  reference: values.reference || null,
                  paid_at: values.paid_at || null,
                  status: 'confirmed',
                  notes: values.notes || null,
                },
                success: 'Règlement enregistré.',
              });
              if (result) onClose();
            }}
          >
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field
          label={`Montant (${currency})`}
          required
          htmlFor="pay-amount"
          error={tooMuch ? 'Le montant dépasse le solde restant dû.' : undefined}
          hint={partial ? 'Paiement partiel : la facture restera partiellement payée.' : undefined}
        >
          <Input
            id="pay-amount"
            type="number"
            min={0}
            max={balanceDue}
            step="0.01"
            value={values.amount}
            onChange={(e) => set('amount', e.target.value)}
            className="tabular-nums"
            autoFocus
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Mode de paiement" htmlFor="pay-method">
            <Select id="pay-method" value={values.method} onChange={(e) => set('method', e.target.value)}>
              {METHODS.map((method) => (
                <option key={method.value} value={method.value}>
                  {method.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date" htmlFor="pay-date">
            <Input id="pay-date" type="date" value={values.paid_at} onChange={(e) => set('paid_at', e.target.value)} />
          </Field>
        </div>

        <Field label="Référence" htmlFor="pay-ref" hint="numéro de virement, de chèque, de reçu…">
          <Input id="pay-ref" value={values.reference} onChange={(e) => set('reference', e.target.value)} maxLength={120} />
        </Field>

        <Field label="Notes" htmlFor="pay-notes">
          <Textarea id="pay-notes" rows={2} value={values.notes} onChange={(e) => set('notes', e.target.value)} maxLength={1000} />
        </Field>
      </div>
    </Modal>
  );
}
