'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Field, Input, Select, Textarea, Switch } from '@/components/ui/field';
import { useAction } from './use-resource-form';

/**
 * Contract templates.
 *
 * Deleting a template cannot damage a contract, and the dialog says so: a
 * contract stores its own expanded text. That is worth stating, because the
 * instinct is to assume the contract would lose its wording.
 */

export type ContractTemplateRecord = {
  id: number;
  name: string;
  description: string | null;
  body: string;
  locale: string;
  is_default: 0 | 1;
  variables: string[];
};

export function ContractTemplateManager({
  csrf,
  templates,
  variableHelp,
}: {
  csrf: string;
  templates: ContractTemplateRecord[];
  variableHelp: Record<string, string>;
}) {
  const { run, busy } = useAction(csrf);
  const [editing, setEditing] = React.useState<ContractTemplateRecord | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<ContractTemplateRecord | null>(null);

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={() => setEditing('new')}>
          <Plus className="size-3.5" />
          Nouveau modèle
        </Button>
      </div>

      {templates.length === 0 ? (
        <Card>
          <CardBody className="py-6 text-center">
            <p className="text-[0.8125rem] text-fg-muted">
              Aucun modèle de contrat. Écrire ses conditions une fois évite de les improviser à chaque projet.
            </p>
          </CardBody>
        </Card>
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {templates.map((template) => {
            const unknown = template.variables.filter((name) => !(name in variableHelp));

            return (
              <li
                key={template.id}
                className="flex flex-col rounded-[var(--radius-card)] border border-line bg-surface-raised p-3.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2">
                      <span className="truncate text-[0.875rem] font-semibold text-fg">{template.name}</span>
                      {template.is_default === 1 && (
                        <Star className="size-3 shrink-0 fill-warning text-warning" aria-label="Modèle par défaut" />
                      )}
                    </p>
                    {template.description && (
                      <p className="truncate text-[0.6875rem] text-fg-subtle">{template.description}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Badge tone="outline">{template.locale.toUpperCase()}</Badge>
                    <button
                      type="button"
                      onClick={() => setEditing(template)}
                      aria-label={`Modifier ${template.name}`}
                      className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(template)}
                      aria-label={`Supprimer ${template.name}`}
                      className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                </div>

                <p className="mt-2 line-clamp-3 whitespace-pre-line text-[0.75rem] leading-relaxed text-fg-muted">
                  {template.body}
                </p>

                <p className="mt-auto pt-2.5 text-[0.625rem] text-fg-subtle">
                  {template.variables.length} variable{template.variables.length === 1 ? '' : 's'}
                  {unknown.length > 0 && (
                    <span className="ms-1.5 text-warning">
                      <AlertTriangle className="me-0.5 inline size-2.5" />
                      {unknown.length} inconnue{unknown.length === 1 ? '' : 's'}
                    </span>
                  )}
                </p>
              </li>
            );
          })}
        </ul>
      )}

      {editing !== null && (
        <ContractTemplateModal
          csrf={csrf}
          template={editing === 'new' ? null : editing}
          variableHelp={variableHelp}
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
          await run(`/api/contrats/modeles?id=${target.id}`, { method: 'DELETE', success: 'Modèle supprimé.' });
        }}
        title="Supprimer ce modèle ?"
        message="Les contrats déjà établis conservent leur texte intégral : ils ne dépendent pas du modèle. Seul le modèle disparaît."
        confirmLabel="Supprimer"
        busy={busy}
      />
    </div>
  );
}

function ContractTemplateModal({
  csrf,
  template,
  variableHelp,
  onClose,
}: {
  csrf: string;
  template: ContractTemplateRecord | null;
  variableHelp: Record<string, string>;
  onClose: () => void;
}) {
  const router = useRouter();
  const { run, busy } = useAction(csrf);

  const [values, setValues] = React.useState({
    name: template?.name ?? '',
    description: template?.description ?? '',
    body: template?.body ?? '',
    locale: template?.locale ?? 'fr',
    is_default: template ? template.is_default === 1 : false,
  });

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  const used = Array.from(
    new Set(
      Array.from(values.body.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)).map((match) => match[1].toLowerCase()),
    ),
  );
  const unknown = used.filter((name) => !(name in variableHelp));

  const valid = values.name.trim().length >= 2 && values.body.trim().length >= 20;

  return (
    <Modal
      open
      onClose={onClose}
      title={template ? 'Modifier le modèle' : 'Nouveau modèle de contrat'}
      description="Le texte est recopié tel quel dans chaque contrat établi depuis ce modèle, variables remplacées."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={busy || !valid}
            onClick={async () => {
              const result = await run('/api/contrats/modeles', {
                body: {
                  id: template?.id,
                  name: values.name.trim(),
                  description: values.description.trim() || null,
                  body: values.body,
                  locale: values.locale,
                  is_default: values.is_default,
                },
                success: 'Modèle enregistré.',
              });
              if (result) {
                router.refresh();
                onClose();
              }
            }}
          >
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom du modèle" htmlFor="ct-name" required>
            <Input
              id="ct-name"
              value={values.name}
              onChange={(event) => set('name', event.target.value)}
              maxLength={160}
              autoFocus
              placeholder="Prestation de développement web"
            />
          </Field>

          <Field label="Langue" htmlFor="ct-locale">
            <Select id="ct-locale" value={values.locale} onChange={(event) => set('locale', event.target.value)}>
              <option value="fr">Français</option>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </Select>
          </Field>
        </div>

        <Field label="Description" htmlFor="ct-description" hint="À quoi sert ce modèle — visible seulement ici.">
          <Input
            id="ct-description"
            value={values.description}
            onChange={(event) => set('description', event.target.value)}
            maxLength={500}
          />
        </Field>

        <Field label="Texte du contrat" htmlFor="ct-body" required>
          <Textarea
            id="ct-body"
            rows={18}
            value={values.body}
            onChange={(event) => set('body', event.target.value)}
            maxLength={60000}
            className="font-mono text-[0.75rem]"
          />
        </Field>

        {unknown.length > 0 && (
          <p className="flex items-start gap-1.5 rounded-lg bg-warning-soft px-3 py-2 text-[0.75rem] text-fg" role="alert">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
            <span>
              {unknown.map((name) => (
                <code key={name} className="me-1 font-mono">
                  {`{{${name}}}`}
                </code>
              ))}
              — rien ne remplira {unknown.length === 1 ? 'cette variable' : 'ces variables'}. Le contrat partirait
              avec les accolades visibles.
            </span>
          </p>
        )}

        <details className="rounded-lg bg-surface-sunken px-3 py-2.5">
          <summary className="cursor-pointer text-[0.8125rem] font-medium text-fg">
            Variables disponibles ({Object.keys(variableHelp).length})
          </summary>
          <dl className="mt-2 grid gap-1.5 sm:grid-cols-2">
            {Object.entries(variableHelp).map(([name, help]) => (
              <div key={name} className="min-w-0">
                <dt>
                  <button
                    type="button"
                    onClick={() => set('body', `${values.body}{{${name}}}`)}
                    className="font-mono text-[0.6875rem] text-accent underline-offset-2 hover:underline"
                    title="Insérer"
                  >
                    {`{{${name}}}`}
                  </button>
                </dt>
                <dd className="text-[0.6875rem] text-fg-muted">{help}</dd>
              </div>
            ))}
          </dl>
        </details>

        <div className="flex items-center rounded-lg bg-surface-sunken px-3 py-2.5">
          <Switch
            checked={values.is_default}
            onChange={(next) => set('is_default', next)}
            label={values.is_default ? 'Modèle par défaut' : 'Modèle secondaire'}
          />
        </div>
      </div>
    </Modal>
  );
}
