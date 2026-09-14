'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { useAction } from './use-resource-form';

/** Copies the brief link to the clipboard, with a visible confirmation. */
export function CopyLinkButton({ url, label = 'Copier le lien' }: { url: string; label?: string }) {
  const [copied, setCopied] = React.useState(false);

  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard denied (insecure context, permission): select the text so
          // the user can copy it by hand instead of silently doing nothing.
          window.prompt('Copiez ce lien :', url);
        }
      }}
    >
      {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
      {copied ? 'Copié' : label}
    </Button>
  );
}

export function NewBriefButton({
  csrf,
  clients,
  projects,
}: {
  csrf: string;
  clients: { id: number; label: string }[];
  projects: { id: number; label: string; client_id: number | null }[];
}) {
  const router = useRouter();
  const { run, busy } = useAction(csrf);
  const [open, setOpen] = React.useState(false);
  const [values, setValues] = React.useState({
    title: '',
    client_id: '',
    project_id: '',
    intro_text:
      'Quelques questions pour cadrer votre projet. Vos réponses sont enregistrées à chaque étape : vous pouvez reprendre plus tard avec le même lien.',
    locale: 'fr',
    expires_in_days: '30',
  });

  const set = (key: keyof typeof values, value: string) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  // Picking a project implies its client, which is almost always what you want.
  const onProjectChange = (projectId: string) => {
    set('project_id', projectId);
    const project = projects.find((p) => String(p.id) === projectId);
    if (project?.client_id) set('client_id', String(project.client_id));
    if (project && values.title.trim() === '') set('title', `Brief — ${project.label}`);
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" />
        Nouveau brief
      </Button>

      {open && (
        <Modal
          open
          onClose={() => setOpen(false)}
          title="Nouveau brief client"
          description="Un lien unique est généré. Le client répond sans créer de compte ; chaque réponse alimente la timeline du projet."
          size="md"
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(false)}>
                Annuler
              </Button>
              <Button
                disabled={busy || values.title.trim().length < 2}
                onClick={async () => {
                  const result = await run<{ id: number }>('/api/briefs', {
                    method: 'POST',
                    body: {
                      title: values.title.trim(),
                      client_id: values.client_id ? Number(values.client_id) : null,
                      project_id: values.project_id ? Number(values.project_id) : null,
                      intro_text: values.intro_text || null,
                      locale: values.locale,
                      expires_in_days: values.expires_in_days ? Number(values.expires_in_days) : null,
                    },
                    success: 'Brief créé.',
                  });
                  if (result?.id) {
                    setOpen(false);
                    router.push(`/espace-admin/briefs/${result.id}`);
                  }
                }}
              >
                Créer le brief
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <Field label="Titre" required htmlFor="nb-title">
              <Input id="nb-title" value={values.title} onChange={(e) => set('title', e.target.value)} maxLength={200} autoFocus />
            </Field>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Projet" htmlFor="nb-project">
                <Select id="nb-project" value={values.project_id} onChange={(e) => onProjectChange(e.target.value)}>
                  <option value="">Aucun projet</option>
                  {projects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Client" htmlFor="nb-client">
                <Select id="nb-client" value={values.client_id} onChange={(e) => set('client_id', e.target.value)}>
                  <option value="">Aucun client</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Langue du brief" htmlFor="nb-locale">
                <Select id="nb-locale" value={values.locale} onChange={(e) => set('locale', e.target.value)}>
                  <option value="fr">Français</option>
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                </Select>
              </Field>
              <Field
                label="Validité du lien (jours)"
                htmlFor="nb-expiry"
                hint="Vide = sans expiration"
              >
                <Input
                  id="nb-expiry"
                  type="number"
                  min={1}
                  max={365}
                  value={values.expires_in_days}
                  onChange={(e) => set('expires_in_days', e.target.value)}
                  className="tabular-nums"
                />
              </Field>
            </div>

            <Field label="Message d’introduction" htmlFor="nb-intro">
              <Textarea id="nb-intro" rows={3} value={values.intro_text} onChange={(e) => set('intro_text', e.target.value)} maxLength={2000} />
            </Field>
          </div>
        </Modal>
      )}
    </>
  );
}

/** Invalidates the current link and issues a new one. */
export function RegenerateTokenButton({ csrf, briefId }: { csrf: string; briefId: number }) {
  const { run, busy } = useAction(csrf);
  const [confirm, setConfirm] = React.useState(false);

  return (
    <>
      <Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirm(true)}>
        <KeyRound className="size-3.5" />
        Nouveau lien
      </Button>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          await run(`/api/briefs/${briefId}`, {
            method: 'PATCH',
            body: { regenerate_token: true },
            success: 'Nouveau lien généré.',
          });
        }}
        title="Régénérer le lien du brief ?"
        message="L’ancien lien cessera immédiatement de fonctionner. Les réponses déjà enregistrées sont conservées. Utile si le lien a été partagé par erreur."
        confirmLabel="Régénérer"
        busy={busy}
      />
    </>
  );
}

export function DeleteBriefButton({ csrf, briefId }: { csrf: string; briefId: number }) {
  const router = useRouter();
  const { run, busy } = useAction(csrf);
  const [confirm, setConfirm] = React.useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="text-danger hover:bg-danger-soft"
        disabled={busy}
        onClick={() => setConfirm(true)}
      >
        <Trash2 className="size-3.5" />
        Supprimer
      </Button>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          const result = await run(`/api/briefs/${briefId}`, { method: 'DELETE', success: 'Brief supprimé.' });
          if (result) router.push('/espace-admin/briefs');
        }}
        title="Supprimer ce brief ?"
        message="Les questions et toutes les réponses du client seront définitivement perdues."
        confirmLabel="Supprimer"
        busy={busy}
      />
    </>
  );
}
