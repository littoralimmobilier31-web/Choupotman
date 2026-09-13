'use client';

import * as React from 'react';
import { Save, Sparkles, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Field, Input, Select, Textarea, Switch } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/modal';
import { useResourceForm } from './use-resource-form';

/**
 * Project create / edit form.
 *
 * On creation, `scaffold` controls whether the automation engine generates the
 * production stages, the starter tasks and the folder tree. It is on by default
 * because that is the point of the system; turning it off is for importing an
 * already-organised project.
 */

export type ProjectFormValues = {
  title: string;
  client_id: string;
  category_id: string;
  description: string;
  status: string;
  priority: string;
  budget: string;
  currency: string;
  start_date: string;
  delivery_date: string;
  revisions_included: string;
  revision_extra_cost: string;
  notes: string;
  scaffold: boolean;
};

/**
 * Fills in the defaults for whatever the caller did not supply.
 *
 * This is deliberately *not* exported: it runs inside the client component, so a
 * server page can pass a partial `initial` (only the fields it looked up) without
 * calling a function that lives on the client.
 */
function withDefaults(defaults?: Partial<ProjectFormValues>): ProjectFormValues {
  return {
    title: '', client_id: '', category_id: '', description: '',
    status: 'planning', priority: 'medium', budget: '', currency: 'DZD',
    start_date: new Date().toISOString().slice(0, 10), delivery_date: '',
    revisions_included: '3', revision_extra_cost: '0', notes: '', scaffold: true,
    ...defaults,
  };
}

const STATUSES = [
  { value: 'prospect', label: 'Prospect' },
  { value: 'planning', label: 'Planification' },
  { value: 'in_progress', label: 'En cours' },
  { value: 'in_review', label: 'En révision' },
  { value: 'awaiting_client', label: 'En attente client' },
  { value: 'completed', label: 'Terminé' },
  { value: 'archived', label: 'Archivé' },
];

const PRIORITIES = [
  { value: 'low', label: 'Basse' },
  { value: 'medium', label: 'Moyenne' },
  { value: 'high', label: 'Haute' },
  { value: 'urgent', label: 'Urgente' },
];

const CURRENCIES = ['DZD', 'EUR', 'USD', 'MAD', 'TND', 'GBP'];

export function ProjectForm({
  csrf,
  initial,
  projectId,
  clients,
  categories,
  canDelete = false,
}: {
  csrf: string;
  initial?: Partial<ProjectFormValues>;
  projectId?: number;
  clients: { id: number; label: string; currency: string }[];
  categories: { id: number; name: string }[];
  canDelete?: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const form = useResourceForm<ProjectFormValues>({
    initial: withDefaults(initial),
    endpoint: projectId ? `/api/projets/${projectId}` : '/api/projets',
    method: projectId ? 'PATCH' : 'POST',
    csrf,
    successMessage: projectId ? 'Projet mis à jour.' : 'Projet créé.',
    redirectTo: projectId ? undefined : (payload) => `/espace-admin/projets/${payload.id}`,
    deleteEndpoint: projectId ? `/api/projets/${projectId}` : undefined,
    deleteRedirectTo: '/espace-admin/projets',
    transform: (values) => ({
      title: values.title,
      client_id: values.client_id ? Number(values.client_id) : null,
      category_id: values.category_id ? Number(values.category_id) : null,
      description: values.description || null,
      status: values.status,
      priority: values.priority,
      budget: Number(values.budget) || 0,
      currency: values.currency,
      start_date: values.start_date || null,
      delivery_date: values.delivery_date || null,
      revisions_included: Number(values.revisions_included) || 0,
      revision_extra_cost: Number(values.revision_extra_cost) || 0,
      notes: values.notes || null,
      scaffold: projectId ? false : values.scaffold,
    }),
  });

  const { values, set, fieldErrors } = form;

  // Selecting a client adopts its billing currency, which is almost always what
  // you want and avoids invoicing in the wrong one.
  const onClientChange = (clientId: string) => {
    set('client_id', clientId);
    const client = clients.find((c) => String(c.id) === clientId);
    if (client && client.currency) set('currency', client.currency);
  };

  // A delivery date before the start date is a data-entry slip worth catching.
  const dateConflict =
    values.start_date !== '' && values.delivery_date !== '' && values.delivery_date < values.start_date;

  return (
    <form onSubmit={form.submit} className="space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Informations générales</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 pt-3 sm:grid-cols-2">
          <Field label="Titre du projet" required htmlFor="p-title" error={fieldErrors.title} className="sm:col-span-2">
            <Input id="p-title" value={values.title} onChange={(e) => set('title', e.target.value)} maxLength={160} autoFocus />
          </Field>

          <Field label="Client" htmlFor="p-client" error={fieldErrors.client_id}>
            <Select id="p-client" value={values.client_id} onChange={(e) => onClientChange(e.target.value)}>
              <option value="">Aucun client</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Catégorie" htmlFor="p-category">
            <Select id="p-category" value={values.category_id} onChange={(e) => set('category_id', e.target.value)}>
              <option value="">Non classé</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Description" htmlFor="p-description" className="sm:col-span-2">
            <Textarea id="p-description" rows={4} value={values.description} onChange={(e) => set('description', e.target.value)} maxLength={6000} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Planning & suivi</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 pt-3 sm:grid-cols-2">
          <Field label="Statut" htmlFor="p-status">
            <Select id="p-status" value={values.status} onChange={(e) => set('status', e.target.value)}>
              {STATUSES.map((status) => (
                <option key={status.value} value={status.value}>
                  {status.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Priorité" htmlFor="p-priority">
            <Select id="p-priority" value={values.priority} onChange={(e) => set('priority', e.target.value)}>
              {PRIORITIES.map((priority) => (
                <option key={priority.value} value={priority.value}>
                  {priority.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Date de début" htmlFor="p-start">
            <Input id="p-start" type="date" value={values.start_date} onChange={(e) => set('start_date', e.target.value)} />
          </Field>
          <Field
            label="Date de livraison"
            htmlFor="p-delivery"
            error={dateConflict ? 'La livraison est antérieure au début du projet.' : fieldErrors.delivery_date}
          >
            <Input id="p-delivery" type="date" value={values.delivery_date} onChange={(e) => set('delivery_date', e.target.value)} />
          </Field>
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Budget & révisions</CardTitle>
        </CardHeader>
        <CardBody className="grid gap-4 pt-3 sm:grid-cols-2">
          <Field label="Budget" htmlFor="p-budget" error={fieldErrors.budget}>
            <Input
              id="p-budget"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={values.budget}
              onChange={(e) => set('budget', e.target.value)}
              className="tabular-nums"
            />
          </Field>
          <Field label="Devise" htmlFor="p-currency">
            <Select id="p-currency" value={values.currency} onChange={(e) => set('currency', e.target.value)}>
              {CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Révisions incluses"
            htmlFor="p-revisions"
            hint="au-delà, un supplément est calculé"
          >
            <Input
              id="p-revisions"
              type="number"
              min={0}
              max={99}
              value={values.revisions_included}
              onChange={(e) => set('revisions_included', e.target.value)}
              className="tabular-nums"
            />
          </Field>
          <Field label="Coût d’une révision supplémentaire" htmlFor="p-revision-cost">
            <Input
              id="p-revision-cost"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={values.revision_extra_cost}
              onChange={(e) => set('revision_extra_cost', e.target.value)}
              className="tabular-nums"
            />
          </Field>
          <Field label="Notes internes" htmlFor="p-notes" className="sm:col-span-2">
            <Textarea id="p-notes" rows={3} value={values.notes} onChange={(e) => set('notes', e.target.value)} maxLength={6000} />
          </Field>
        </CardBody>
      </Card>

      {!projectId && (
        <Card>
          <CardBody className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 max-w-lg">
              <p className="flex items-center gap-2 text-[0.875rem] font-semibold text-fg">
                <Sparkles className="size-4 text-accent" />
                Structurer automatiquement le projet
              </p>
              <p className="mt-1.5 text-[0.75rem] leading-relaxed text-fg-muted">
                Crée les 7 étapes de production, les tâches de démarrage et l’arborescence de dossiers
                (01-Documents, 02-Design, …). Désactivez si vous importez un projet déjà organisé.
              </p>
            </div>
            <Switch checked={values.scaffold} onChange={(next) => set('scaffold', next)} label={values.scaffold ? 'Activé' : 'Désactivé'} />
          </CardBody>
        </Card>
      )}

      {form.error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2.5 text-[0.8125rem] font-medium text-danger" role="alert">
          {form.error}
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Button type="submit" disabled={form.busy || values.title.trim().length < 2 || dateConflict}>
          <Save className="size-4" />
          {form.busy ? 'Enregistrement…' : projectId ? 'Enregistrer' : 'Créer le projet'}
        </Button>

        {form.dirty && <span className="text-[0.75rem] text-warning">Modifications non enregistrées</span>}

        {canDelete && projectId && (
          <Button
            type="button"
            variant="ghost"
            className="ms-auto text-danger hover:bg-danger-soft"
            onClick={() => setConfirmDelete(true)}
            disabled={form.deleting}
          >
            <Trash2 className="size-4" />
            Supprimer
          </Button>
        )}
      </div>

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          await form.remove();
        }}
        title="Supprimer ce projet ?"
        message="Les étapes, tâches et fichiers associés seront supprimés. Si des factures ont été émises, le projet sera archivé afin de conserver la piste comptable."
        confirmLabel="Supprimer"
        busy={form.deleting}
      />
    </form>
  );
}
