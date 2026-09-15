'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Paperclip, Pencil, Plus, Receipt, RefreshCw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { TableWrap, Table, Thead, Th, Tbody, Tr, Td, TableEmpty } from '@/components/ui/table';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Field, Input, Select, Textarea, Switch } from '@/components/ui/field';
import { formatMoney, formatShortDate } from '@/lib/i18n/format';
import { useAction } from './use-resource-form';

/**
 * Expenses.
 *
 * The per-category breakdown sits above the list because that is the question
 * being asked: not "what did I buy on the 14th" but "where does the money go".
 * A receipt links to the library rather than being uploaded here — one invoice
 * often covers several lines, and files belong in one place.
 */

export type ExpenseRecord = {
  id: number;
  label: string;
  category: string;
  amount: number;
  currency: string;
  spent_at: string | null;
  supplier: string | null;
  project_id: number | null;
  project_title: string | null;
  receipt_file_id: number | null;
  receipt_name: string | null;
  is_recurring: 0 | 1;
  is_demo: 0 | 1;
  notes: string | null;
};

export type CategoryTotal = { category: string; label: string; total: number; count: number };
export type Option = { value: string; label: string };

export function ExpenseManager({
  csrf,
  expenses,
  byCategory,
  categories,
  projects,
  currency,
  canCreate,
  canUpdate,
  canDelete,
}: {
  csrf: string;
  expenses: ExpenseRecord[];
  byCategory: CategoryTotal[];
  categories: { key: string; label: string }[];
  projects: Option[];
  currency: string;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const { run, busy } = useAction(csrf);
  const [editing, setEditing] = React.useState<ExpenseRecord | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<ExpenseRecord | null>(null);

  const periodTotal = byCategory.reduce((total, entry) => total + entry.total, 0);

  return (
    <div className="space-y-4">
      {byCategory.length > 0 && (
        <Card>
          <CardBody>
            <ul className="space-y-2">
              {byCategory.map((entry) => {
                const share = periodTotal > 0 ? Math.round((entry.total / periodTotal) * 100) : 0;
                return (
                  <li key={entry.category}>
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <span className="text-[0.8125rem] text-fg">{entry.label}</span>
                      <span className="text-[0.75rem] tabular-nums text-fg-muted">
                        {formatMoney(entry.total, currency)}
                        <span className="ms-1.5 text-fg-subtle">{share}%</span>
                      </span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-surface-sunken">
                      <div className="h-full rounded-full bg-accent" style={{ width: `${share}%` }} />
                    </div>
                  </li>
                );
              })}
            </ul>
          </CardBody>
        </Card>
      )}

      {canCreate && (
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => setEditing('new')}>
            <Plus className="size-3.5" />
            Nouvelle dépense
          </Button>
        </div>
      )}

      <TableWrap>
        <Table>
          <Thead>
            <tr>
              <Th>Dépense</Th>
              <Th>Catégorie</Th>
              <Th>Projet</Th>
              <Th>Date</Th>
              <Th alignment="end">Montant</Th>
              <Th alignment="end">Actions</Th>
            </tr>
          </Thead>
          <Tbody>
            {expenses.length === 0 ? (
              <TableEmpty colSpan={6}>
                Aucune dépense sur cette période. Enregistrer ses charges est ce qui rend le résultat net
                exploitable.
              </TableEmpty>
            ) : (
              expenses.map((expense) => (
                <Tr key={expense.id}>
                  <Td>
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium text-fg">{expense.label}</span>
                      {expense.is_recurring === 1 && (
                        <RefreshCw className="size-3 shrink-0 text-fg-subtle" aria-label="Récurrente" />
                      )}
                      {expense.is_demo === 1 && <Badge tone="warning">DÉMO</Badge>}
                    </span>
                    {expense.supplier && (
                      <span className="block truncate text-[0.6875rem] text-fg-subtle">{expense.supplier}</span>
                    )}
                  </Td>
                  <Td className="text-[0.8125rem] text-fg-muted">
                    {categories.find((category) => category.key === expense.category)?.label ?? expense.category}
                  </Td>
                  <Td className="text-[0.8125rem] text-fg-muted">
                    {expense.project_id ? (
                      <Link
                        href={`/espace-admin/projets/${expense.project_id}`}
                        className="transition-colors hover:text-accent"
                      >
                        {expense.project_title}
                      </Link>
                    ) : (
                      <span className="text-fg-subtle">—</span>
                    )}
                  </Td>
                  <Td className="whitespace-nowrap text-[0.75rem] text-fg-muted">
                    {expense.spent_at ? formatShortDate(expense.spent_at, 'fr') : '—'}
                  </Td>
                  <Td alignment="end" className="whitespace-nowrap tabular-nums font-medium text-fg">
                    {formatMoney(expense.amount, expense.currency)}
                  </Td>
                  <Td alignment="end">
                    <span className="flex items-center justify-end gap-1">
                      {expense.receipt_file_id && (
                        <a
                          href={`/api/fichiers/${expense.receipt_file_id}/telecharger`}
                          title={expense.receipt_name ?? 'Justificatif'}
                          aria-label="Ouvrir le justificatif"
                          className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                        >
                          <Paperclip className="size-3.5" />
                        </a>
                      )}
                      {canUpdate && (
                        <button
                          type="button"
                          onClick={() => setEditing(expense)}
                          aria-label={`Modifier ${expense.label}`}
                          className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                        >
                          <Pencil className="size-3.5" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(expense)}
                          aria-label={`Supprimer ${expense.label}`}
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

      {editing !== null && (
        <ExpenseModal
          csrf={csrf}
          expense={editing === 'new' ? null : editing}
          categories={categories}
          projects={projects}
          currency={currency}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          const target = confirmDelete;
          setConfirmDelete(null);
          if (!target) return;
          await run(`/api/depenses/${target.id}`, { method: 'DELETE', success: 'Dépense supprimée.' });
        }}
        title="Supprimer cette dépense ?"
        message="Elle disparaît du résultat et des statistiques. Le justificatif reste dans la bibliothèque de fichiers."
        confirmLabel="Supprimer"
        busy={busy}
      />
    </div>
  );
}

function ExpenseModal({
  csrf,
  expense,
  categories,
  projects,
  currency,
  onClose,
}: {
  csrf: string;
  expense: ExpenseRecord | null;
  categories: { key: string; label: string }[];
  projects: Option[];
  currency: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { run, busy } = useAction(csrf);

  const [values, setValues] = React.useState({
    label: expense?.label ?? '',
    category: expense?.category ?? 'software',
    amount: expense ? String(expense.amount) : '',
    currency: expense?.currency ?? currency,
    spent_at: expense?.spent_at ?? new Date().toISOString().slice(0, 10),
    supplier: expense?.supplier ?? '',
    project_id: expense?.project_id !== null && expense?.project_id !== undefined ? String(expense.project_id) : '',
    is_recurring: expense ? expense.is_recurring === 1 : false,
    notes: expense?.notes ?? '',
  });

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  const amount = Number(values.amount);
  const valid = values.label.trim().length >= 2 && Number.isFinite(amount) && amount > 0;

  return (
    <Modal
      open
      onClose={onClose}
      title={expense ? 'Modifier la dépense' : 'Nouvelle dépense'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={busy || !valid}
            onClick={async () => {
              const payload = {
                label: values.label.trim(),
                category: values.category,
                amount,
                currency: values.currency,
                spent_at: values.spent_at || null,
                supplier: values.supplier.trim() || null,
                project_id: values.project_id ? Number(values.project_id) : null,
                is_recurring: values.is_recurring,
                notes: values.notes.trim() || null,
              };

              const result = expense
                ? await run(`/api/depenses/${expense.id}`, {
                    method: 'PATCH',
                    body: payload,
                    success: 'Dépense enregistrée.',
                  })
                : await run('/api/depenses', { body: payload, success: 'Dépense enregistrée.' });

              if (result) {
                router.refresh();
                onClose();
              }
            }}
          >
            {expense ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Libellé" htmlFor="ex-label" required className="sm:col-span-2">
          <Input
            id="ex-label"
            value={values.label}
            onChange={(event) => set('label', event.target.value)}
            maxLength={200}
            autoFocus
            placeholder="Abonnement hébergement — mars"
          />
        </Field>

        <Field label="Catégorie" htmlFor="ex-category">
          <Select id="ex-category" value={values.category} onChange={(event) => set('category', event.target.value)}>
            {categories.map((category) => (
              <option key={category.key} value={category.key}>
                {category.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={`Montant (${values.currency})`} htmlFor="ex-amount" required>
          <Input
            id="ex-amount"
            type="number"
            min={0}
            step="0.01"
            value={values.amount}
            onChange={(event) => set('amount', event.target.value)}
            className="tabular-nums"
          />
        </Field>

        <Field label="Date" htmlFor="ex-date">
          <Input
            id="ex-date"
            type="date"
            value={values.spent_at}
            onChange={(event) => set('spent_at', event.target.value)}
          />
        </Field>

        <Field label="Fournisseur" htmlFor="ex-supplier">
          <Input
            id="ex-supplier"
            value={values.supplier}
            onChange={(event) => set('supplier', event.target.value)}
            maxLength={160}
          />
        </Field>

        <Field
          label="Projet"
          htmlFor="ex-project"
          hint="Rattacher une dépense à un projet permet de voir sa marge réelle."
          className="sm:col-span-2"
        >
          <Select id="ex-project" value={values.project_id} onChange={(event) => set('project_id', event.target.value)}>
            <option value="">Aucun — charge générale</option>
            {projects.map((project) => (
              <option key={project.value} value={project.value}>
                {project.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Notes" htmlFor="ex-notes" className="sm:col-span-2">
          <Textarea
            id="ex-notes"
            rows={2}
            value={values.notes}
            onChange={(event) => set('notes', event.target.value)}
            maxLength={2000}
          />
        </Field>

        <div className="flex items-start justify-between gap-4 rounded-lg bg-surface-sunken px-3 py-2.5 sm:col-span-2">
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-medium text-fg">Dépense récurrente</p>
            <p className="mt-0.5 text-[0.75rem] leading-relaxed text-fg-muted">
              Pour un renouvellement automatique avec rappel, créez plutôt un abonnement — il générera la dépense à
              chaque échéance.
            </p>
          </div>
          <Switch
            checked={values.is_recurring}
            onChange={(next) => set('is_recurring', next)}
            label={values.is_recurring ? 'Oui' : 'Non'}
          />
        </div>

        {!expense && (
          <p className="flex items-start gap-1.5 text-[0.75rem] text-fg-subtle sm:col-span-2">
            <Receipt className="mt-0.5 size-3 shrink-0" />
            Pour joindre un justificatif, déposez-le d’abord dans la bibliothèque de fichiers puis rattachez-le
            depuis la fiche de la dépense.
          </p>
        )}
      </div>
    </Modal>
  );
}
