'use client';

import * as React from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field, Input, Textarea, Switch } from '@/components/ui/field';
import { useResourceForm } from './use-resource-form';

/**
 * Settings form for one group.
 *
 * The control is chosen from each setting's declared `value_type`, so the shape
 * of a screen follows the database rather than a hard-coded list — adding a
 * setting to the seed makes it appear here with the right input.
 *
 * An empty field is saved as NULL, and the public site hides whatever is NULL.
 * That is deliberate and worth stating in the interface: a section the owner has
 * not filled in disappears instead of showing placeholder text about them.
 */

export type SettingField = {
  key: string;
  label: string | null;
  value: string | null;
  value_type: string;
};

export function SettingsForm({
  csrf,
  group,
  fields,
  hints = {},
  placeholders = {},
}: {
  csrf: string;
  group: string;
  fields: SettingField[];
  /** Extra guidance per key, where the label alone is not enough. */
  hints?: Record<string, string>;
  placeholders?: Record<string, string>;
}) {
  const initial = React.useMemo(
    () =>
      Object.fromEntries(
        fields.map((field) => [
          field.key,
          field.value_type === 'boolean' ? field.value === '1' : (field.value ?? ''),
        ]),
      ) as Record<string, string | boolean>,
    [fields],
  );

  const form = useResourceForm<Record<string, string | boolean>>({
    initial,
    endpoint: '/api/parametres',
    method: 'POST',
    csrf,
    successMessage: 'Paramètres enregistrés.',
    transform: (values) => ({ group, values }),
  });

  return (
    <form onSubmit={form.submit} className="space-y-5">
      <Card>
        <CardBody className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => {
            const label = field.label ?? field.key;
            const id = `s-${field.key.replace(/\./g, '-')}`;
            const value = form.values[field.key];

            if (field.value_type === 'boolean') {
              return (
                <div
                  key={field.key}
                  className="flex items-start justify-between gap-4 rounded-lg bg-surface-sunken px-3 py-2.5 sm:col-span-2"
                >
                  <div className="min-w-0">
                    <p className="text-[0.8125rem] font-medium text-fg">{label}</p>
                    {hints[field.key] && (
                      <p className="mt-0.5 text-[0.75rem] leading-relaxed text-fg-muted">{hints[field.key]}</p>
                    )}
                  </div>
                  <Switch
                    checked={value === true}
                    onChange={(next) => form.set(field.key, next)}
                    label={value === true ? 'Activé' : 'Désactivé'}
                  />
                </div>
              );
            }

            if (field.value_type === 'richtext') {
              return (
                <Field
                  key={field.key}
                  label={label}
                  htmlFor={id}
                  hint={hints[field.key]}
                  className="sm:col-span-2"
                  error={form.fieldErrors[field.key]}
                >
                  <Textarea
                    id={id}
                    rows={5}
                    value={String(value ?? '')}
                    onChange={(event) => form.set(field.key, event.target.value)}
                    placeholder={placeholders[field.key]}
                    maxLength={8000}
                  />
                </Field>
              );
            }

            return (
              <Field
                key={field.key}
                label={label}
                htmlFor={id}
                hint={hints[field.key]}
                error={form.fieldErrors[field.key]}
              >
                <Input
                  id={id}
                  type={field.value_type === 'number' ? 'number' : 'text'}
                  value={String(value ?? '')}
                  onChange={(event) => form.set(field.key, event.target.value)}
                  placeholder={placeholders[field.key]}
                  maxLength={2000}
                  className={field.value_type === 'number' ? 'tabular-nums' : undefined}
                />
              </Field>
            );
          })}
        </CardBody>
      </Card>

      {form.error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2.5 text-[0.8125rem] font-medium text-danger" role="alert">
          {form.error}
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Button type="submit" disabled={form.busy}>
          <Save className="size-4" />
          {form.busy ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
        {form.dirty && <span className="text-[0.75rem] text-warning">Modifications non enregistrées</span>}
        <span className="ms-auto text-[0.75rem] text-fg-subtle">
          Un champ vide reste vide : la section correspondante n’apparaît pas sur le site.
        </span>
      </div>
    </form>
  );
}
