'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Building2, GripVertical, Mail, Phone, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Select } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea } from '@/components/ui/field';
import { useAction } from './use-resource-form';
import { formatMoney, formatRelative } from '@/lib/i18n/format';
import type { LeadStage } from '@/lib/db/types';

/**
 * Sales pipeline board.
 *
 * Same interaction model as the task kanban — HTML5 drag & drop with a `<select>`
 * fallback on every card — because the two are the same gesture and should not
 * behave differently. Moving to "Perdu" asks for a reason, since that is the one
 * field the pipeline report actually needs afterwards.
 */

export type PipelineLead = {
  id: number;
  name: string;
  company: string | null;
  email: string | null;
  phone: string | null;
  stage: LeadStage;
  source: string;
  score: number;
  estimated_value: number;
  currency: string;
  service_interest: string | null;
  created_at: string;
  is_demo: 0 | 1;
  client_id: number | null;
};

export type PipelineColumnData = {
  stage: LeadStage;
  label: string;
  count: number;
  value: number;
  leads: PipelineLead[];
};

const STAGE_ACCENTS: Record<string, string> = {
  new: 'border-t-ink-400',
  contacted: 'border-t-info',
  qualified: 'border-t-accent',
  proposal: 'border-t-warning',
  negotiation: 'border-t-warning',
  won: 'border-t-success',
  lost: 'border-t-danger',
};

/** Score bands, so a colour always means the same thing across the admin. */
function scoreTone(score: number): 'success' | 'warning' | 'neutral' {
  if (score >= 70) return 'success';
  if (score >= 40) return 'warning';
  return 'neutral';
}

export function LeadPipeline({
  csrf,
  columns: initialColumns,
  currency,
  canUpdate,
  canCreate,
}: {
  csrf: string;
  columns: PipelineColumnData[];
  currency: string;
  canUpdate: boolean;
  canCreate: boolean;
}) {
  const router = useRouter();
  const { run } = useAction(csrf);
  const [columns, setColumns] = React.useState(initialColumns);
  const [dragging, setDragging] = React.useState<number | null>(null);
  const [dragOver, setDragOver] = React.useState<LeadStage | null>(null);
  const [losing, setLosing] = React.useState<PipelineLead | null>(null);
  const [creating, setCreating] = React.useState<LeadStage | null>(null);

  React.useEffect(() => setColumns(initialColumns), [initialColumns]);

  const move = React.useCallback(
    async (leadId: number, target: LeadStage, lostReason?: string) => {
      const source = columns.find((column) => column.leads.some((lead) => lead.id === leadId));
      const lead = source?.leads.find((l) => l.id === leadId);
      if (!lead || !source || source.stage === target) return;

      const previous = columns;

      setColumns((current) =>
        current.map((column) => {
          if (column.stage === source.stage) {
            const leads = column.leads.filter((l) => l.id !== leadId);
            return { ...column, leads, count: leads.length, value: sum(leads) };
          }
          if (column.stage === target) {
            const leads = [{ ...lead, stage: target }, ...column.leads];
            return { ...column, leads, count: leads.length, value: sum(leads) };
          }
          return column;
        }),
      );

      const result = await run(`/api/prospects/${leadId}`, {
        method: 'PUT',
        body: { stage: target, lost_reason: lostReason ?? null },
        silent: true,
      });

      if (!result) setColumns(previous);
      else router.refresh();
    },
    [columns, router, run],
  );

  const requestMove = (lead: PipelineLead, target: LeadStage) => {
    // "Lost" without a reason is a hole in the pipeline report, so ask first.
    if (target === 'lost') setLosing({ ...lead, stage: target });
    else move(lead.id, target);
  };

  return (
    <>
      <div className="hide-scrollbar -mx-4 flex gap-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
        {columns.map((column) => (
          <section
            key={column.stage}
            className={cn(
              'flex w-[16.5rem] shrink-0 flex-col rounded-[var(--radius-card)] border border-line border-t-2 bg-surface-sunken/40',
              STAGE_ACCENTS[column.stage] ?? 'border-t-line-strong',
              dragOver === column.stage && 'ring-2 ring-accent/40',
            )}
            onDragOver={(event) => {
              if (!canUpdate || dragging === null) return;
              event.preventDefault();
              setDragOver(column.stage);
            }}
            onDragLeave={() => setDragOver((current) => (current === column.stage ? null : current))}
            onDrop={(event) => {
              event.preventDefault();
              setDragOver(null);
              const lead = columns.flatMap((c) => c.leads).find((l) => l.id === dragging);
              if (lead) requestMove(lead, column.stage);
              setDragging(null);
            }}
          >
            <header className="px-3 py-2.5">
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-[0.8125rem] font-semibold text-fg">
                  {column.label}
                  <span className="rounded-full bg-surface-raised px-1.5 py-0.5 text-[0.625rem] tabular-nums text-fg-subtle">
                    {column.count}
                  </span>
                </h3>
                {canCreate && (
                  <button
                    type="button"
                    onClick={() => setCreating(column.stage)}
                    aria-label={`Ajouter un prospect dans « ${column.label} »`}
                    className="rounded-md p-1 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                  >
                    <Plus className="size-3.5" />
                  </button>
                )}
              </div>
              {column.value > 0 && (
                <p className="mt-0.5 text-[0.6875rem] tabular-nums text-fg-subtle">
                  {formatMoney(column.value, currency)}
                </p>
              )}
            </header>

            <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
              {column.leads.length === 0 && (
                <p className="px-1 py-6 text-center text-[0.6875rem] text-fg-subtle">
                  {canUpdate ? 'Déposez un prospect ici' : 'Aucun prospect'}
                </p>
              )}

              {column.leads.map((lead) => (
                <article
                  key={lead.id}
                  draggable={canUpdate}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', String(lead.id));
                    setDragging(lead.id);
                  }}
                  onDragEnd={() => { setDragging(null); setDragOver(null); }}
                  className={cn(
                    'group rounded-lg border border-line bg-surface-raised p-3 shadow-soft transition-[opacity,box-shadow]',
                    canUpdate && 'cursor-grab active:cursor-grabbing hover:shadow-raised',
                    dragging === lead.id && 'opacity-40',
                  )}
                >
                  <div className="flex items-start gap-2">
                    {canUpdate && (
                      <GripVertical
                        className="mt-0.5 size-3.5 shrink-0 text-line-strong opacity-0 transition-opacity group-hover:opacity-100"
                        aria-hidden
                      />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.8125rem] font-medium leading-snug text-fg">{lead.name}</p>
                      {lead.company && (
                        <p className="mt-0.5 flex items-center gap-1 truncate text-[0.625rem] text-fg-subtle">
                          <Building2 className="size-2.5 shrink-0" />
                          {lead.company}
                        </p>
                      )}
                    </div>
                    <Badge tone={scoreTone(lead.score)}>{lead.score}</Badge>
                  </div>

                  {lead.service_interest && (
                    <p className="mt-2 truncate text-[0.625rem] text-fg-muted">{lead.service_interest}</p>
                  )}

                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {lead.estimated_value > 0 && (
                      <Badge tone="outline">{formatMoney(lead.estimated_value, lead.currency)}</Badge>
                    )}
                    {lead.is_demo === 1 && <Badge tone="warning">DÉMO</Badge>}
                  </div>

                  <div className="mt-2.5 flex items-center gap-2.5 border-t border-line pt-2 text-[0.625rem] text-fg-subtle">
                    {lead.email && (
                      <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1 hover:text-accent">
                        <Mail className="size-3" />
                        Email
                      </a>
                    )}
                    {lead.phone && (
                      <a href={`tel:${lead.phone}`} className="inline-flex items-center gap-1 hover:text-accent">
                        <Phone className="size-3" />
                        Appeler
                      </a>
                    )}
                    <span className="ms-auto">{formatRelative(lead.created_at, 'fr')}</span>
                  </div>

                  {canUpdate && (
                    <Select
                      value={lead.stage}
                      onChange={(event) => requestMove(lead, event.target.value as LeadStage)}
                      aria-label={`Changer l’étape de ${lead.name}`}
                      className="mt-2 h-7 text-[0.6875rem] lg:hidden"
                    >
                      {columns.map((option) => (
                        <option key={option.stage} value={option.stage}>
                          {option.label}
                        </option>
                      ))}
                    </Select>
                  )}
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>

      {losing !== null && (
        <LostReasonModal
          lead={losing}
          onClose={() => setLosing(null)}
          onConfirm={(reason) => {
            const lead = losing;
            setLosing(null);
            move(lead.id, 'lost', reason);
          }}
        />
      )}

      {creating !== null && (
        <NewLeadModal
          csrf={csrf}
          stage={creating}
          currency={currency}
          onClose={() => setCreating(null)}
          onCreated={() => router.refresh()}
        />
      )}
    </>
  );
}

function sum(leads: PipelineLead[]): number {
  return Math.round(leads.reduce((acc, lead) => acc + lead.estimated_value, 0) * 100) / 100;
}

function LostReasonModal({
  lead,
  onClose,
  onConfirm,
}: {
  lead: PipelineLead;
  onClose: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = React.useState('');

  return (
    <Modal
      open
      onClose={onClose}
      title={`Marquer « ${lead.name} » comme perdu`}
      description="La raison alimente le rapport de conversion. Elle n’est jamais visible par le prospect."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={() => onConfirm(reason.trim())}>Confirmer</Button>
        </>
      }
    >
      <Field label="Raison" htmlFor="lost-reason" hint="Budget, délai, concurrence, sans réponse…">
        <Textarea
          id="lost-reason"
          rows={3}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          maxLength={300}
          autoFocus
        />
      </Field>
    </Modal>
  );
}

function NewLeadModal({
  csrf,
  stage,
  currency,
  onClose,
  onCreated,
}: {
  csrf: string;
  stage: LeadStage;
  currency: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { run, busy } = useAction(csrf);
  const [values, setValues] = React.useState({
    name: '', company: '', email: '', phone: '',
    service_interest: '', budget_range: '', estimated_value: '', message: '',
  });

  const set = (key: keyof typeof values, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  return (
    <Modal
      open
      onClose={onClose}
      title="Nouveau prospect"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={busy || values.name.trim().length < 2}
            onClick={async () => {
              const result = await run('/api/prospects', {
                method: 'POST',
                body: {
                  name: values.name.trim(),
                  company: values.company || null,
                  email: values.email || null,
                  phone: values.phone || null,
                  service_interest: values.service_interest || null,
                  budget_range: values.budget_range || null,
                  estimated_value: Number(values.estimated_value) || 0,
                  currency,
                  message: values.message || null,
                  stage,
                  source: 'manual',
                },
                success: 'Prospect créé.',
              });
              if (result) {
                onCreated();
                onClose();
              }
            }}
          >
            Créer
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom" required htmlFor="nl-name">
            <Input id="nl-name" value={values.name} onChange={(e) => set('name', e.target.value)} maxLength={120} autoFocus />
          </Field>
          <Field label="Société" htmlFor="nl-company">
            <Input id="nl-company" value={values.company} onChange={(e) => set('company', e.target.value)} maxLength={140} />
          </Field>
          <Field label="Email" htmlFor="nl-email">
            <Input id="nl-email" type="email" value={values.email} onChange={(e) => set('email', e.target.value)} maxLength={180} />
          </Field>
          <Field label="Téléphone" htmlFor="nl-phone">
            <Input id="nl-phone" type="tel" value={values.phone} onChange={(e) => set('phone', e.target.value)} maxLength={40} />
          </Field>
          <Field label="Service demandé" htmlFor="nl-service">
            <Input id="nl-service" value={values.service_interest} onChange={(e) => set('service_interest', e.target.value)} maxLength={160} />
          </Field>
          <Field label="Budget indicatif" htmlFor="nl-budget">
            <Input id="nl-budget" value={values.budget_range} onChange={(e) => set('budget_range', e.target.value)} maxLength={80} />
          </Field>
          <Field label={`Valeur estimée (${currency})`} htmlFor="nl-value" className="sm:col-span-2">
            <Input
              id="nl-value"
              type="number"
              min={0}
              step="0.01"
              value={values.estimated_value}
              onChange={(e) => set('estimated_value', e.target.value)}
              className="tabular-nums"
            />
          </Field>
        </div>
        <Field label="Besoin exprimé" htmlFor="nl-message">
          <Textarea id="nl-message" rows={3} value={values.message} onChange={(e) => set('message', e.target.value)} maxLength={4000} />
        </Field>
      </div>
    </Modal>
  );
}
