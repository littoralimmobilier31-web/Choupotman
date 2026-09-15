'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Pencil, Plus, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { useAction } from './use-resource-form';

/**
 * Message templates.
 *
 * The editor lists the variables it found and flags any that nothing will fill,
 * because a `{{clientname}}` typo is invisible until it reaches a client's inbox
 * verbatim. The template is still saved — it may be a work in progress — but the
 * warning is shown where the mistake was made.
 */

export type TemplateRecord = {
  id: number;
  key: string;
  name: string;
  channel: string;
  subject: string | null;
  body: string;
  locale: string;
  description: string | null;
  variables: string[];
};

export function TemplateManager({
  csrf,
  templates,
  variableHelp,
}: {
  csrf: string;
  templates: TemplateRecord[];
  variableHelp: Record<string, string>;
}) {
  const { run, busy } = useAction(csrf);
  const [editing, setEditing] = React.useState<TemplateRecord | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<TemplateRecord | null>(null);

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
              Aucun modèle. Les modèles évitent de réécrire la même relance chaque semaine.
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
                    <p className="truncate text-[0.875rem] font-semibold text-fg">{template.name}</p>
                    <p className="truncate font-mono text-[0.625rem] text-fg-subtle">{template.key}</p>
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

                {template.subject && (
                  <p className="mt-1.5 truncate text-[0.75rem] font-medium text-fg-muted">{template.subject}</p>
                )}
                <p className="mt-1 line-clamp-3 text-[0.75rem] leading-relaxed text-fg-muted">{template.body}</p>

                {template.variables.length > 0 && (
                  <p className="mt-auto pt-2.5 text-[0.625rem] text-fg-subtle">
                    {template.variables.map((name) => (
                      <code key={name} className="me-1 font-mono">
                        {`{{${name}}}`}
                      </code>
                    ))}
                  </p>
                )}

                {unknown.length > 0 && (
                  <p className="mt-1 flex items-start gap-1 text-[0.625rem] text-warning">
                    <AlertTriangle className="mt-0.5 size-2.5 shrink-0" />
                    {unknown.length === 1 ? 'Variable inconnue' : 'Variables inconnues'} :{' '}
                    {unknown.join(', ')} — elle{unknown.length === 1 ? '' : 's'} restera{unknown.length === 1 ? '' : 'ont'}{' '}
                    telle{unknown.length === 1 ? '' : 's'} quelle{unknown.length === 1 ? '' : 's'} dans le message.
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {editing !== null && (
        <TemplateModal
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
          await run(`/api/messages/modeles?cle=${encodeURIComponent(target.key)}`, {
            method: 'DELETE',
            success: 'Modèle supprimé.',
          });
        }}
        title="Supprimer ce modèle ?"
        message="Les messages déjà envoyés à partir de ce modèle sont conservés ; seul le modèle disparaît."
        confirmLabel="Supprimer"
        busy={busy}
      />
    </div>
  );
}

function TemplateModal({
  csrf,
  template,
  variableHelp,
  onClose,
}: {
  csrf: string;
  template: TemplateRecord | null;
  variableHelp: Record<string, string>;
  onClose: () => void;
}) {
  const router = useRouter();
  const { run, busy } = useAction(csrf);

  const [values, setValues] = React.useState({
    key: template?.key ?? '',
    name: template?.name ?? '',
    channel: template?.channel ?? 'email',
    subject: template?.subject ?? '',
    body: template?.body ?? '',
    locale: template?.locale ?? 'fr',
    description: template?.description ?? '',
  });

  const set = <K extends keyof typeof values>(key: K, value: string) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  const used = Array.from(
    new Set(
      Array.from(`${values.subject} ${values.body}`.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)).map(
        (match) => match[1].toLowerCase(),
      ),
    ),
  );
  const unknown = used.filter((name) => !(name in variableHelp));

  const valid =
    /^[a-z0-9_]{2,80}$/.test(values.key) && values.name.trim().length >= 2 && values.body.trim().length >= 2;

  return (
    <Modal
      open
      onClose={onClose}
      title={template ? 'Modifier le modèle' : 'Nouveau modèle'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={busy || !valid}
            onClick={async () => {
              const result = await run('/api/messages/modeles', {
                body: {
                  key: values.key,
                  name: values.name.trim(),
                  channel: values.channel,
                  subject: values.subject.trim() || null,
                  body: values.body.trim(),
                  locale: values.locale,
                  description: values.description.trim() || null,
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
          <Field label="Nom" htmlFor="tm-name" required>
            <Input
              id="tm-name"
              value={values.name}
              onChange={(event) => set('name', event.target.value)}
              maxLength={160}
              autoFocus
              placeholder="Relance de facture impayée"
            />
          </Field>

          <Field
            label="Clé"
            htmlFor="tm-key"
            required
            hint="Minuscules, chiffres et _ uniquement. Sert de référence dans le code et les automatisations."
          >
            <Input
              id="tm-key"
              value={values.key}
              onChange={(event) => set('key', event.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_'))}
              maxLength={80}
              className="font-mono"
              disabled={template !== null}
              placeholder="invoice_reminder"
            />
          </Field>

          <Field label="Canal" htmlFor="tm-channel">
            <Select id="tm-channel" value={values.channel} onChange={(event) => set('channel', event.target.value)}>
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="internal">Note interne</option>
            </Select>
          </Field>

          <Field label="Langue" htmlFor="tm-locale">
            <Select id="tm-locale" value={values.locale} onChange={(event) => set('locale', event.target.value)}>
              <option value="fr">Français</option>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </Select>
          </Field>
        </div>

        <Field label="Objet" htmlFor="tm-subject">
          <Input
            id="tm-subject"
            value={values.subject}
            onChange={(event) => set('subject', event.target.value)}
            maxLength={300}
          />
        </Field>

        <Field label="Contenu" htmlFor="tm-body" required>
          <Textarea
            id="tm-body"
            rows={10}
            value={values.body}
            onChange={(event) => set('body', event.target.value)}
            maxLength={20000}
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
              — rien ne remplira {unknown.length === 1 ? 'cette variable' : 'ces variables'} à l’envoi. Le texte
              partirait tel quel. Vérifiez l’orthographe dans la liste ci-dessous.
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
                    title="Insérer dans le contenu"
                  >
                    {`{{${name}}}`}
                  </button>
                </dt>
                <dd className="text-[0.6875rem] text-fg-muted">{help}</dd>
              </div>
            ))}
          </dl>
        </details>
      </div>
    </Modal>
  );
}
