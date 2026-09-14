'use client';

import * as React from 'react';
import { GripVertical, Plus, Save, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/modal';
import { useResourceForm } from './use-resource-form';
import { computeTotals, lineTotal } from '@/lib/money';
import { formatMoney } from '@/lib/i18n/format';

/**
 * Quote / invoice editor.
 *
 * One component for both because they are the same document with a different
 * header and lifecycle: same line items, same discount and VAT rules, same
 * totals. Totals are previewed with `computeTotals` — the exact function the
 * server uses to persist them — so what the screen shows and what gets stored
 * cannot drift.
 *
 * Amounts on an issued invoice are refused by the API (409). The form reflects
 * that by locking the lines rather than letting the user discover it on save.
 */

export type DocumentKind = 'quote' | 'invoice';

export type LineDraft = {
  /** Local key only; never sent. */
  uid: string;
  service_id: string;
  label: string;
  description: string;
  quantity: string;
  unit: string;
  unit_price: string;
  discount: string;
};

export type DocumentValues = {
  client_id: string;
  project_id: string;
  title: string;
  currency: string;
  status: string;
  issue_date: string;
  /** valid_until for a quote, due_date for an invoice. */
  end_date: string;
  discount_type: string;
  discount_value: string;
  tax_rate: string;
  payment_terms: string;
  delivery_terms: string;
  conditions: string;
  notes: string;
  locale: string;
  kind: string;
  items: LineDraft[];
};

/**
 * A blank line.
 *
 * Not exported: a server page must not call it. The `uid` is random, so
 * generating it during a server render would also risk a hydration mismatch —
 * a new document simply passes `items: []` and the form seeds the first line.
 */
function newLine(defaults?: Partial<LineDraft>): LineDraft {
  return {
    uid: `l${Math.random().toString(36).slice(2, 9)}`,
    service_id: '', label: '', description: '',
    quantity: '1', unit: 'forfait', unit_price: '', discount: '0',
    ...defaults,
  };
}

const QUOTE_STATUSES = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'sent', label: 'Envoyé' },
  { value: 'accepted', label: 'Accepté' },
  { value: 'refused', label: 'Refusé' },
  { value: 'expired', label: 'Expiré' },
  { value: 'archived', label: 'Archivé' },
];

const INVOICE_STATUSES = [
  { value: 'draft', label: 'Brouillon' },
  { value: 'sent', label: 'Envoyée' },
  { value: 'partially_paid', label: 'Partiellement payée' },
  { value: 'paid', label: 'Payée' },
  { value: 'overdue', label: 'En retard' },
  { value: 'cancelled', label: 'Annulée' },
];

const INVOICE_KINDS = [
  { value: 'standard', label: 'Standard' },
  { value: 'deposit', label: 'Acompte' },
  { value: 'revision_extra', label: 'Révision supplémentaire' },
  { value: 'final', label: 'Solde' },
];

const CURRENCIES = ['DZD', 'EUR', 'USD', 'MAD', 'TND', 'GBP'];

export function DocumentForm({
  kind,
  csrf,
  documentId,
  initial,
  clients,
  projects,
  services,
  canDelete = false,
  /** Amount fields are locked once the document leaves draft. */
  amountsLocked = false,
}: {
  kind: DocumentKind;
  csrf: string;
  documentId?: number;
  initial: DocumentValues;
  clients: { id: number; label: string; currency: string }[];
  projects: { id: number; label: string; client_id: number | null; currency: string }[];
  services: { id: number; name: string; starting_price: number | null; currency: string }[];
  canDelete?: boolean;
  amountsLocked?: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const base = kind === 'quote' ? '/api/devis' : '/api/factures';
  const listPath = kind === 'quote' ? '/espace-admin/devis' : '/espace-admin/factures';

  const form = useResourceForm<DocumentValues>({
    // A new document arrives with no lines; start it on one blank row.
    initial: initial.items.length > 0 ? initial : { ...initial, items: [newLine()] },
    endpoint: documentId ? `${base}/${documentId}` : base,
    method: documentId ? 'PATCH' : 'POST',
    csrf,
    successMessage: documentId
      ? kind === 'quote' ? 'Devis enregistré.' : 'Facture enregistrée.'
      : kind === 'quote' ? 'Devis créé.' : 'Facture créée.',
    redirectTo: documentId ? undefined : (payload) => `${listPath}/${payload.id}`,
    deleteEndpoint: documentId ? `${base}/${documentId}` : undefined,
    deleteRedirectTo: listPath,
    transform: (values) => ({
      client_id: values.client_id ? Number(values.client_id) : null,
      project_id: values.project_id ? Number(values.project_id) : null,
      title: values.title || null,
      status: values.status,
      currency: values.currency,
      discount_type: values.discount_type,
      discount_value: Number(values.discount_value) || 0,
      tax_rate: Number(values.tax_rate) || 0,
      issue_date: values.issue_date || null,
      notes: values.notes || null,
      locale: values.locale,
      payment_terms: values.payment_terms || null,
      ...(kind === 'quote'
        ? {
            valid_until: values.end_date || null,
            delivery_terms: values.delivery_terms || null,
            conditions: values.conditions || null,
          }
        : { due_date: values.end_date || null, kind: values.kind }),
      items: values.items
        // An untitled line is an empty row the user left behind, not data.
        .filter((line) => line.label.trim() !== '')
        .map((line) => ({
          service_id: line.service_id ? Number(line.service_id) : null,
          label: line.label.trim(),
          description: line.description || null,
          quantity: Number(line.quantity) || 0,
          unit: line.unit || 'forfait',
          unit_price: Number(line.unit_price) || 0,
          discount: Number(line.discount) || 0,
        })),
    }),
  });

  const { values, set, fieldErrors } = form;

  const setLine = (uid: string, patch: Partial<LineDraft>) =>
    set(
      'items',
      values.items.map((line) => (line.uid === uid ? { ...line, ...patch } : line)),
    );

  const addLine = () => set('items', [...values.items, newLine()]);

  const removeLine = (uid: string) =>
    set('items', values.items.length === 1 ? [newLine()] : values.items.filter((line) => line.uid !== uid));

  const moveLine = (uid: string, delta: number) => {
    const index = values.items.findIndex((line) => line.uid === uid);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= values.items.length) return;
    const next = [...values.items];
    [next[index], next[target]] = [next[target], next[index]];
    set('items', next);
  };

  /** Picking a service fills the label and the starting price as a first draft. */
  const applyService = (uid: string, serviceId: string) => {
    const service = services.find((entry) => String(entry.id) === serviceId);
    setLine(uid, {
      service_id: serviceId,
      ...(service
        ? {
            label: service.name,
            unit_price: service.starting_price !== null ? String(service.starting_price) : '',
          }
        : {}),
    });
  };

  const onClientChange = (clientId: string) => {
    set('client_id', clientId);
    const client = clients.find((entry) => String(entry.id) === clientId);
    if (client?.currency) set('currency', client.currency);
  };

  const onProjectChange = (projectId: string) => {
    set('project_id', projectId);
    const project = projects.find((entry) => String(entry.id) === projectId);
    if (!project) return;
    if (project.client_id) onClientChange(String(project.client_id));
    if (project.currency) set('currency', project.currency);
  };

  // Same function the server persists with, so the preview is authoritative.
  const totals = computeTotals(
    values.items.map((line) => ({
      quantity: Number(line.quantity) || 0,
      unit_price: Number(line.unit_price) || 0,
      discount: Number(line.discount) || 0,
    })),
    {
      discountType: values.discount_type as 'none' | 'percent' | 'amount',
      discountValue: Number(values.discount_value) || 0,
      taxRate: Number(values.tax_rate) || 0,
    },
  );

  const hasLines = values.items.some((line) => line.label.trim() !== '');
  const statuses = kind === 'quote' ? QUOTE_STATUSES : INVOICE_STATUSES;

  return (
    <form onSubmit={form.submit} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Destinataire</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 pt-3 sm:grid-cols-2">
          <Field label="Client" htmlFor="d-client" error={fieldErrors.client_id}>
            <Select id="d-client" value={values.client_id} onChange={(e) => onClientChange(e.target.value)}>
              <option value="">Aucun client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Projet" htmlFor="d-project">
            <Select id="d-project" value={values.project_id} onChange={(e) => onProjectChange(e.target.value)}>
              <option value="">Aucun projet</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Objet" htmlFor="d-title" className="sm:col-span-2" error={fieldErrors.title}>
            <Input
              id="d-title"
              value={values.title}
              onChange={(e) => set('title', e.target.value)}
              maxLength={200}
              placeholder={kind === 'quote' ? 'Refonte du site vitrine' : 'Prestation de développement'}
            />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Prestations</CardTitle>
        </CardHeader>
        <CardBody className="space-y-3 pt-3">
          {amountsLocked && (
            <p className="rounded-lg bg-warning-soft px-3 py-2.5 text-[0.75rem] leading-relaxed text-warning">
              Ce document a été émis : les montants sont verrouillés pour préserver la piste comptable.
              Pour corriger une erreur, annulez cette facture et créez-en une nouvelle.
            </p>
          )}

          <ul className="space-y-3">
            {values.items.map((line, index) => (
              <li
                key={line.uid}
                className="rounded-lg border border-line bg-surface-sunken/40 p-3"
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="flex size-5 items-center justify-center rounded bg-surface-raised text-[0.625rem] font-semibold tabular-nums text-fg-subtle">
                    {index + 1}
                  </span>
                  {!amountsLocked && (
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveLine(line.uid, -1)}
                        disabled={index === 0}
                        aria-label="Monter la ligne"
                        className="rounded p-0.5 text-fg-subtle transition-colors hover:text-fg disabled:opacity-30"
                      >
                        <GripVertical className="size-3.5 rotate-180" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveLine(line.uid, 1)}
                        disabled={index === values.items.length - 1}
                        aria-label="Descendre la ligne"
                        className="rounded p-0.5 text-fg-subtle transition-colors hover:text-fg disabled:opacity-30"
                      >
                        <GripVertical className="size-3.5" />
                      </button>
                    </div>
                  )}
                  <span className="ms-auto text-[0.8125rem] font-semibold tabular-nums text-fg">
                    {formatMoney(
                      lineTotal({
                        quantity: Number(line.quantity) || 0,
                        unit_price: Number(line.unit_price) || 0,
                        discount: Number(line.discount) || 0,
                      }),
                      values.currency,
                    )}
                  </span>
                  {!amountsLocked && (
                    <button
                      type="button"
                      onClick={() => removeLine(line.uid)}
                      aria-label={`Supprimer la ligne ${index + 1}`}
                      className="rounded p-0.5 text-fg-subtle transition-colors hover:text-danger"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>

                <div className="grid gap-2.5 sm:grid-cols-12">
                  {services.length > 0 && !amountsLocked && (
                    <div className="sm:col-span-12">
                      <Select
                        value={line.service_id}
                        onChange={(e) => applyService(line.uid, e.target.value)}
                        aria-label="Prestation du catalogue"
                        className="h-8 text-[0.75rem]"
                      >
                        <option value="">Depuis le catalogue…</option>
                        {services.map((service) => (
                          <option key={service.id} value={service.id}>
                            {service.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  )}

                  <div className="sm:col-span-12">
                    <Input
                      value={line.label}
                      onChange={(e) => setLine(line.uid, { label: e.target.value })}
                      placeholder="Libellé de la prestation"
                      aria-label={`Libellé de la ligne ${index + 1}`}
                      maxLength={240}
                      disabled={amountsLocked}
                      className="h-9"
                    />
                  </div>

                  <div className="sm:col-span-12">
                    <Textarea
                      value={line.description}
                      onChange={(e) => setLine(line.uid, { description: e.target.value })}
                      rows={2}
                      placeholder="Détail (optionnel)"
                      aria-label={`Détail de la ligne ${index + 1}`}
                      maxLength={1000}
                      disabled={amountsLocked}
                      className="text-[0.8125rem]"
                    />
                  </div>

                  <div className="sm:col-span-3">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.quantity}
                      onChange={(e) => setLine(line.uid, { quantity: e.target.value })}
                      aria-label={`Quantité de la ligne ${index + 1}`}
                      disabled={amountsLocked}
                      className="h-9 tabular-nums"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <Input
                      value={line.unit}
                      onChange={(e) => setLine(line.uid, { unit: e.target.value })}
                      placeholder="unité"
                      aria-label={`Unité de la ligne ${index + 1}`}
                      maxLength={40}
                      disabled={amountsLocked}
                      className="h-9"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.unit_price}
                      onChange={(e) => setLine(line.uid, { unit_price: e.target.value })}
                      placeholder="prix unitaire"
                      aria-label={`Prix unitaire de la ligne ${index + 1}`}
                      disabled={amountsLocked}
                      className="h-9 tabular-nums"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step="1"
                      value={line.discount}
                      onChange={(e) => setLine(line.uid, { discount: e.target.value })}
                      placeholder="% remise"
                      aria-label={`Remise de la ligne ${index + 1} en pourcentage`}
                      disabled={amountsLocked}
                      className="h-9 tabular-nums"
                    />
                  </div>
                </div>
              </li>
            ))}
          </ul>

          {!amountsLocked && (
            <Button type="button" variant="secondary" size="sm" onClick={addLine}>
              <Plus className="size-3.5" />
              Ajouter une ligne
            </Button>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Remise & TVA</CardTitle>
          </CardHeader>
          <CardBody className="grid gap-4 pt-3 sm:grid-cols-2">
            <Field label="Type de remise" htmlFor="d-discount-type">
              <Select
                id="d-discount-type"
                value={values.discount_type}
                onChange={(e) => set('discount_type', e.target.value)}
                disabled={amountsLocked}
              >
                <option value="none">Aucune</option>
                <option value="percent">Pourcentage</option>
                <option value="amount">Montant fixe</option>
              </Select>
            </Field>
            <Field
              label={values.discount_type === 'percent' ? 'Remise (%)' : `Remise (${values.currency})`}
              htmlFor="d-discount-value"
            >
              <Input
                id="d-discount-value"
                type="number"
                min={0}
                step="0.01"
                value={values.discount_value}
                onChange={(e) => set('discount_value', e.target.value)}
                disabled={amountsLocked || values.discount_type === 'none'}
                className="tabular-nums"
              />
            </Field>
            <Field label="TVA (%)" htmlFor="d-tax" hint="0 si non assujetti">
              <Input
                id="d-tax"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={values.tax_rate}
                onChange={(e) => set('tax_rate', e.target.value)}
                disabled={amountsLocked}
                className="tabular-nums"
              />
            </Field>
            <Field label="Devise" htmlFor="d-currency">
              <Select
                id="d-currency"
                value={values.currency}
                onChange={(e) => set('currency', e.target.value)}
                disabled={amountsLocked}
              >
                {CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </Select>
            </Field>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Total</CardTitle>
          </CardHeader>
          <CardBody className="pt-3">
            <dl className="space-y-2 text-[0.8125rem]">
              <Row label="Sous-total" value={formatMoney(totals.subtotal, values.currency)} />
              {totals.discount_total > 0 && (
                <Row label="Remise" value={`− ${formatMoney(totals.discount_total, values.currency)}`} />
              )}
              {Number(values.tax_rate) > 0 && (
                <>
                  <Row label="Base imposable" value={formatMoney(totals.taxable_base, values.currency)} />
                  <Row label={`TVA ${values.tax_rate} %`} value={formatMoney(totals.tax_total, values.currency)} />
                </>
              )}
              <div className="flex items-center justify-between border-t border-line pt-2.5">
                <dt className="text-[0.875rem] font-semibold text-fg">Total</dt>
                <dd className="text-[1.125rem] font-semibold tabular-nums text-fg">
                  {formatMoney(totals.total, values.currency)}
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Dates & conditions</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 pt-3 sm:grid-cols-2">
          <Field label="Statut" htmlFor="d-status">
            <Select id="d-status" value={values.status} onChange={(e) => set('status', e.target.value)}>
              {statuses.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </Select>
          </Field>

          {kind === 'invoice' && (
            <Field label="Type de facture" htmlFor="d-kind">
              <Select id="d-kind" value={values.kind} onChange={(e) => set('kind', e.target.value)}>
                {INVOICE_KINDS.map((entry) => (
                  <option key={entry.value} value={entry.value}>
                    {entry.label}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Date d’émission" htmlFor="d-issue">
            <Input id="d-issue" type="date" value={values.issue_date} onChange={(e) => set('issue_date', e.target.value)} />
          </Field>
          <Field
            label={kind === 'quote' ? 'Valable jusqu’au' : 'Échéance de paiement'}
            htmlFor="d-end"
            error={fieldErrors.valid_until ?? fieldErrors.due_date}
          >
            <Input id="d-end" type="date" value={values.end_date} onChange={(e) => set('end_date', e.target.value)} />
          </Field>

          <Field label="Langue du document" htmlFor="d-locale" hint="détermine la langue du PDF">
            <Select id="d-locale" value={values.locale} onChange={(e) => set('locale', e.target.value)}>
              <option value="fr">Français</option>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </Select>
          </Field>

          <Field label="Conditions de paiement" htmlFor="d-payment" className="sm:col-span-2">
            <Textarea
              id="d-payment"
              rows={2}
              value={values.payment_terms}
              onChange={(e) => set('payment_terms', e.target.value)}
              maxLength={1000}
            />
          </Field>

          {kind === 'quote' && (
            <>
              <Field label="Conditions de livraison" htmlFor="d-delivery" className="sm:col-span-2">
                <Textarea
                  id="d-delivery"
                  rows={2}
                  value={values.delivery_terms}
                  onChange={(e) => set('delivery_terms', e.target.value)}
                  maxLength={1000}
                />
              </Field>
              <Field label="Conditions générales" htmlFor="d-conditions" className="sm:col-span-2">
                <Textarea
                  id="d-conditions"
                  rows={3}
                  value={values.conditions}
                  onChange={(e) => set('conditions', e.target.value)}
                  maxLength={4000}
                />
              </Field>
            </>
          )}

          <Field label="Notes internes" htmlFor="d-notes" className="sm:col-span-2" hint="jamais imprimées sur le PDF">
            <Textarea id="d-notes" rows={2} value={values.notes} onChange={(e) => set('notes', e.target.value)} maxLength={4000} />
          </Field>
        </CardBody>
      </Card>

      {form.error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2.5 text-[0.8125rem] font-medium text-danger" role="alert">
          {form.error}
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Button type="submit" disabled={form.busy || !hasLines}>
          <Save className="size-4" />
          {form.busy ? 'Enregistrement…' : documentId ? 'Enregistrer' : 'Créer'}
        </Button>

        {!hasLines && <span className="text-[0.75rem] text-fg-subtle">Ajoutez au moins une prestation</span>}
        {form.dirty && hasLines && <span className="text-[0.75rem] text-warning">Modifications non enregistrées</span>}

        {canDelete && documentId && (
          <Button
            type="button"
            variant="ghost"
            className="ms-auto text-danger hover:bg-danger-soft"
            onClick={() => setConfirmDelete(true)}
            disabled={form.deleting}
          >
            <Trash2 className="size-4" />
            {kind === 'quote' ? 'Supprimer' : 'Annuler la facture'}
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          await form.remove();
        }}
        title={kind === 'quote' ? 'Supprimer ce devis ?' : 'Annuler cette facture ?'}
        message={
          kind === 'quote'
            ? 'Un devis déjà envoyé sera archivé plutôt que supprimé, afin de conserver l’historique commercial.'
            : 'Une facture émise n’est jamais supprimée : elle est annulée, en conservant son numéro dans la séquence comptable.'
        }
        confirmLabel={kind === 'quote' ? 'Supprimer' : 'Annuler la facture'}
        busy={form.deleting}
      />
    </form>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className={cn('flex items-center justify-between')}>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="tabular-nums text-fg">{value}</dd>
    </div>
  );
}
