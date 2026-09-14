'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, GripVertical, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Field, Input, Select, Textarea, Switch } from '@/components/ui/field';
import { Progress } from '@/components/ui/misc';
import { useAction } from './use-resource-form';
import { PROFILE_KINDS } from '@/lib/profile-kinds';

/**
 * The owner's professional background.
 *
 * Everything on the public "À propos" page comes from these rows and nothing
 * else — no generated summary, no inferred skill. That is what keeps the site
 * honest: it can only claim what the owner typed here.
 */

export type ProfileEntry = {
  id: number;
  kind: string;
  title: string;
  organisation: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: 0 | 1;
  description: string | null;
  level: number | null;
  url: string | null;
  position: number;
  is_published: 0 | 1;
};


export function ProfileManager({
  csrf,
  entries,
  canEdit,
  canDelete,
}: {
  csrf: string;
  entries: ProfileEntry[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [editing, setEditing] = React.useState<ProfileEntry | 'new' | null>(null);
  const [defaultKind, setDefaultKind] = React.useState('experience');

  return (
    <div className="space-y-8">
      {PROFILE_KINDS.map((kind) => {
        const rows = entries.filter((entry) => entry.kind === kind.key);

        return (
          <section key={kind.key}>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold text-fg">
                  {kind.plural}
                  {rows.length > 0 && (
                    <span className="rounded-full bg-surface-sunken px-1.5 py-0.5 text-[0.625rem] tabular-nums text-fg-subtle">
                      {rows.length}
                    </span>
                  )}
                </h2>
                <p className="mt-0.5 max-w-2xl text-[0.75rem] leading-relaxed text-fg-muted">{kind.hint}</p>
              </div>

              {canEdit && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setDefaultKind(kind.key);
                    setEditing('new');
                  }}
                >
                  <Plus className="size-3.5" />
                  Ajouter
                </Button>
              )}
            </div>

            {rows.length === 0 ? (
              <Card>
                <CardBody className="py-6 text-center">
                  <p className="text-[0.8125rem] text-fg-muted">
                    Rien pour le moment — cette section n’apparaît pas sur le site public.
                  </p>
                </CardBody>
              </Card>
            ) : (
              <ul className="space-y-2">
                {rows.map((entry) => (
                  <EntryRow
                    key={entry.id}
                    csrf={csrf}
                    entry={entry}
                    hasLevel={kind.hasLevel === true}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    onEdit={() => setEditing(entry)}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {editing !== null && (
        <EntryModal
          csrf={csrf}
          entry={editing === 'new' ? null : editing}
          defaultKind={defaultKind}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function EntryRow({
  csrf,
  entry,
  hasLevel,
  canEdit,
  canDelete,
  onEdit,
}: {
  csrf: string;
  entry: ProfileEntry;
  hasLevel: boolean;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
}) {
  const { run, busy } = useAction(csrf);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const period = [entry.start_date, entry.is_current === 1 ? 'aujourd’hui' : entry.end_date]
    .filter(Boolean)
    .join(' – ');

  return (
    <li
      className={cn(
        'rounded-lg border border-line bg-surface-raised px-3.5 py-3',
        entry.is_published === 0 && 'opacity-60',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-[0.8125rem] font-medium text-fg">
            <GripVertical className="size-3.5 shrink-0 text-line-strong" aria-hidden />
            {entry.title}
            {entry.is_current === 1 && <Badge tone="success">En cours</Badge>}
            {entry.is_published === 0 && <Badge tone="outline">Masqué</Badge>}
          </p>

          <p className="mt-0.5 ps-5 text-[0.6875rem] text-fg-subtle">
            {[entry.organisation, entry.location, period].filter(Boolean).join(' · ') || '—'}
          </p>

          {entry.description && (
            <p className="mt-1 line-clamp-2 ps-5 text-[0.75rem] leading-relaxed text-fg-muted">
              {entry.description}
            </p>
          )}

          {hasLevel && entry.level !== null && (
            <div className="mt-2 flex items-center gap-2 ps-5">
              <Progress className="max-w-40 flex-1" value={entry.level} tone="accent" />
              <span className="text-[0.625rem] tabular-nums text-fg-subtle">{entry.level} %</span>
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          {canEdit && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(`/api/profil/${entry.id}`, {
                    method: 'PATCH',
                    body: { is_published: entry.is_published === 0 },
                    success: entry.is_published === 1 ? 'Masqué du site.' : 'Affiché sur le site.',
                  })
                }
                aria-label={entry.is_published === 1 ? 'Masquer du site' : 'Afficher sur le site'}
                className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
              >
                {entry.is_published === 1 ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
              </button>

              <button
                type="button"
                onClick={onEdit}
                aria-label={`Modifier ${entry.title}`}
                className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
              >
                <Pencil className="size-3.5" />
              </button>
            </>
          )}

          {canDelete && (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              aria-label={`Supprimer ${entry.title}`}
              className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          await run(`/api/profil/${entry.id}`, { method: 'DELETE', success: 'Élément supprimé.' });
        }}
        title={`Supprimer « ${entry.title} » ?`}
        message="Cet élément disparaîtra définitivement de votre page « À propos ». Pour le retirer temporairement, utilisez plutôt « Masquer »."
        confirmLabel="Supprimer"
        busy={busy}
      />
    </li>
  );
}

function EntryModal({
  csrf,
  entry,
  defaultKind,
  onClose,
}: {
  csrf: string;
  entry: ProfileEntry | null;
  defaultKind: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { run, busy } = useAction(csrf);

  const [values, setValues] = React.useState({
    kind: entry?.kind ?? defaultKind,
    title: entry?.title ?? '',
    organisation: entry?.organisation ?? '',
    location: entry?.location ?? '',
    start_date: entry?.start_date ?? '',
    end_date: entry?.end_date ?? '',
    is_current: entry?.is_current === 1,
    description: entry?.description ?? '',
    level: entry?.level !== null && entry?.level !== undefined ? String(entry.level) : '',
    url: entry?.url ?? '',
    is_published: entry ? entry.is_published === 1 : true,
  });

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  const kind = PROFILE_KINDS.find((option) => option.key === values.kind);

  return (
    <Modal
      open
      onClose={onClose}
      title={entry ? 'Modifier l’élément' : 'Ajouter au parcours'}
      description="Ces informations sont affichées telles quelles sur votre page « À propos »."
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={busy || values.title.trim().length < 2}
            onClick={async () => {
              const payload = {
                kind: values.kind,
                title: values.title.trim(),
                organisation: values.organisation || null,
                location: values.location || null,
                start_date: values.start_date || null,
                end_date: values.is_current ? null : values.end_date || null,
                is_current: values.is_current,
                description: values.description || null,
                level: values.level ? Number(values.level) : null,
                url: values.url || null,
                is_published: values.is_published,
              };

              const result = entry
                ? await run(`/api/profil/${entry.id}`, { method: 'PATCH', body: payload, success: 'Enregistré.' })
                : await run('/api/profil', { method: 'POST', body: payload, success: 'Ajouté à votre parcours.' });

              if (result) {
                router.refresh();
                onClose();
              }
            }}
          >
            {entry ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Type" htmlFor="pe-kind">
            <Select id="pe-kind" value={values.kind} onChange={(e) => set('kind', e.target.value)}>
              {PROFILE_KINDS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Intitulé" required htmlFor="pe-title" className="sm:col-span-2">
            <Input
              id="pe-title"
              value={values.title}
              onChange={(e) => set('title', e.target.value)}
              maxLength={200}
              placeholder={
                values.kind === 'experience'
                  ? 'Développeur web freelance'
                  : values.kind === 'education'
                    ? 'Licence en informatique'
                    : values.kind === 'certification'
                      ? 'Nom de la certification'
                      : undefined
              }
              autoFocus
            />
          </Field>

          <Field
            label={values.kind === 'education' || values.kind === 'certification' ? 'Établissement / organisme' : 'Organisation'}
            htmlFor="pe-org"
          >
            <Input id="pe-org" value={values.organisation} onChange={(e) => set('organisation', e.target.value)} maxLength={200} />
          </Field>

          <Field label="Lieu" htmlFor="pe-location">
            <Input id="pe-location" value={values.location} onChange={(e) => set('location', e.target.value)} maxLength={160} />
          </Field>

          <Field label="Début" htmlFor="pe-start" hint="année ou mois/année">
            <Input id="pe-start" value={values.start_date} onChange={(e) => set('start_date', e.target.value)} maxLength={30} placeholder="2022" />
          </Field>

          <Field label="Fin" htmlFor="pe-end">
            <Input
              id="pe-end"
              value={values.end_date}
              onChange={(e) => set('end_date', e.target.value)}
              maxLength={30}
              placeholder="2024"
              disabled={values.is_current}
            />
          </Field>

          {kind?.hasLevel && (
            <Field label="Niveau (%)" htmlFor="pe-level" hint="facultatif — laissez vide pour ne pas l’afficher">
              <Input
                id="pe-level"
                type="number"
                min={0}
                max={100}
                value={values.level}
                onChange={(e) => set('level', e.target.value)}
                className="tabular-nums"
              />
            </Field>
          )}

          <Field label="Lien" htmlFor="pe-url" hint="facultatif">
            <Input id="pe-url" type="url" value={values.url} onChange={(e) => set('url', e.target.value)} maxLength={300} />
          </Field>
        </div>

        <Field label="Description" htmlFor="pe-description">
          <Textarea
            id="pe-description"
            rows={4}
            value={values.description}
            onChange={(e) => set('description', e.target.value)}
            maxLength={4000}
          />
        </Field>

        <div className="flex flex-wrap gap-4 rounded-lg bg-surface-sunken px-3 py-2.5">
          <Switch
            checked={values.is_current}
            onChange={(next) => set('is_current', next)}
            label="Toujours en cours"
          />
          <Switch
            checked={values.is_published}
            onChange={(next) => set('is_published', next)}
            label={values.is_published ? 'Affiché sur le site' : 'Masqué'}
          />
        </div>
      </div>
    </Modal>
  );
}
