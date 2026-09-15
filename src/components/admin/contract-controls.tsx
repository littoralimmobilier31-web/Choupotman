'use client';

import * as React from 'react';
import { Download, Eye, FileSignature, Lock, Save, Send, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/modal';
import { Field, Input, Textarea } from '@/components/ui/field';
import { useAction } from './use-resource-form';

/**
 * Contract editor and status controls.
 *
 * Once signed, the text and the amount are read-only — the editor becomes a
 * viewer. The status buttons remain, because a signed contract can still be
 * cancelled, and cancellation is recorded rather than erasing anything.
 */

export function ContractControls({
  csrf,
  contractId,
  number,
  status,
  title,
  body,
  amount,
  currency,
  canUpdate,
  canDelete,
}: {
  csrf: string;
  contractId: number;
  number: string;
  status: string;
  title: string;
  body: string;
  amount: number;
  currency: string;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const { run, busy } = useAction(csrf);
  const [values, setValues] = React.useState({ title, body, amount: String(amount) });
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [confirmSign, setConfirmSign] = React.useState(false);

  const locked = status === 'signed' || status === 'cancelled';
  const editable = canUpdate && !locked;
  const dirty =
    values.title !== title || values.body !== body || values.amount !== String(amount);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <a
          href={`/api/contrats/${contractId}/pdf?inline=1`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[0.75rem] font-medium text-fg-muted transition-colors hover:text-fg"
        >
          <Eye className="size-3.5" />
          Aperçu PDF
        </a>
        <a
          href={`/api/contrats/${contractId}/pdf`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[0.75rem] font-medium text-fg-muted transition-colors hover:text-fg"
        >
          <Download className="size-3.5" />
          Télécharger
        </a>

        {canUpdate && status === 'draft' && (
          <Button
            variant="secondary"
            size="sm"
            disabled={busy}
            onClick={() =>
              run(`/api/contrats/${contractId}`, {
                method: 'PATCH',
                body: { status: 'sent' },
                success: 'Contrat marqué comme envoyé.',
              })
            }
          >
            <Send className="size-3.5" />
            Marquer comme envoyé
          </Button>
        )}

        {canUpdate && (status === 'draft' || status === 'sent') && (
          <Button size="sm" disabled={busy} onClick={() => setConfirmSign(true)}>
            <FileSignature className="size-3.5" />
            Marquer comme signé
          </Button>
        )}

        {canUpdate && status !== 'cancelled' && status !== 'draft' && (
          <button
            type="button"
            disabled={busy}
            onClick={() =>
              run(`/api/contrats/${contractId}`, {
                method: 'PATCH',
                body: { status: 'cancelled' },
                success: 'Contrat annulé.',
              })
            }
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.75rem] font-medium text-fg-muted transition-colors hover:bg-danger-soft hover:text-danger"
          >
            <X className="size-3.5" />
            Annuler le contrat
          </button>
        )}

        {canDelete && status === 'draft' && (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="ms-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.75rem] font-medium text-fg-muted transition-colors hover:bg-danger-soft hover:text-danger"
          >
            <Trash2 className="size-3.5" />
            Supprimer le brouillon
          </button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              Texte du contrat
              {locked && (
                <span className="inline-flex items-center gap-1 text-[0.6875rem] font-normal text-fg-subtle">
                  <Lock className="size-3" />
                  {status === 'signed' ? 'figé depuis la signature' : 'contrat annulé'}
                </span>
              )}
            </span>
          </CardTitle>
        </CardHeader>

        <CardBody className="space-y-3">
          {editable ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Intitulé" htmlFor="cc-title">
                  <Input
                    id="cc-title"
                    value={values.title}
                    onChange={(event) => setValues((previous) => ({ ...previous, title: event.target.value }))}
                    maxLength={200}
                  />
                </Field>
                <Field label={`Montant (${currency})`} htmlFor="cc-amount">
                  <Input
                    id="cc-amount"
                    type="number"
                    min={0}
                    step="0.01"
                    value={values.amount}
                    onChange={(event) => setValues((previous) => ({ ...previous, amount: event.target.value }))}
                    className="tabular-nums"
                  />
                </Field>
              </div>

              <Field label="Contenu" htmlFor="cc-body">
                <Textarea
                  id="cc-body"
                  rows={22}
                  value={values.body}
                  onChange={(event) => setValues((previous) => ({ ...previous, body: event.target.value }))}
                  maxLength={60000}
                  className="font-mono text-[0.75rem]"
                />
              </Field>

              <div className="flex flex-wrap items-center gap-3">
                <Button
                  size="sm"
                  disabled={busy || !dirty || values.title.trim().length < 2}
                  onClick={() =>
                    run(`/api/contrats/${contractId}`, {
                      method: 'PATCH',
                      body: {
                        title: values.title.trim(),
                        body: values.body,
                        amount: Number(values.amount) || 0,
                      },
                      success: 'Contrat enregistré.',
                    })
                  }
                >
                  <Save className="size-3.5" />
                  Enregistrer
                </Button>
                {dirty && <span className="text-[0.75rem] text-warning">Modifications non enregistrées</span>}
              </div>
            </>
          ) : (
            <pre className="whitespace-pre-wrap rounded-lg bg-surface-sunken p-3.5 font-mono text-[0.75rem] leading-relaxed text-fg">
              {body}
            </pre>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={confirmSign}
        onClose={() => setConfirmSign(false)}
        onConfirm={async () => {
          setConfirmSign(false);
          await run(`/api/contrats/${contractId}`, {
            method: 'PATCH',
            body: { status: 'signed' },
            success: 'Contrat marqué comme signé.',
          });
        }}
        title={`Marquer ${number} comme signé ?`}
        message="Le texte et le montant seront figés à partir de maintenant : c’est ce qui donne sa valeur au document. Un changement ultérieur passera par un nouveau contrat."
        confirmLabel="Marquer comme signé"
        busy={busy}
      />

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          const result = await run<{ deleted?: boolean }>(`/api/contrats/${contractId}`, {
            method: 'DELETE',
            success: 'Contrat supprimé.',
            silent: true,
          });
          if (result) window.location.assign('/espace-admin/contrats');
        }}
        title={`Supprimer ${number} ?`}
        message="Ce contrat est encore un brouillon : il peut être effacé sans trace. Un contrat signé, lui, serait annulé et conservé."
        confirmLabel="Supprimer"
        busy={busy}
      />
    </div>
  );
}
