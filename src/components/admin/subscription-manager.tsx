'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, ExternalLink, Pencil, Plus, RefreshCcwDot, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Field, Input, Select, Textarea, Switch } from '@/components/ui/field';
import { formatMoney, formatShortDate } from '@/lib/i18n/format';
import { useAction } from './use-resource-form';

/**
 * Recurring subscriptions.
 *
 * "Roll forward" both advances the renewal date and writes the charge as an
 * expense, which is what keeps recurring spend in the profit and loss without
 * anyone re-typing it twelve times a year. It only applies once the date has
 * actually been reached — the button is a record of something that happened, not
 * a way to move a date.
 */

export type SubscriptionRecord = {
  id: number;
  service_name: string;
  category: string;
  amount: number;
  currency: string;
  frequency: string;
  renewal_date: string | null;
  status: string;
  auto_renew: 0 | 1;
  url: string | null;
  notes: string | null;
  is_demo: 0 | 1;
  days_until: number | null;
};

const STATUS_TONES: Record<string, BadgeTone> = {
  active: 'success',
  paused: 'warning',
  cancelled: 'outline',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Actif',
  paused: 'En pause',
  cancelled: 'Résilié',
};

export function SubscriptionManager({
  csrf,
  subscriptions,
  categories,
  frequencies,
  currency,
  canCreate,
  canUpdate,
  canDelete,
}: {
  csrf: string;
  subscriptions: SubscriptionRecord[];
  categories: { key: string; label: string }[];
  frequencies: { key: string; label: string }[];
  currency: string;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const { run, busy } = useAction(csrf);
  const [editing, setEditing] = React.useState<SubscriptionRecord | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<SubscriptionRecord | null>(null);

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-4">
      {canCreate && (
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => setEditing('new')}>
            <Plus className="size-3.5" />
            Nouvel abonnement
          </Button>
        </div>
      )}

      {subscriptions.length === 0 ? (
        <Card>
          <CardBody className="py-8 text-center">
            <RefreshCcwDot className="mx-auto mb-2 size-5 text-fg-subtle" />
            <p className="text-[0.875rem] font-medium text-fg">Aucun abonnement</p>
            <p className="mx-auto mt-1 max-w-md text-[0.8125rem] leading-relaxed text-fg-muted">
              Les abonnements sont la dépense la plus facile à oublier : ils se renouvellent sans rien demander.
              Les lister ici donne leur coût réel et prévient avant chaque échéance.
            </p>
          </CardBody>
        </Card>
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {subscriptions.map((subscription) => {
            const due = subscription.renewal_date !== null && subscription.renewal_date <= today;
            const soon =
              subscription.days_until !== null && subscription.days_until >= 0 && subscription.days_until <= 7;

            return (
              <li
                key={subscription.id}
                className={cn(
                  'flex flex-col rounded-[var(--radius-card)] border border-line bg-surface-raised p-3.5',
                  subscription.status !== 'active' && 'opacity-60',
                  due && subscription.status === 'active' && 'border-warning/50',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2">
                      <span className="truncate text-[0.875rem] font-semibold text-fg">
                        {subscription.service_name}
                      </span>
                      {subscription.is_demo === 1 && <Badge tone="warning">DÉMO</Badge>}
                    </p>
                    <p className="truncate text-[0.6875rem] text-fg-subtle">
                      {categories.find((category) => category.key === subscription.category)?.label ??
                        subscription.category}
                      {' · '}
                      {frequencies.find((frequency) => frequency.key === subscription.frequency)?.label ??
                        subscription.frequency}
                      {subscription.auto_renew === 1 && subscription.status === 'active' && ' · reconduction auto'}
                    </p>
                  </div>
                  <Badge tone={STATUS_TONES[subscription.status] ?? 'neutral'}>
                    {STATUS_LABELS[subscription.status] ?? subscription.status}
                  </Badge>
                </div>

                <p className="mt-2 text-[0.9375rem] font-semibold tabular-nums text-fg">
                  {formatMoney(subscription.amount, subscription.currency)}
                </p>

                {subscription.renewal_date && (
                  <p
                    className={cn(
                      'mt-0.5 flex items-center gap-1 text-[0.75rem]',
                      due && subscription.status === 'active'
                        ? 'font-medium text-warning'
                        : soon
                          ? 'text-warning'
                          : 'text-fg-muted',
                    )}
                  >
                    {due && subscription.status === 'active' && <AlertTriangle className="size-3" />}
                    {due
                      ? 'Échéance atteinte'
                      : subscription.days_until !== null
                        ? `dans ${subscription.days_until} j`
                        : 'Renouvellement'}
                    {' — '}
                    {formatShortDate(subscription.renewal_date, 'fr')}
                  </p>
                )}

                {subscription.notes && (
                  <p className="mt-1.5 line-clamp-2 text-[0.75rem] text-fg-muted">{subscription.notes}</p>
                )}

                <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2.5">
                  {subscription.url ? (
                    <a
                      href={subscription.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 truncate text-[0.6875rem] text-fg-muted transition-colors hover:text-accent"
                    >
                      <ExternalLink className="size-2.5 shrink-0" />
                      Gérer le service
                    </a>
                  ) : (
                    <span />
                  )}

                  <span className="flex shrink-0 items-center gap-1">
                    {canUpdate && due && subscription.status === 'active' && subscription.auto_renew === 1 && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          run(`/api/abonnements/${subscription.id}`, {
                            method: 'PATCH',
                            body: { roll: true },
                            success: 'Renouvellement enregistré comme dépense.',
                          })
                        }
                        className="rounded-md px-1.5 py-1 text-[0.6875rem] font-medium text-accent transition-colors hover:bg-accent-soft"
                      >
                        Enregistrer le renouvellement
                      </button>
                    )}
                    {canUpdate && (
                      <button
                        type="button"
                        onClick={() => setEditing(subscription)}
                        aria-label={`Modifier ${subscription.service_name}`}
                        className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(subscription)}
                        aria-label={`Résilier ${subscription.service_name}`}
                        className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    )}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {editing !== null && (
        <SubscriptionModal
          csrf={csrf}
          subscription={editing === 'new' ? null : editing}
          categories={categories}
          frequencies={frequencies}
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
          await run(`/api/abonnements/${target.id}`, { method: 'DELETE', success: 'Abonnement résilié.' });
        }}
        title={`Résilier « ${confirmDelete?.service_name ?? ''} » ?`}
        message="L’abonnement passe en résilié et sa reconduction automatique est désactivée. Les dépenses déjà enregistrées restent dans les comptes."
        confirmLabel="Résilier"
        busy={busy}
      />
    </div>
  );
}

function SubscriptionModal({
  csrf,
  subscription,
  categories,
  frequencies,
  currency,
  onClose,
}: {
  csrf: string;
  subscription: SubscriptionRecord | null;
  categories: { key: string; label: string }[];
  frequencies: { key: string; label: string }[];
  currency: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { run, busy } = useAction(csrf);

  const [values, setValues] = React.useState({
    service_name: subscription?.service_name ?? '',
    category: subscription?.category ?? 'software',
    amount: subscription ? String(subscription.amount) : '',
    currency: subscription?.currency ?? currency,
    frequency: subscription?.frequency ?? 'monthly',
    renewal_date: subscription?.renewal_date ?? '',
    status: subscription?.status ?? 'active',
    auto_renew: subscription ? subscription.auto_renew === 1 : true,
    url: subscription?.url ?? '',
    notes: subscription?.notes ?? '',
  });

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  const valid = values.service_name.trim().length >= 2;

  return (
    <Modal
      open
      onClose={onClose}
      title={subscription ? 'Modifier l’abonnement' : 'Nouvel abonnement'}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={busy || !valid}
            onClick={async () => {
              const payload = {
                service_name: values.service_name.trim(),
                category: values.category,
                amount: Number(values.amount) || 0,
                currency: values.currency,
                frequency: values.frequency,
                renewal_date: values.renewal_date || null,
                status: values.status,
                auto_renew: values.auto_renew,
                url: values.url.trim() || null,
                notes: values.notes.trim() || null,
              };

              const result = subscription
                ? await run(`/api/abonnements/${subscription.id}`, {
                    method: 'PATCH',
                    body: payload,
                    success: 'Abonnement enregistré.',
                  })
                : await run('/api/abonnements', { body: payload, success: 'Abonnement ajouté.' });

              if (result) {
                router.refresh();
                onClose();
              }
            }}
          >
            {subscription ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Service" htmlFor="sb-name" required className="sm:col-span-2">
          <Input
            id="sb-name"
            value={values.service_name}
            onChange={(event) => set('service_name', event.target.value)}
            maxLength={160}
            autoFocus
            placeholder="Hébergement, nom de domaine, licence…"
          />
        </Field>

        <Field label="Catégorie" htmlFor="sb-category">
          <Select id="sb-category" value={values.category} onChange={(event) => set('category', event.target.value)}>
            {categories.map((category) => (
              <option key={category.key} value={category.key}>
                {category.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Cycle" htmlFor="sb-frequency">
          <Select id="sb-frequency" value={values.frequency} onChange={(event) => set('frequency', event.target.value)}>
            {frequencies.map((frequency) => (
              <option key={frequency.key} value={frequency.key}>
                {frequency.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label={`Montant par cycle (${values.currency})`} htmlFor="sb-amount">
          <Input
            id="sb-amount"
            type="number"
            min={0}
            step="0.01"
            value={values.amount}
            onChange={(event) => set('amount', event.target.value)}
            className="tabular-nums"
          />
        </Field>

        <Field label="Prochaine échéance" htmlFor="sb-renewal">
          <Input
            id="sb-renewal"
            type="date"
            value={values.renewal_date}
            onChange={(event) => set('renewal_date', event.target.value)}
          />
        </Field>

        <Field label="Statut" htmlFor="sb-status">
          <Select id="sb-status" value={values.status} onChange={(event) => set('status', event.target.value)}>
            <option value="active">Actif</option>
            <option value="paused">En pause</option>
            <option value="cancelled">Résilié</option>
          </Select>
        </Field>

        <Field label="Adresse du service" htmlFor="sb-url">
          <Input
            id="sb-url"
            value={values.url}
            onChange={(event) => set('url', event.target.value)}
            maxLength={300}
            placeholder="https://…"
          />
        </Field>

        <Field label="Notes" htmlFor="sb-notes" className="sm:col-span-2">
          <Textarea
            id="sb-notes"
            rows={2}
            value={values.notes}
            onChange={(event) => set('notes', event.target.value)}
            maxLength={2000}
          />
        </Field>

        <div className="flex items-start justify-between gap-4 rounded-lg bg-surface-sunken px-3 py-2.5 sm:col-span-2">
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-medium text-fg">Reconduction automatique</p>
            <p className="mt-0.5 text-[0.75rem] leading-relaxed text-fg-muted">
              Permet d’enregistrer le renouvellement en un clic à l’échéance : la date avance d’un cycle et la
              dépense est écrite dans les comptes.
            </p>
          </div>
          <Switch
            checked={values.auto_renew}
            onChange={(next) => set('auto_renew', next)}
            label={values.auto_renew ? 'Oui' : 'Non'}
          />
        </div>
      </div>
    </Modal>
  );
}
