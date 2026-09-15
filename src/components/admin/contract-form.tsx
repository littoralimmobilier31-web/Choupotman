'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { FileSignature, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { useAction } from './use-resource-form';

/**
 * Contract creation.
 *
 * A template is shown raw, variables and all, and the substitution happens
 * server-side at creation from the client and project records. Showing the raw
 * template is deliberate: it makes clear that `{{client_name}}` is a placeholder
 * about to be filled rather than text to edit by hand.
 */

export type Option = { value: string; label: string };
export type ProjectOption = Option & { clientId: number | null };
export type TemplateOption = { id: number; name: string; body: string; is_default: 0 | 1 };

export function ContractForm({
  csrf,
  clients,
  projects,
  templates,
  currency,
}: {
  csrf: string;
  clients: Option[];
  projects: ProjectOption[];
  templates: TemplateOption[];
  currency: string;
}) {
  const router = useRouter();
  const { run, busy } = useAction(csrf);

  const defaultTemplate = templates.find((template) => template.is_default === 1) ?? templates[0];

  const [values, setValues] = React.useState({
    template_id: defaultTemplate ? String(defaultTemplate.id) : '',
    client_id: '',
    project_id: '',
    title: '',
    body: '',
    amount: '',
    currency,
    start_date: '',
    delivery_date: '',
    locale: 'fr',
  });

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  const template = templates.find((entry) => String(entry.id) === values.template_id);

  /** Choosing a project pre-fills its client and title — they are almost always the same. */
  const onProjectChange = (value: string) => {
    const project = projects.find((entry) => entry.value === value);
    setValues((previous) => ({
      ...previous,
      project_id: value,
      client_id: project?.clientId ? String(project.clientId) : previous.client_id,
      title: previous.title || (project ? `Contrat de prestation — ${project.label}` : previous.title),
    }));
  };

  const valid = values.title.trim().length >= 2 && (template !== undefined || values.body.trim().length >= 20);

  return (
    <form
      onSubmit={async (event) => {
        event.preventDefault();
        const result = await run<{ id?: number }>('/api/contrats', {
          body: {
            template_id: values.template_id ? Number(values.template_id) : null,
            client_id: values.client_id ? Number(values.client_id) : null,
            project_id: values.project_id ? Number(values.project_id) : null,
            title: values.title.trim(),
            // With a template chosen the server expands it; otherwise this is the text.
            body: template ? '' : values.body,
            amount: Number(values.amount) || 0,
            currency: values.currency,
            start_date: values.start_date || null,
            delivery_date: values.delivery_date || null,
            locale: values.locale,
          },
          success: 'Contrat créé.',
          silent: true,
        });
        if (result?.id) router.push(`/espace-admin/contrats/${result.id}`);
      }}
      className="space-y-5"
    >
      <Card>
        <CardBody className="grid gap-3 sm:grid-cols-2">
          {templates.length > 0 && (
            <Field
              label="Modèle"
              htmlFor="cf-template"
              hint="Le texte du modèle est recopié dans le contrat, variables remplacées."
              className="sm:col-span-2"
            >
              <Select
                id="cf-template"
                value={values.template_id}
                onChange={(event) => set('template_id', event.target.value)}
              >
                <option value="">Aucun — rédiger librement</option>
                {templates.map((entry) => (
                  <option key={entry.id} value={String(entry.id)}>
                    {entry.name}
                    {entry.is_default === 1 ? ' (par défaut)' : ''}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field label="Projet" htmlFor="cf-project">
            <Select id="cf-project" value={values.project_id} onChange={(event) => onProjectChange(event.target.value)}>
              <option value="">Aucun</option>
              {projects.map((project) => (
                <option key={project.value} value={project.value}>
                  {project.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Client" htmlFor="cf-client">
            <Select id="cf-client" value={values.client_id} onChange={(event) => set('client_id', event.target.value)}>
              <option value="">Aucun</option>
              {clients.map((client) => (
                <option key={client.value} value={client.value}>
                  {client.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Intitulé du contrat" htmlFor="cf-title" required className="sm:col-span-2">
            <Input
              id="cf-title"
              value={values.title}
              onChange={(event) => set('title', event.target.value)}
              maxLength={200}
              placeholder="Contrat de prestation — Site vitrine"
            />
          </Field>

          <Field label={`Montant (${values.currency})`} htmlFor="cf-amount">
            <Input
              id="cf-amount"
              type="number"
              min={0}
              step="0.01"
              value={values.amount}
              onChange={(event) => set('amount', event.target.value)}
              className="tabular-nums"
            />
          </Field>

          <Field label="Langue" htmlFor="cf-locale">
            <Select id="cf-locale" value={values.locale} onChange={(event) => set('locale', event.target.value)}>
              <option value="fr">Français</option>
              <option value="ar">العربية</option>
              <option value="en">English</option>
            </Select>
          </Field>

          <Field label="Date de début" htmlFor="cf-start">
            <Input
              id="cf-start"
              type="date"
              value={values.start_date}
              onChange={(event) => set('start_date', event.target.value)}
            />
          </Field>

          <Field label="Date de livraison" htmlFor="cf-delivery">
            <Input
              id="cf-delivery"
              type="date"
              value={values.delivery_date}
              onChange={(event) => set('delivery_date', event.target.value)}
            />
          </Field>
        </CardBody>
      </Card>

      {template ? (
        <Card>
          <CardBody>
            <p className="mb-2 flex items-start gap-1.5 text-[0.75rem] leading-relaxed text-fg-muted">
              <Info className="mt-0.5 size-3.5 shrink-0 text-accent" />
              Aperçu du modèle. Les variables entre accolades seront remplacées à la création par les informations
              du client, du projet et de votre profil — vous pourrez ensuite ajuster le texte du contrat obtenu.
            </p>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-surface-sunken p-3 font-mono text-[0.6875rem] leading-relaxed text-fg-muted">
              {template.body}
            </pre>
          </CardBody>
        </Card>
      ) : (
        <Card>
          <CardBody>
            <Field label="Texte du contrat" htmlFor="cf-body" required>
              <Textarea
                id="cf-body"
                rows={18}
                value={values.body}
                onChange={(event) => set('body', event.target.value)}
                maxLength={60000}
                className="font-mono text-[0.75rem]"
              />
            </Field>
          </CardBody>
        </Card>
      )}

      <div className="sticky bottom-0 -mx-4 flex flex-wrap items-center gap-3 border-t border-line bg-surface/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <Button type="submit" disabled={busy || !valid}>
          <FileSignature className="size-4" />
          {busy ? 'Création…' : 'Créer le contrat'}
        </Button>
        <span className="text-[0.75rem] text-fg-subtle">
          Le contrat est créé en brouillon : vous pourrez le relire, l’exporter en PDF, puis le marquer signé.
        </span>
      </div>
    </form>
  );
}
