'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Pencil, Plus, Star, Trash2, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Field, Input, Select, Textarea, Switch } from '@/components/ui/field';
import { useAction } from './use-resource-form';
import { formatMoney } from '@/lib/i18n/format';

/**
 * Service catalogue.
 *
 * Grouped by family because that is how the public /services page presents them
 * and how the owner thinks about their offer. Bullets and deliverables are edited
 * as lists rather than free text, so the public page can lay them out properly
 * instead of printing a paragraph someone formatted by hand.
 */

export type ServiceRecord = {
  id: number;
  name: string;
  slug: string;
  family: string;
  short_description: string | null;
  description: string | null;
  bullets: string[];
  deliverableList: string[];
  starting_price: number | null;
  currency: string;
  price_note: string | null;
  duration_note: string | null;
  position: number;
  is_published: 0 | 1;
  is_featured: 0 | 1;
  seo_title: string | null;
  seo_description: string | null;
};

export type Family = { key: string; label: string; description: string };

export function ServiceManager({
  csrf,
  services,
  families,
  currency,
  canEdit,
  canDelete,
}: {
  csrf: string;
  services: ServiceRecord[];
  families: Family[];
  currency: string;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [editing, setEditing] = React.useState<ServiceRecord | 'new' | null>(null);
  const [defaultFamily, setDefaultFamily] = React.useState(families[0]?.key ?? 'web');

  return (
    <div className="space-y-8">
      {families.map((family) => {
        const rows = services.filter((service) => service.family === family.key);

        return (
          <section key={family.key}>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div className="min-w-0">
                <h2 className="flex items-center gap-2 text-[0.9375rem] font-semibold text-fg">
                  {family.label}
                  {rows.length > 0 && (
                    <span className="rounded-full bg-surface-sunken px-1.5 py-0.5 text-[0.625rem] tabular-nums text-fg-subtle">
                      {rows.length}
                    </span>
                  )}
                </h2>
                <p className="mt-0.5 text-[0.75rem] text-fg-muted">{family.description}</p>
              </div>

              {canEdit && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setDefaultFamily(family.key);
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
                    Aucune prestation dans cette famille — elle n’apparaît pas sur le site.
                  </p>
                </CardBody>
              </Card>
            ) : (
              <ul className="grid gap-2.5 sm:grid-cols-2">
                {rows.map((service) => (
                  <ServiceCard
                    key={service.id}
                    csrf={csrf}
                    service={service}
                    canEdit={canEdit}
                    canDelete={canDelete}
                    onEdit={() => setEditing(service)}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}

      {editing !== null && (
        <ServiceModal
          csrf={csrf}
          service={editing === 'new' ? null : editing}
          families={families}
          defaultFamily={defaultFamily}
          currency={currency}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function ServiceCard({
  csrf,
  service,
  canEdit,
  canDelete,
  onEdit,
}: {
  csrf: string;
  service: ServiceRecord;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
}) {
  const { run, busy } = useAction(csrf);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  return (
    <li
      className={cn(
        'flex flex-col rounded-[var(--radius-card)] border border-line bg-surface-raised p-4',
        service.is_published === 0 && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-[0.875rem] font-semibold text-fg">{service.name}</p>
        <div className="flex shrink-0 items-center gap-1">
          {service.is_featured === 1 && <Star className="size-3.5 fill-warning text-warning" aria-label="Mis en avant" />}
          {service.is_published === 0 && <Badge tone="outline">Masqué</Badge>}
        </div>
      </div>

      {service.short_description && (
        <p className="mt-1.5 line-clamp-2 text-[0.75rem] leading-relaxed text-fg-muted">
          {service.short_description}
        </p>
      )}

      {service.bullets.length > 0 && (
        <p className="mt-2 line-clamp-1 text-[0.6875rem] text-fg-subtle">
          {service.bullets.slice(0, 3).join(' · ')}
          {service.bullets.length > 3 && ` +${service.bullets.length - 3}`}
        </p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2.5">
        <span className="text-[0.75rem] tabular-nums text-fg">
          {service.starting_price !== null && service.starting_price > 0
            ? `dès ${formatMoney(service.starting_price, service.currency)}`
            : 'sur devis'}
        </span>

        <div className="flex items-center gap-1">
          {canEdit && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(`/api/services/${service.id}`, {
                    method: 'PATCH',
                    body: { is_published: service.is_published === 0 },
                    success: service.is_published === 1 ? 'Retiré du site.' : 'Publié.',
                  })
                }
                aria-label={service.is_published === 1 ? 'Retirer du site' : 'Publier'}
                className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
              >
                {service.is_published === 1 ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
              </button>
              <button
                type="button"
                onClick={onEdit}
                aria-label={`Modifier ${service.name}`}
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
              aria-label={`Supprimer ${service.name}`}
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
          await run(`/api/services/${service.id}?force=1`, { method: 'DELETE', success: 'Service supprimé.' });
        }}
        title={`Supprimer « ${service.name} » ?`}
        message="Les devis et factures existants conservent leurs lignes : elles gardent leur propre libellé et leur prix. Pour retirer la prestation du site sans l’effacer, utilisez plutôt « Masquer »."
        confirmLabel="Supprimer"
        busy={busy}
      />
    </li>
  );
}

/** Editable string list, used for both bullets and deliverables. */
function ListEditor({
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
    const value = draft.trim();
    if (value.length === 0) return;
    onChange([...items, value]);
    setDraft('');
  };

  return (
    <div>
      <p className="mb-1.5 text-[0.8125rem] font-medium text-fg">{label}</p>
      {hint && <p className="mb-2 text-[0.75rem] text-fg-muted">{hint}</p>}

      {items.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {items.map((item, index) => (
            <li key={`${item}-${index}`} className="flex items-center gap-2 rounded-md bg-surface-sunken px-2.5 py-1.5">
              <span className="min-w-0 flex-1 text-[0.75rem] text-fg">{item}</span>
              <button
                type="button"
                onClick={() => onChange(items.filter((_, i) => i !== index))}
                aria-label={`Retirer ${item}`}
                className="rounded p-0.5 text-fg-subtle transition-colors hover:text-danger"
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
          maxLength={300}
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

function ServiceModal({
  csrf,
  service,
  families,
  defaultFamily,
  currency,
  onClose,
}: {
  csrf: string;
  service: ServiceRecord | null;
  families: Family[];
  defaultFamily: string;
  currency: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { run, busy } = useAction(csrf);

  const [values, setValues] = React.useState({
    name: service?.name ?? '',
    family: service?.family ?? defaultFamily,
    short_description: service?.short_description ?? '',
    description: service?.description ?? '',
    bullets: service?.bullets ?? [],
    deliverables: service?.deliverableList ?? [],
    starting_price: service?.starting_price !== null && service?.starting_price !== undefined ? String(service.starting_price) : '',
    currency: service?.currency ?? currency,
    price_note: service?.price_note ?? '',
    duration_note: service?.duration_note ?? '',
    seo_title: service?.seo_title ?? '',
    seo_description: service?.seo_description ?? '',
    is_published: service ? service.is_published === 1 : true,
    is_featured: service ? service.is_featured === 1 : false,
  });

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  return (
    <Modal
      open
      onClose={onClose}
      title={service ? 'Modifier la prestation' : 'Nouvelle prestation'}
      description="Ces informations alimentent la page publique /services et le catalogue utilisé dans les devis."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={busy || values.name.trim().length < 2}
            onClick={async () => {
              const payload = {
                name: values.name.trim(),
                family: values.family,
                short_description: values.short_description || null,
                description: values.description || null,
                bullets: values.bullets,
                deliverables: values.deliverables,
                starting_price: values.starting_price ? Number(values.starting_price) : null,
                currency: values.currency,
                price_note: values.price_note || null,
                duration_note: values.duration_note || null,
                seo_title: values.seo_title || null,
                seo_description: values.seo_description || null,
                is_published: values.is_published,
                is_featured: values.is_featured,
              };

              const result = service
                ? await run(`/api/services/${service.id}`, { method: 'PATCH', body: payload, success: 'Prestation enregistrée.' })
                : await run('/api/services', { method: 'POST', body: payload, success: 'Prestation créée.' });

              if (result) {
                router.refresh();
                onClose();
              }
            }}
          >
            {service ? 'Enregistrer' : 'Créer'}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nom de la prestation" required htmlFor="sv-name" className="sm:col-span-2">
            <Input id="sv-name" value={values.name} onChange={(e) => set('name', e.target.value)} maxLength={160} autoFocus />
          </Field>

          <Field label="Famille" htmlFor="sv-family">
            <Select id="sv-family" value={values.family} onChange={(e) => set('family', e.target.value)}>
              {families.map((family) => (
                <option key={family.key} value={family.key}>
                  {family.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={`Prix de départ (${values.currency})`} htmlFor="sv-price" hint="vide = sur devis">
            <Input
              id="sv-price"
              type="number"
              min={0}
              step="0.01"
              value={values.starting_price}
              onChange={(e) => set('starting_price', e.target.value)}
              className="tabular-nums"
            />
          </Field>

          <Field label="Précision tarifaire" htmlFor="sv-price-note" hint="par exemple : selon le périmètre">
            <Input id="sv-price-note" value={values.price_note} onChange={(e) => set('price_note', e.target.value)} maxLength={200} />
          </Field>

          <Field label="Délai indicatif" htmlFor="sv-duration" hint="par exemple : 2 à 4 semaines">
            <Input id="sv-duration" value={values.duration_note} onChange={(e) => set('duration_note', e.target.value)} maxLength={200} />
          </Field>

          <Field label="Description courte" htmlFor="sv-short" className="sm:col-span-2" hint="une à deux phrases, affichées sur la carte">
            <Textarea id="sv-short" rows={2} value={values.short_description} onChange={(e) => set('short_description', e.target.value)} maxLength={400} />
          </Field>

          <Field label="Description détaillée" htmlFor="sv-description" className="sm:col-span-2">
            <Textarea id="sv-description" rows={5} value={values.description} onChange={(e) => set('description', e.target.value)} maxLength={8000} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <ListEditor
            label="Ce que comprend la prestation"
            hint="Affiché en liste à puces sur la page du service."
            items={values.bullets}
            onChange={(items) => set('bullets', items)}
            placeholder="Maquettes, intégration…"
          />
          <ListEditor
            label="Livrables"
            hint="Ce que le client reçoit concrètement."
            items={values.deliverables}
            onChange={(items) => set('deliverables', items)}
            placeholder="Site en ligne, code source…"
          />
        </div>

        <details className="rounded-lg bg-surface-sunken px-3 py-2.5">
          <summary className="cursor-pointer text-[0.8125rem] font-medium text-fg">Référencement</summary>
          <div className="mt-3 grid gap-3">
            <Field label="Titre SEO" htmlFor="sv-seo-title" hint="55 à 60 caractères ; vide = le nom de la prestation">
              <Input id="sv-seo-title" value={values.seo_title} onChange={(e) => set('seo_title', e.target.value)} maxLength={200} />
            </Field>
            <Field label="Description SEO" htmlFor="sv-seo-desc" hint="150 à 158 caractères">
              <Textarea id="sv-seo-desc" rows={2} value={values.seo_description} onChange={(e) => set('seo_description', e.target.value)} maxLength={400} />
            </Field>
          </div>
        </details>

        <div className="flex flex-wrap gap-4 rounded-lg bg-surface-sunken px-3 py-2.5">
          <Switch
            checked={values.is_published}
            onChange={(next) => set('is_published', next)}
            label={values.is_published ? 'Publié sur le site' : 'Masqué'}
          />
          <Switch
            checked={values.is_featured}
            onChange={(next) => set('is_featured', next)}
            label="Mise en avant sur l’accueil"
          />
        </div>
      </div>
    </Modal>
  );
}
