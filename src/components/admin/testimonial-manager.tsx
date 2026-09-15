'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Pencil, Plus, Quote, Star, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Field, Input, Select, Textarea, Switch } from '@/components/ui/field';
import { useAction } from './use-resource-form';

/**
 * Client testimonials.
 *
 * The quote is stored and shown exactly as entered. Nothing here generates,
 * rewrites or "improves" a testimonial: the only way a quote reaches the public
 * site is by someone typing what a client actually said, and the interface says
 * so rather than assuming it.
 */

export type TestimonialRecord = {
  id: number;
  author_name: string;
  author_role: string | null;
  company: string | null;
  avatar_url: string | null;
  quote: string;
  rating: number | null;
  client_id: number | null;
  project_id: number | null;
  locale: string;
  is_published: 0 | 1;
  is_demo: 0 | 1;
  position: number;
};

export type Option = { value: string; label: string };

export function TestimonialManager({
  csrf,
  testimonials,
  clients,
  projects,
  canEdit,
  canDelete,
}: {
  csrf: string;
  testimonials: TestimonialRecord[];
  clients: Option[];
  projects: Option[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [editing, setEditing] = React.useState<TestimonialRecord | 'new' | null>(null);

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => setEditing('new')}>
            <Plus className="size-3.5" />
            Ajouter un témoignage
          </Button>
        </div>
      )}

      {testimonials.length === 0 ? (
        <Card>
          <CardBody className="py-8 text-center">
            <Quote className="mx-auto mb-2 size-5 text-fg-subtle" />
            <p className="text-[0.875rem] font-medium text-fg">Aucun témoignage</p>
            <p className="mx-auto mt-1 max-w-md text-[0.8125rem] leading-relaxed text-fg-muted">
              Demandez un retour écrit à un client après une livraison, puis recopiez-le ici tel quel. Aucun
              témoignage n’est rédigé à votre place : la section reste absente du site tant qu’elle est vide.
            </p>
          </CardBody>
        </Card>
      ) : (
        <ul className="grid gap-2.5 sm:grid-cols-2">
          {testimonials.map((testimonial) => (
            <TestimonialCard
              key={testimonial.id}
              csrf={csrf}
              testimonial={testimonial}
              canEdit={canEdit}
              canDelete={canDelete}
              onEdit={() => setEditing(testimonial)}
            />
          ))}
        </ul>
      )}

      {editing !== null && (
        <TestimonialModal
          csrf={csrf}
          testimonial={editing === 'new' ? null : editing}
          clients={clients}
          projects={projects}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

function TestimonialCard({
  csrf,
  testimonial,
  canEdit,
  canDelete,
  onEdit,
}: {
  csrf: string;
  testimonial: TestimonialRecord;
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
        testimonial.is_published === 0 && 'opacity-60',
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[0.875rem] font-semibold text-fg">{testimonial.author_name}</p>
          <p className="truncate text-[0.6875rem] text-fg-subtle">
            {[testimonial.author_role, testimonial.company].filter(Boolean).join(' · ') || '—'}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {testimonial.is_demo === 1 && <Badge tone="warning">DÉMO</Badge>}
          {testimonial.is_published === 0 && <Badge tone="outline">Masqué</Badge>}
        </div>
      </div>

      {testimonial.rating !== null && (
        <div className="mt-2 flex items-center gap-0.5" aria-label={`${testimonial.rating} sur 5`}>
          {[1, 2, 3, 4, 5].map((step) => (
            <Star
              key={step}
              className={cn(
                'size-3',
                step <= (testimonial.rating ?? 0) ? 'fill-warning text-warning' : 'text-line',
              )}
            />
          ))}
        </div>
      )}

      <blockquote className="mt-2 line-clamp-4 border-s-2 border-line ps-2.5 text-[0.75rem] leading-relaxed text-fg-muted">
        {testimonial.quote}
      </blockquote>

      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2.5">
        <span className="text-[0.625rem] uppercase text-fg-subtle">{testimonial.locale}</span>

        <div className="flex items-center gap-1">
          {canEdit && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(`/api/temoignages/${testimonial.id}`, {
                    method: 'PATCH',
                    body: { is_published: testimonial.is_published === 0 },
                    success: testimonial.is_published === 1 ? 'Retiré du site.' : 'Publié.',
                  })
                }
                aria-label={testimonial.is_published === 1 ? 'Retirer du site' : 'Publier'}
                className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
              >
                {testimonial.is_published === 1 ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
              </button>
              <button
                type="button"
                onClick={onEdit}
                aria-label={`Modifier le témoignage de ${testimonial.author_name}`}
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
              aria-label={`Supprimer le témoignage de ${testimonial.author_name}`}
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
          await run(`/api/temoignages/${testimonial.id}?force=1`, {
            method: 'DELETE',
            success: 'Témoignage supprimé.',
          });
        }}
        title="Supprimer ce témoignage ?"
        message="Le texte sera effacé définitivement. Pour le retirer du site en le conservant, utilisez plutôt « Masquer »."
        confirmLabel="Supprimer"
        busy={busy}
      />
    </li>
  );
}

function TestimonialModal({
  csrf,
  testimonial,
  clients,
  projects,
  onClose,
}: {
  csrf: string;
  testimonial: TestimonialRecord | null;
  clients: Option[];
  projects: Option[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { run, busy } = useAction(csrf);

  const [values, setValues] = React.useState({
    author_name: testimonial?.author_name ?? '',
    author_role: testimonial?.author_role ?? '',
    company: testimonial?.company ?? '',
    avatar_url: testimonial?.avatar_url ?? '',
    quote: testimonial?.quote ?? '',
    rating: testimonial?.rating !== null && testimonial?.rating !== undefined ? String(testimonial.rating) : '',
    client_id: testimonial?.client_id !== null && testimonial?.client_id !== undefined ? String(testimonial.client_id) : '',
    project_id: testimonial?.project_id !== null && testimonial?.project_id !== undefined ? String(testimonial.project_id) : '',
    locale: testimonial?.locale ?? 'fr',
    is_published: testimonial ? testimonial.is_published === 1 : false,
  });

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  const valid = values.author_name.trim().length >= 2 && values.quote.trim().length >= 10;

  return (
    <Modal
      open
      onClose={onClose}
      title={testimonial ? 'Modifier le témoignage' : 'Nouveau témoignage'}
      description="Recopiez les mots du client sans les reformuler. C’est ce qui donne sa valeur à un témoignage."
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={busy || !valid}
            onClick={async () => {
              const payload = {
                author_name: values.author_name.trim(),
                author_role: values.author_role.trim() || null,
                company: values.company.trim() || null,
                avatar_url: values.avatar_url.trim() || null,
                quote: values.quote.trim(),
                rating: values.rating ? Number(values.rating) : null,
                client_id: values.client_id ? Number(values.client_id) : null,
                project_id: values.project_id ? Number(values.project_id) : null,
                locale: values.locale,
                is_published: values.is_published,
              };

              const result = testimonial
                ? await run(`/api/temoignages/${testimonial.id}`, {
                    method: 'PATCH',
                    body: payload,
                    success: 'Témoignage enregistré.',
                  })
                : await run('/api/temoignages', { method: 'POST', body: payload, success: 'Témoignage ajouté.' });

              if (result) {
                router.refresh();
                onClose();
              }
            }}
          >
            {testimonial ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nom du client" htmlFor="tm-name" required>
          <Input
            id="tm-name"
            value={values.author_name}
            onChange={(event) => set('author_name', event.target.value)}
            maxLength={160}
            autoFocus
          />
        </Field>

        <Field label="Fonction" htmlFor="tm-role">
          <Input
            id="tm-role"
            value={values.author_role}
            onChange={(event) => set('author_role', event.target.value)}
            maxLength={160}
          />
        </Field>

        <Field label="Entreprise" htmlFor="tm-company">
          <Input
            id="tm-company"
            value={values.company}
            onChange={(event) => set('company', event.target.value)}
            maxLength={160}
          />
        </Field>

        <Field label="Note sur 5" htmlFor="tm-rating" hint="Optionnel : n’indiquez une note que si le client en a donné une.">
          <Select id="tm-rating" value={values.rating} onChange={(event) => set('rating', event.target.value)}>
            <option value="">Aucune note</option>
            {[5, 4, 3, 2, 1].map((step) => (
              <option key={step} value={String(step)}>
                {step} / 5
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Témoignage" htmlFor="tm-quote" required className="sm:col-span-2">
          <Textarea
            id="tm-quote"
            rows={5}
            value={values.quote}
            onChange={(event) => set('quote', event.target.value)}
            maxLength={2000}
          />
        </Field>

        <Field label="Photo (adresse)" htmlFor="tm-avatar" className="sm:col-span-2">
          <Input
            id="tm-avatar"
            value={values.avatar_url}
            onChange={(event) => set('avatar_url', event.target.value)}
            maxLength={500}
            placeholder="https://…"
          />
        </Field>

        <Field label="Fiche client liée" htmlFor="tm-client" hint="Interne : n’apparaît pas sur le site.">
          <Select id="tm-client" value={values.client_id} onChange={(event) => set('client_id', event.target.value)}>
            <option value="">Aucune</option>
            {clients.map((client) => (
              <option key={client.value} value={client.value}>
                {client.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Projet lié" htmlFor="tm-project">
          <Select id="tm-project" value={values.project_id} onChange={(event) => set('project_id', event.target.value)}>
            <option value="">Aucun</option>
            {projects.map((project) => (
              <option key={project.value} value={project.value}>
                {project.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Langue du témoignage" htmlFor="tm-locale">
          <Select id="tm-locale" value={values.locale} onChange={(event) => set('locale', event.target.value)}>
            <option value="fr">Français</option>
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </Select>
        </Field>

        <div className="flex items-center rounded-lg bg-surface-sunken px-3 py-2.5 sm:col-span-2">
          <Switch
            checked={values.is_published}
            onChange={(next) => set('is_published', next)}
            label={values.is_published ? 'Visible sur le site' : 'Masqué'}
          />
        </div>
      </div>
    </Modal>
  );
}
