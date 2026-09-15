'use client';

import * as React from 'react';
import { ExternalLink, Plus, Save, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Field, Input, Select, Textarea, Switch } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/modal';
import { useResourceForm } from './use-resource-form';
import type { FieldSpec, FormSection } from '@/lib/content-forms';

/**
 * The editor behind /portfolio, /etudes-de-cas and /blog.
 *
 * It renders whatever specification it is handed (see `lib/content-forms.ts`),
 * which keeps the three screens identical in behaviour: same unsaved-changes
 * guard, same per-field server errors, same "publish" semantics, same delete
 * that archives first.
 */

export type ContentValues = Record<string, unknown>;

export function ContentEditor({
  csrf,
  sections,
  values: initial,
  endpoint,
  method,
  deleteEndpoint,
  forceDeleteEndpoint,
  listHref,
  publicHref,
  redirectTo,
  canDelete = false,
  deleteWarning,
  footnote,
}: {
  csrf: string;
  sections: FormSection[];
  values: ContentValues;
  endpoint: string;
  method: 'POST' | 'PATCH';
  /** Enables the delete button; the API archives unless `force=1` is used. */
  deleteEndpoint?: string;
  forceDeleteEndpoint?: string;
  listHref: string;
  /** Address of the published page, shown once the record is live. */
  publicHref?: string;
  redirectTo?: (payload: Record<string, unknown>) => string;
  canDelete?: boolean;
  deleteWarning?: string;
  footnote?: string;
}) {
  const form = useResourceForm<ContentValues>({
    initial,
    endpoint,
    method,
    csrf,
    successMessage: method === 'POST' ? 'Créé.' : 'Enregistré.',
    redirectTo,
    transform: (values) => serialise(values, sections),
  });

  const [confirmDelete, setConfirmDelete] = React.useState<'archive' | 'force' | null>(null);
  // The first required field is what "is this saveable yet" hangs on.
  const titleField =
    sections[0]?.fields.find((field) => 'required' in field && field.required)?.name ?? 'title';
  const canSubmit = String(form.values[titleField] ?? '').trim().length >= 2;

  return (
    <form onSubmit={form.submit} className="space-y-5">
      {sections.map((section) => (
        <SectionCard key={section.title} section={section} form={form} />
      ))}

      {form.error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2.5 text-[0.8125rem] font-medium text-danger" role="alert">
          {form.error}
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Button type="submit" disabled={form.busy || !canSubmit}>
          <Save className="size-4" />
          {form.busy ? 'Enregistrement…' : method === 'POST' ? 'Créer' : 'Enregistrer'}
        </Button>

        {form.dirty && <span className="text-[0.75rem] text-warning">Modifications non enregistrées</span>}

        {publicHref && (
          <a
            href={publicHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[0.75rem] font-medium text-fg-muted transition-colors hover:text-fg"
          >
            <ExternalLink className="size-3.5" />
            Voir la page
          </a>
        )}

        {canDelete && deleteEndpoint && (
          <div className="ms-auto flex items-center gap-2">
            <button
              type="button"
              onClick={() => setConfirmDelete('archive')}
              className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.75rem] font-medium text-fg-muted transition-colors hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 className="size-3.5" />
              Retirer du site
            </button>
            {forceDeleteEndpoint && (
              <button
                type="button"
                onClick={() => setConfirmDelete('force')}
                className="text-[0.75rem] text-fg-subtle underline decoration-dotted transition-colors hover:text-danger"
              >
                Supprimer définitivement
              </button>
            )}
          </div>
        )}
      </div>

      {footnote && <p className="text-[0.75rem] text-fg-subtle">{footnote}</p>}

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          const target = confirmDelete === 'force' ? forceDeleteEndpoint : deleteEndpoint;
          setConfirmDelete(null);
          if (!target) return;
          await removeAt(target);
        }}
        title={confirmDelete === 'force' ? 'Supprimer définitivement ?' : 'Retirer du site ?'}
        message={
          confirmDelete === 'force'
            ? (deleteWarning ??
              'Le contenu sera effacé de la base. Cette action est irréversible.')
            : 'Le contenu est conservé dans l’administration mais n’apparaît plus sur le site public. Vous pourrez le republier à tout moment.'
        }
        confirmLabel={confirmDelete === 'force' ? 'Supprimer' : 'Retirer'}
        busy={form.deleting}
      />
    </form>
  );

  async function removeAt(target: string) {
    // `useResourceForm.remove()` is bound to a single endpoint; archive and hard
    // delete share the route with a different query, so the call is made here and
    // the list page takes over afterwards.
    const response = await fetch(target, { method: 'DELETE', headers: { 'x-csrf-token': csrf } });
    if (response.ok) window.location.assign(listHref);
  }
}

function SectionCard({
  section,
  form,
}: {
  section: FormSection;
  form: ReturnType<typeof useResourceForm<ContentValues>>;
}) {
  const [open, setOpen] = React.useState(!section.collapsed);

  return (
    <Card>
      <CardHeader>
        {section.collapsed ? (
          <button
            type="button"
            onClick={() => setOpen((previous) => !previous)}
            className="flex w-full items-center justify-between gap-3 text-start"
            aria-expanded={open}
          >
            <span className="min-w-0">
              <CardTitle>{section.title}</CardTitle>
              {section.description && <CardDescription>{section.description}</CardDescription>}
            </span>
            <span className="shrink-0 text-[0.75rem] font-medium text-fg-muted">
              {open ? 'Replier' : 'Déplier'}
            </span>
          </button>
        ) : (
          <>
            <CardTitle>{section.title}</CardTitle>
            {section.description && <CardDescription>{section.description}</CardDescription>}
          </>
        )}
      </CardHeader>

      {open && (
        <CardBody className="grid gap-4 sm:grid-cols-2">
          {section.fields.map((field) => (
            <FieldControl key={field.name} field={field} form={form} />
          ))}
        </CardBody>
      )}
    </Card>
  );
}

function FieldControl({
  field,
  form,
}: {
  field: FieldSpec;
  form: ReturnType<typeof useResourceForm<ContentValues>>;
}) {
  const id = `f-${field.name}`;
  const error = form.fieldErrors[field.name];
  const value = form.values[field.name];
  const wide = 'wide' in field && field.wide;

  switch (field.kind) {
    case 'switch':
      return (
        <div className="flex items-start justify-between gap-4 rounded-lg bg-surface-sunken px-3 py-2.5 sm:col-span-2">
          <div className="min-w-0">
            <p className="text-[0.8125rem] font-medium text-fg">{field.label}</p>
            {field.hint && <p className="mt-0.5 text-[0.75rem] text-fg-muted">{field.hint}</p>}
          </div>
          <Switch
            checked={value === true}
            onChange={(next) => form.set(field.name, next)}
            label={value === true ? 'Oui' : 'Non'}
          />
        </div>
      );

    case 'textarea':
      return (
        <Field label={field.label} htmlFor={id} hint={field.hint} error={error} className="sm:col-span-2">
          <Textarea
            id={id}
            rows={field.rows ?? 4}
            maxLength={field.max}
            value={String(value ?? '')}
            onChange={(event) => form.set(field.name, event.target.value)}
          />
        </Field>
      );

    case 'select':
      return (
        <Field label={field.label} htmlFor={id} hint={field.hint} error={error}>
          <Select
            id={id}
            value={String(value ?? '')}
            onChange={(event) => form.set(field.name, event.target.value)}
          >
            {field.emptyLabel !== undefined && <option value="">{field.emptyLabel}</option>}
            {field.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </Select>
        </Field>
      );

    case 'number':
      return (
        <Field label={field.label} htmlFor={id} hint={field.hint} error={error}>
          <Input
            id={id}
            type="number"
            min={field.min}
            max={field.max}
            value={String(value ?? '')}
            onChange={(event) => form.set(field.name, event.target.value)}
            className="tabular-nums"
          />
        </Field>
      );

    case 'date':
      return (
        <Field label={field.label} htmlFor={id} hint={field.hint} error={error}>
          <Input
            id={id}
            type="date"
            value={String(value ?? '')}
            onChange={(event) => form.set(field.name, event.target.value)}
          />
        </Field>
      );

    case 'list':
      return (
        <div className="sm:col-span-2">
          <StringList
            label={field.label}
            hint={field.hint}
            placeholder={field.placeholder}
            items={Array.isArray(value) ? (value as string[]) : []}
            onChange={(items) => form.set(field.name, items)}
          />
          {error && <p className="mt-1 text-[0.75rem] font-medium text-danger">{error}</p>}
        </div>
      );

    case 'rows':
      return (
        <div className="sm:col-span-2">
          <RowList
            label={field.label}
            hint={field.hint}
            addLabel={field.addLabel}
            columns={field.columns}
            rows={Array.isArray(value) ? (value as Record<string, string>[]) : []}
            onChange={(rows) => form.set(field.name, rows)}
          />
          {error && <p className="mt-1 text-[0.75rem] font-medium text-danger">{error}</p>}
        </div>
      );

    default:
      return (
        <Field
          label={field.label}
          htmlFor={id}
          hint={field.hint}
          error={error}
          required={field.required}
          className={wide ? 'sm:col-span-2' : undefined}
        >
          <Input
            id={id}
            maxLength={field.max}
            value={String(value ?? '')}
            onChange={(event) => form.set(field.name, event.target.value)}
          />
        </Field>
      );
  }
}

function StringList({
  label,
  hint,
  items,
  onChange,
  placeholder,
}: {
  label: string;
  hint?: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = React.useState('');

  const add = () => {
    const entry = draft.trim();
    if (entry.length === 0 || items.includes(entry)) {
      setDraft('');
      return;
    }
    onChange([...items, entry]);
    setDraft('');
  };

  return (
    <div>
      <p className="mb-1 text-[0.8125rem] font-medium text-fg">{label}</p>
      {hint && <p className="mb-2 text-[0.75rem] text-fg-muted">{hint}</p>}

      {items.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5">
          {items.map((item, index) => (
            <li
              key={`${item}-${index}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-surface-sunken px-2.5 py-1 text-[0.75rem] text-fg"
            >
              {item}
              <button
                type="button"
                onClick={() => onChange(items.filter((_, position) => position !== index))}
                aria-label={`Retirer ${item}`}
                className="rounded text-fg-subtle transition-colors hover:text-danger"
              >
                <X className="size-3" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          maxLength={160}
          aria-label={`Ajouter à ${label}`}
          className="h-8 text-[0.8125rem]"
        />
        <Button type="button" variant="secondary" size="sm" onClick={add} disabled={draft.trim() === ''}>
          <Plus className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function RowList({
  label,
  hint,
  addLabel,
  columns,
  rows,
  onChange,
}: {
  label: string;
  hint?: string;
  addLabel: string;
  columns: { name: string; label: string; max?: number; wide?: boolean }[];
  rows: Record<string, string>[];
  onChange: (rows: Record<string, string>[]) => void;
}) {
  const blank = () => Object.fromEntries(columns.map((column) => [column.name, '']));

  return (
    <div>
      <p className="mb-1 text-[0.8125rem] font-medium text-fg">{label}</p>
      {hint && <p className="mb-2 text-[0.75rem] text-fg-muted">{hint}</p>}

      {rows.length > 0 && (
        <ul className="mb-2 space-y-2">
          {rows.map((row, index) => (
            <li key={index} className="flex items-start gap-2 rounded-lg bg-surface-sunken p-2">
              <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-2">
                {columns.map((column) => (
                  <label
                    key={column.name}
                    className={column.wide ? 'sm:col-span-2' : undefined}
                  >
                    <span className="mb-0.5 block text-[0.6875rem] text-fg-subtle">{column.label}</span>
                    <Input
                      value={row[column.name] ?? ''}
                      maxLength={column.max}
                      onChange={(event) => {
                        const next = rows.map((entry, position) =>
                          position === index ? { ...entry, [column.name]: event.target.value } : entry,
                        );
                        onChange(next);
                      }}
                      className="h-8 text-[0.8125rem]"
                    />
                  </label>
                ))}
              </div>
              <button
                type="button"
                onClick={() => onChange(rows.filter((_, position) => position !== index))}
                aria-label={`Retirer la ligne ${index + 1}`}
                className="mt-4 rounded p-1 text-fg-subtle transition-colors hover:text-danger"
              >
                <Trash2 className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <Button type="button" variant="secondary" size="sm" onClick={() => onChange([...rows, blank()])}>
        <Plus className="size-3.5" />
        {addLabel}
      </Button>
    </div>
  );
}

/**
 * Turns form values into the request body.
 *
 * Empty text becomes `null` rather than `''` so an unfilled field stays unfilled
 * in the database — which is what makes the public page hide the section instead
 * of rendering an empty heading. Structured rows with no content at all are
 * dropped, so an accidental blank line never reaches the site.
 */
function serialise(values: ContentValues, sections: FormSection[]): Record<string, unknown> {
  const payload: Record<string, unknown> = {};

  for (const section of sections) {
    for (const field of section.fields) {
      const value = values[field.name];

      switch (field.kind) {
        case 'switch':
          payload[field.name] = value === true;
          break;

        case 'number': {
          const text = String(value ?? '').trim();
          payload[field.name] = text === '' ? null : Number(text);
          break;
        }

        case 'select': {
          const text = String(value ?? '').trim();
          // An id select yields a number; a status or locale select yields its key.
          payload[field.name] = text === '' ? null : field.name.endsWith('_id') ? Number(text) : text;
          break;
        }

        case 'list':
          payload[field.name] = Array.isArray(value) ? value : [];
          break;

        case 'rows':
          payload[field.name] = (Array.isArray(value) ? (value as Record<string, string>[] ) : [])
            .map((row) =>
              Object.fromEntries(field.columns.map((column) => [column.name, (row[column.name] ?? '').trim()])),
            )
            .filter((row) => Object.values(row).some((entry) => entry !== ''));
          break;

        default: {
          const text = String(value ?? '').trim();
          payload[field.name] = text === '' ? null : text;
        }
      }
    }
  }

  return payload;
}
