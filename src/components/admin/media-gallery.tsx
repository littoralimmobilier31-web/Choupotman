'use client';

import * as React from 'react';
import { Film, Image as ImageIcon, Plus, Code2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Field, Input, Select } from '@/components/ui/field';
import { ConfirmDialog } from '@/components/ui/modal';
import { useAction } from './use-resource-form';

/**
 * Gallery attached to a portfolio project.
 *
 * Media are referenced by address rather than uploaded here: the file library
 * owns uploads, and a réalisation often shows images that already live somewhere
 * public. An entry with no address is refused by the API, so the page never
 * renders an empty frame.
 */

export type MediaItem = {
  id: number;
  url: string | null;
  file_id: number | null;
  kind: 'image' | 'video' | 'embed';
  caption: string | null;
  alt_text: string | null;
  position: number;
};

const KIND_LABELS: Record<MediaItem['kind'], string> = {
  image: 'Image',
  video: 'Vidéo',
  embed: 'Intégration',
};

export function MediaGallery({
  csrf,
  endpoint,
  items,
  canEdit,
}: {
  csrf: string;
  endpoint: string;
  items: MediaItem[];
  canEdit: boolean;
}) {
  const { run, busy } = useAction(csrf);
  const [adding, setAdding] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<MediaItem | null>(null);
  const [draft, setDraft] = React.useState({ url: '', kind: 'image', caption: '', alt_text: '' });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>Galerie</CardTitle>
            <CardDescription>
              Captures, visuels et vidéos affichés sur la page publique du projet.
            </CardDescription>
          </div>
          {canEdit && !adding && (
            <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
              <Plus className="size-3.5" />
              Ajouter un média
            </Button>
          )}
        </div>
      </CardHeader>

      <CardBody className="space-y-4">
        {adding && canEdit && (
          <div className="grid gap-3 rounded-lg bg-surface-sunken p-3 sm:grid-cols-2">
            <Field label="Adresse du média" htmlFor="md-url" className="sm:col-span-2" required>
              <Input
                id="md-url"
                value={draft.url}
                onChange={(event) => setDraft((previous) => ({ ...previous, url: event.target.value }))}
                placeholder="https://…"
                maxLength={500}
                autoFocus
              />
            </Field>
            <Field label="Type" htmlFor="md-kind">
              <Select
                id="md-kind"
                value={draft.kind}
                onChange={(event) => setDraft((previous) => ({ ...previous, kind: event.target.value }))}
              >
                {Object.entries(KIND_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Légende" htmlFor="md-caption">
              <Input
                id="md-caption"
                value={draft.caption}
                onChange={(event) => setDraft((previous) => ({ ...previous, caption: event.target.value }))}
                maxLength={300}
              />
            </Field>
            <Field
              label="Texte alternatif"
              htmlFor="md-alt"
              hint="Décrit l’image pour les lecteurs d’écran et quand elle ne charge pas."
              className="sm:col-span-2"
            >
              <Input
                id="md-alt"
                value={draft.alt_text}
                onChange={(event) => setDraft((previous) => ({ ...previous, alt_text: event.target.value }))}
                maxLength={300}
              />
            </Field>
            <div className="flex gap-2 sm:col-span-2">
              <Button
                size="sm"
                disabled={busy || draft.url.trim() === ''}
                onClick={async () => {
                  const result = await run(endpoint, {
                    method: 'POST',
                    body: {
                      url: draft.url.trim(),
                      kind: draft.kind,
                      caption: draft.caption.trim() || null,
                      alt_text: draft.alt_text.trim() || null,
                    },
                    success: 'Média ajouté.',
                  });
                  if (result) {
                    setDraft({ url: '', kind: 'image', caption: '', alt_text: '' });
                    setAdding(false);
                  }
                }}
              >
                Ajouter
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setAdding(false)}>
                Annuler
              </Button>
            </div>
          </div>
        )}

        {items.length === 0 ? (
          <p className="py-2 text-[0.8125rem] text-fg-muted">
            Aucun média. La page du projet affichera uniquement l’image de couverture, si elle est renseignée.
          </p>
        ) : (
          <ul className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {items.map((item) => (
              <li key={item.id} className="overflow-hidden rounded-lg border border-line bg-surface-raised">
                <div className="flex aspect-video items-center justify-center bg-surface-sunken">
                  {item.kind === 'image' && item.url ? (
                    // The address is arbitrary and outside Next's image domains,
                    // so this is a plain <img> on purpose.
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.url}
                      alt={item.alt_text ?? item.caption ?? ''}
                      className="size-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-fg-subtle">
                      {item.kind === 'video' ? <Film className="size-6" /> : <Code2 className="size-6" />}
                    </span>
                  )}
                </div>

                <div className="flex items-start justify-between gap-2 p-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-[0.75rem] font-medium text-fg">
                      {item.caption ?? KIND_LABELS[item.kind]}
                    </p>
                    {item.url && <p className="truncate text-[0.625rem] text-fg-subtle">{item.url}</p>}
                    {item.kind === 'image' && !item.alt_text && (
                      <p className="mt-0.5 text-[0.625rem] text-warning">Texte alternatif manquant</p>
                    )}
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(item)}
                      aria-label="Retirer ce média"
                      className="shrink-0 rounded p-1 text-fg-subtle transition-colors hover:text-danger"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {!canEdit && items.length === 0 && (
          <p className="text-[0.75rem] text-fg-subtle">
            <ImageIcon className="me-1 inline size-3" />
            Vous n’avez pas la permission de modifier cette galerie.
          </p>
        )}
      </CardBody>

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          const target = confirmDelete;
          setConfirmDelete(null);
          if (!target) return;
          await run(`${endpoint}?media=${target.id}`, { method: 'DELETE', success: 'Média retiré.' });
        }}
        title="Retirer ce média ?"
        message="Il disparaît de la page publique. Le fichier lui-même n’est pas supprimé."
        confirmLabel="Retirer"
        busy={busy}
      />
    </Card>
  );
}
