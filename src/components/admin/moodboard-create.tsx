'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { useAction } from './use-resource-form';

export type Option = { value: string; label: string };

/** "New moodboard" button and its dialog, used from the list page header. */
export function NewMoodboardButton({
  csrf,
  clients,
  projects,
}: {
  csrf: string;
  clients: Option[];
  projects: Option[];
}) {
  const router = useRouter();
  const { run, busy } = useAction(csrf);
  const [open, setOpen] = React.useState(false);
  const [values, setValues] = React.useState({ title: '', project_id: '', client_id: '', description: '' });

  const set = <K extends keyof typeof values>(key: K, value: string) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Nouveau moodboard
      </Button>

      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title="Nouveau moodboard"
          description="Vous pourrez ensuite y déposer des images, des couleurs et des notes."
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button
                disabled={busy || values.title.trim().length < 2}
                onClick={async () => {
                  const result = await run<{ id?: number }>('/api/moodboards', {
                    body: {
                      title: values.title.trim(),
                      project_id: values.project_id ? Number(values.project_id) : null,
                      client_id: values.client_id ? Number(values.client_id) : null,
                      description: values.description.trim() || null,
                    },
                    success: 'Moodboard créé.',
                    silent: true,
                  });
                  if (result?.id) router.push(`/espace-admin/moodboards/${result.id}`);
                }}
              >
                Créer
              </Button>
            </>
          }
        >
          <div className="space-y-3">
            <Field label="Titre" htmlFor="mb-title" required>
              <Input
                id="mb-title"
                value={values.title}
                onChange={(event) => set('title', event.target.value)}
                maxLength={200}
                autoFocus
                placeholder="Identité visuelle — Boulangerie Amine"
              />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Projet" htmlFor="mb-project">
                <Select id="mb-project" value={values.project_id} onChange={(event) => set('project_id', event.target.value)}>
                  <option value="">Aucun</option>
                  {projects.map((project) => (
                    <option key={project.value} value={project.value}>
                      {project.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Client" htmlFor="mb-client">
                <Select id="mb-client" value={values.client_id} onChange={(event) => set('client_id', event.target.value)}>
                  <option value="">Aucun</option>
                  {clients.map((client) => (
                    <option key={client.value} value={client.value}>
                      {client.label}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field label="Intention" htmlFor="mb-description" hint="Ce que ce moodboard cherche à établir.">
              <Textarea
                id="mb-description"
                rows={3}
                value={values.description}
                onChange={(event) => set('description', event.target.value)}
                maxLength={2000}
              />
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}
