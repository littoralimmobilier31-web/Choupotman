'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Save, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { useAction } from './use-resource-form';

/**
 * Message composer.
 *
 * Two buttons, not one with a checkbox: saving a draft and sending are different
 * decisions and both are normal. Draft is the primary action on purpose — a
 * message to a client is worth re-reading.
 *
 * Choosing a template fills the subject and body with the raw text, variables
 * still visible. The substitution happens server-side at send time, from the
 * database, so what is filled in is never whatever the browser guessed.
 */

export type Option = { value: string; label: string };
export type TemplateOption = { key: string; name: string; subject: string | null; body: string };

export function MessageComposer({
  csrf,
  clients,
  projects,
  templates,
  mailConfigured,
}: {
  csrf: string;
  clients: Option[];
  projects: Option[];
  templates: TemplateOption[];
  mailConfigured: boolean;
}) {
  const router = useRouter();
  const { run, busy } = useAction(csrf);

  const [values, setValues] = React.useState({
    template_key: '',
    client_id: '',
    project_id: '',
    to_address: '',
    to_name: '',
    subject: '',
    body: '',
  });

  const set = <K extends keyof typeof values>(key: K, value: string) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  const applyTemplate = (key: string) => {
    const template = templates.find((entry) => entry.key === key);
    setValues((previous) => ({
      ...previous,
      template_key: key,
      subject: template?.subject ?? previous.subject,
      body: template?.body ?? previous.body,
    }));
  };

  const valid = values.subject.trim().length >= 2 && values.body.trim().length >= 2;
  const hasRecipient = values.to_address.trim() !== '' || values.client_id !== '';

  const submit = async (send: boolean) => {
    const result = await run<{ id?: number; sent?: boolean; queued?: boolean }>('/api/messages', {
      body: {
        template_key: values.template_key || null,
        client_id: values.client_id ? Number(values.client_id) : null,
        project_id: values.project_id ? Number(values.project_id) : null,
        to_address: values.to_address.trim() || null,
        to_name: values.to_name.trim() || null,
        subject: values.subject.trim(),
        body: values.body.trim(),
        send,
      },
      success: send
        ? mailConfigured
          ? 'Message envoyé.'
          : 'Message mis en attente : aucun serveur d’envoi configuré.'
        : 'Brouillon enregistré.',
    });

    if (result?.id) {
      setValues({
        template_key: '',
        client_id: '',
        project_id: '',
        to_address: '',
        to_name: '',
        subject: '',
        body: '',
      });
      router.refresh();
    }
  };

  const variablesInBody = Array.from(values.body.matchAll(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi)).map(
    (match) => match[1],
  );

  return (
    <Card>
      <CardBody className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {templates.length > 0 && (
            <Field
              label="Modèle"
              htmlFor="mc-template"
              hint="Pré-remplit l’objet et le message. Les variables sont remplacées à l’envoi."
            >
              <Select
                id="mc-template"
                value={values.template_key}
                onChange={(event) => applyTemplate(event.target.value)}
              >
                <option value="">Aucun — écrire librement</option>
                {templates.map((template) => (
                  <option key={template.key} value={template.key}>
                    {template.name}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <Field
            label="Client"
            htmlFor="mc-client"
            hint="L’adresse de la fiche client est utilisée si vous n’en saisissez pas d’autre."
          >
            <Select id="mc-client" value={values.client_id} onChange={(event) => set('client_id', event.target.value)}>
              <option value="">Aucun</option>
              {clients.map((client) => (
                <option key={client.value} value={client.value}>
                  {client.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Projet lié" htmlFor="mc-project" hint="Rattache le message au suivi du projet.">
            <Select
              id="mc-project"
              value={values.project_id}
              onChange={(event) => set('project_id', event.target.value)}
            >
              <option value="">Aucun</option>
              {projects.map((project) => (
                <option key={project.value} value={project.value}>
                  {project.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Adresse destinataire" htmlFor="mc-to" hint="Laissez vide pour utiliser celle du client.">
            <Input
              id="mc-to"
              type="email"
              value={values.to_address}
              onChange={(event) => set('to_address', event.target.value)}
              maxLength={180}
              placeholder="client@exemple.com"
            />
          </Field>

          <Field label="Objet" htmlFor="mc-subject" required className="sm:col-span-2">
            <Input
              id="mc-subject"
              value={values.subject}
              onChange={(event) => set('subject', event.target.value)}
              maxLength={300}
            />
          </Field>

          <Field label="Message" htmlFor="mc-body" required className="sm:col-span-2">
            <Textarea
              id="mc-body"
              rows={10}
              value={values.body}
              onChange={(event) => set('body', event.target.value)}
              maxLength={20000}
            />
          </Field>
        </div>

        {variablesInBody.length > 0 && (
          <p className="rounded-lg bg-surface-sunken px-3 py-2 text-[0.75rem] text-fg-muted">
            Variables détectées :{' '}
            {variablesInBody.map((name) => (
              <code key={name} className="me-1.5 font-mono text-fg">
                {`{{${name}}}`}
              </code>
            ))}
            — elles seront remplacées à l’envoi à partir du client et du projet choisis.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2.5">
          <Button variant="secondary" disabled={busy || !valid} onClick={() => submit(false)}>
            <Save className="size-4" />
            Enregistrer comme brouillon
          </Button>
          <Button disabled={busy || !valid || !hasRecipient} onClick={() => submit(true)}>
            <Send className="size-4" />
            {mailConfigured ? 'Envoyer' : 'Mettre en attente'}
          </Button>
          {!hasRecipient && valid && (
            <span className="text-[0.75rem] text-warning">
              Choisissez un client ou saisissez une adresse pour pouvoir envoyer.
            </span>
          )}
        </div>
      </CardBody>
    </Card>
  );
}
