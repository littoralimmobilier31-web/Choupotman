'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  ExternalLink, Image as ImageIcon, Link2, Palette, Plus, Save, StickyNote, Trash2, Type, Upload,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { useAction } from './use-resource-form';

/**
 * The moodboard canvas.
 *
 * Items are positioned absolutely and dragged with pointer events, which work
 * for mouse, trackpad and touch without a drag-and-drop library. Positions are
 * kept in local state during a drag and written once, for the whole board, when
 * the pointer is released — dragging produces dozens of intermediate positions
 * and only the final arrangement is worth a request.
 *
 * Saving is explicit rather than automatic: rearranging a board is exploratory,
 * and an autosave on every nudge makes "put it back how it was" impossible.
 */

export type CanvasItem = {
  id: number;
  kind: 'image' | 'text' | 'color' | 'link' | 'note';
  file_id: number | null;
  url: string | null;
  source_url: string | null;
  content: string | null;
  color: string | null;
  x: number;
  y: number;
  width: number;
  height: number;
  z_index: number;
  notes: string | null;
};

type Position = { x: number; y: number };

const KIND_ICONS = {
  image: ImageIcon,
  text: Type,
  color: Palette,
  link: Link2,
  note: StickyNote,
} as const;

const KIND_LABELS = {
  image: 'Image',
  text: 'Texte',
  color: 'Couleur',
  link: 'Lien',
  note: 'Note',
} as const;

export function MoodboardCanvas({
  csrf,
  boardId,
  items: initialItems,
  background,
  canEdit,
}: {
  csrf: string;
  boardId: number;
  items: CanvasItem[];
  background: string | null;
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const { run, busy } = useAction(csrf);

  const [items, setItems] = React.useState(initialItems);
  const [positions, setPositions] = React.useState<Record<number, Position>>({});
  const [dragging, setDragging] = React.useState<number | null>(null);
  const [selected, setSelected] = React.useState<CanvasItem | null>(null);
  const [adding, setAdding] = React.useState(false);
  const [confirmDelete, setConfirmDelete] = React.useState<CanvasItem | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Server state is the source of truth; a refresh discards unsaved positions,
  // which is the same contract as any other form on the site.
  React.useEffect(() => {
    setItems(initialItems);
    setPositions({});
  }, [initialItems]);

  const dirty = Object.keys(positions).length > 0;
  const at = (item: CanvasItem): Position => positions[item.id] ?? { x: item.x, y: item.y };

  // The canvas is as tall as its lowest element, plus room to drag into.
  const height = Math.max(
    560,
    ...items.map((item) => at(item).y + item.height + 80),
  );

  const dragState = React.useRef<{ id: number; offsetX: number; offsetY: number } | null>(null);

  const onPointerDown = (event: React.PointerEvent, item: CanvasItem) => {
    if (!canEdit) return;
    // Let text selection and links behave normally.
    if ((event.target as HTMLElement).closest('a, button, textarea, input')) return;

    const current = at(item);
    const board = event.currentTarget.parentElement?.getBoundingClientRect();
    if (!board) return;

    dragState.current = {
      id: item.id,
      offsetX: event.clientX - board.left - current.x,
      offsetY: event.clientY - board.top - current.y,
    };
    setDragging(item.id);
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const state = dragState.current;
    if (!state) return;

    const board = (event.currentTarget as HTMLElement).parentElement?.getBoundingClientRect();
    if (!board) return;

    setPositions((previous) => ({
      ...previous,
      [state.id]: {
        x: Math.max(0, Math.round(event.clientX - board.left - state.offsetX)),
        y: Math.max(0, Math.round(event.clientY - board.top - state.offsetY)),
      },
    }));
  };

  const onPointerUp = () => {
    dragState.current = null;
    setDragging(null);
  };

  const saveLayout = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const payload = items.map((item) => ({ id: item.id, ...at(item) }));
      const response = await fetch(`/api/moodboards/${boardId}/elements`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ items: payload, csrf }),
      });
      if (!response.ok) throw new Error('save failed');
      toast.success('Disposition enregistrée.');
      setPositions({});
      router.refresh();
    } catch {
      toast.error('Enregistrement impossible.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3">
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" />
            Ajouter un élément
          </Button>

          <Button size="sm" onClick={saveLayout} disabled={!dirty || saving}>
            <Save className="size-3.5" />
            {saving ? 'Enregistrement…' : 'Enregistrer la disposition'}
          </Button>

          {dirty && (
            <span className="text-[0.75rem] text-warning">
              {Object.keys(positions).length} élément{Object.keys(positions).length === 1 ? '' : 's'} déplacé
              {Object.keys(positions).length === 1 ? '' : 's'} — non enregistré
            </span>
          )}
        </div>
      )}

      <div
        className="relative overflow-hidden rounded-[var(--radius-card)] border border-line"
        style={{ height, background: background ?? 'var(--color-surface-sunken)' }}
      >
        {items.length === 0 && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-center">
            <Upload className="size-5 text-fg-subtle" />
            <p className="text-[0.875rem] font-medium text-fg">Toile vide</p>
            <p className="max-w-sm text-[0.8125rem] text-fg-muted">
              Ajoutez des images, des couleurs et des notes, puis disposez-les à la souris.
            </p>
          </div>
        )}

        {items.map((item) => {
          const position = at(item);
          const Icon = KIND_ICONS[item.kind];

          return (
            <div
              key={item.id}
              onPointerDown={(event) => onPointerDown(event, item)}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onDoubleClick={() => canEdit && setSelected(item)}
              style={{
                left: position.x,
                top: position.y,
                width: item.width,
                height: item.height,
                zIndex: dragging === item.id ? 999 : item.z_index,
              }}
              className={cn(
                'group absolute overflow-hidden rounded-lg border border-line bg-surface shadow-sm',
                canEdit && 'cursor-grab',
                dragging === item.id && 'cursor-grabbing shadow-lg ring-2 ring-accent',
              )}
            >
              {item.kind === 'image' && (
                <>
                  {/* Arbitrary address or an authenticated library file: a plain
                      <img> either way, never Next's optimiser. */}
                  { }
                  <img
                    src={item.file_id ? `/api/fichiers/${item.file_id}/telecharger?apercu=1` : (item.url ?? '')}
                    alt={item.notes ?? ''}
                    className="pointer-events-none size-full object-cover"
                    draggable={false}
                    loading="lazy"
                  />
                </>
              )}

              {item.kind === 'color' && (
                <div className="flex size-full flex-col items-center justify-center" style={{ background: item.color ?? '#888' }}>
                  <span className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[0.6875rem] text-white">
                    {item.color}
                  </span>
                </div>
              )}

              {(item.kind === 'text' || item.kind === 'note') && (
                <div
                  className={cn(
                    'size-full overflow-auto p-3',
                    item.kind === 'note' && 'bg-warning-soft',
                  )}
                >
                  <p className="whitespace-pre-line text-[0.8125rem] leading-relaxed text-fg">{item.content}</p>
                </div>
              )}

              {item.kind === 'link' && (
                <div className="flex size-full flex-col justify-center gap-1 p-3">
                  <Link2 className="size-4 text-accent" />
                  <p className="line-clamp-2 text-[0.8125rem] font-medium text-fg">{item.content ?? item.url}</p>
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer"
                      className="truncate text-[0.6875rem] text-accent underline-offset-2 hover:underline"
                    >
                      {item.url}
                    </a>
                  )}
                </div>
              )}

              {/* Overlay: source and actions, on hover only so the board stays calm. */}
              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-1 bg-gradient-to-b from-black/50 to-transparent p-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                <span className="inline-flex items-center gap-1 rounded bg-black/50 px-1.5 py-0.5 text-[0.625rem] text-white">
                  <Icon className="size-2.5" />
                  {KIND_LABELS[item.kind]}
                </span>

                <span className="pointer-events-auto flex items-center gap-1">
                  {item.source_url && (
                    <a
                      href={item.source_url}
                      target="_blank"
                      rel="noreferrer"
                      title="Voir la source"
                      className="rounded bg-black/50 p-1 text-white transition-colors hover:bg-black/70"
                    >
                      <ExternalLink className="size-2.5" />
                    </a>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(item)}
                      title="Retirer"
                      className="rounded bg-black/50 p-1 text-white transition-colors hover:bg-danger"
                    >
                      <Trash2 className="size-2.5" />
                    </button>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {canEdit && items.length > 0 && (
        <p className="text-[0.75rem] text-fg-subtle">
          Glissez un élément pour le déplacer, double-cliquez pour le modifier. La disposition n’est enregistrée que
          lorsque vous le demandez.
        </p>
      )}

      {adding && <AddItemModal csrf={csrf} boardId={boardId} onClose={() => setAdding(false)} />}
      {selected && (
        <EditItemModal csrf={csrf} boardId={boardId} item={selected} onClose={() => setSelected(null)} />
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          const target = confirmDelete;
          setConfirmDelete(null);
          if (!target) return;
          await run(`/api/moodboards/${boardId}/elements?element=${target.id}`, {
            method: 'DELETE',
            success: 'Élément retiré.',
          });
        }}
        title="Retirer cet élément ?"
        message="Il disparaît de la toile. Si c’était un fichier de la bibliothèque, le fichier lui-même est conservé."
        confirmLabel="Retirer"
        busy={busy}
      />
    </div>
  );
}

function AddItemModal({ csrf, boardId, onClose }: { csrf: string; boardId: number; onClose: () => void }) {
  const router = useRouter();
  const { run, busy } = useAction(csrf);
  const [kind, setKind] = React.useState<CanvasItem['kind']>('image');
  const [values, setValues] = React.useState({ url: '', content: '', color: '#2563eb', source_url: '', notes: '' });

  const set = (key: keyof typeof values, value: string) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  const valid =
    (kind === 'image' && values.url.trim() !== '') ||
    (kind === 'link' && values.url.trim() !== '') ||
    ((kind === 'text' || kind === 'note') && values.content.trim() !== '') ||
    (kind === 'color' && values.color.trim() !== '');

  return (
    <Modal
      open
      onClose={onClose}
      title="Ajouter un élément"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={busy || !valid}
            onClick={async () => {
              const result = await run(`/api/moodboards/${boardId}/elements`, {
                body: {
                  kind,
                  url: values.url.trim() || null,
                  content: values.content.trim() || null,
                  color: kind === 'color' ? values.color : null,
                  source_url: values.source_url.trim() || null,
                  notes: values.notes.trim() || null,
                  // Notes and colours are smaller than an image by default.
                  width: kind === 'color' ? 140 : kind === 'note' ? 220 : 260,
                  height: kind === 'color' ? 140 : kind === 'note' ? 180 : 180,
                },
                success: 'Élément ajouté.',
              });
              if (result) {
                router.refresh();
                onClose();
              }
            }}
          >
            Ajouter
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Type d’élément" htmlFor="mi-kind">
          <Select id="mi-kind" value={kind} onChange={(event) => setKind(event.target.value as CanvasItem['kind'])}>
            {Object.entries(KIND_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>

        {(kind === 'image' || kind === 'link') && (
          <Field label={kind === 'image' ? 'Adresse de l’image' : 'Adresse du lien'} htmlFor="mi-url" required>
            <Input
              id="mi-url"
              value={values.url}
              onChange={(event) => set('url', event.target.value)}
              maxLength={1000}
              placeholder="https://…"
              autoFocus
            />
          </Field>
        )}

        {(kind === 'text' || kind === 'note' || kind === 'link') && (
          <Field
            label={kind === 'link' ? 'Intitulé' : 'Texte'}
            htmlFor="mi-content"
            required={kind !== 'link'}
          >
            <Textarea
              id="mi-content"
              rows={kind === 'link' ? 2 : 4}
              value={values.content}
              onChange={(event) => set('content', event.target.value)}
              maxLength={2000}
            />
          </Field>
        )}

        {kind === 'color' && (
          <Field label="Couleur" htmlFor="mi-color" required>
            <div className="flex gap-2">
              <input
                id="mi-color"
                type="color"
                value={values.color.startsWith('#') ? values.color : '#2563eb'}
                onChange={(event) => set('color', event.target.value)}
                className="h-9 w-14 cursor-pointer rounded-lg border border-line bg-surface"
              />
              <Input
                value={values.color}
                onChange={(event) => set('color', event.target.value)}
                maxLength={40}
                aria-label="Valeur de la couleur"
                className="font-mono"
              />
            </div>
          </Field>
        )}

        <Field
          label="Source"
          htmlFor="mi-source"
          hint="D’où vient cette référence. Utile pour retrouver le contexte, et pour créditer."
        >
          <Input
            id="mi-source"
            value={values.source_url}
            onChange={(event) => set('source_url', event.target.value)}
            maxLength={1000}
            placeholder="https://…"
          />
        </Field>

        <Field label="Note interne" htmlFor="mi-notes" hint="Ce que vous retenez de cette référence.">
          <Input
            id="mi-notes"
            value={values.notes}
            onChange={(event) => set('notes', event.target.value)}
            maxLength={1000}
          />
        </Field>
      </div>
    </Modal>
  );
}

function EditItemModal({
  csrf,
  boardId,
  item,
  onClose,
}: {
  csrf: string;
  boardId: number;
  item: CanvasItem;
  onClose: () => void;
}) {
  const router = useRouter();
  const { run, busy } = useAction(csrf);
  const [values, setValues] = React.useState({
    content: item.content ?? '',
    color: item.color ?? '',
    url: item.url ?? '',
    notes: item.notes ?? '',
    width: String(item.width),
    height: String(item.height),
  });

  const set = (key: keyof typeof values, value: string) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  return (
    <Modal
      open
      onClose={onClose}
      title={`Modifier — ${KIND_LABELS[item.kind]}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              const result = await run(`/api/moodboards/${boardId}/elements`, {
                method: 'PATCH',
                body: {
                  item_id: item.id,
                  content: values.content.trim() || null,
                  color: values.color.trim() || null,
                  url: values.url.trim() || null,
                  notes: values.notes.trim() || null,
                  width: Number(values.width) || item.width,
                  height: Number(values.height) || item.height,
                },
                success: 'Élément enregistré.',
              });
              if (result) {
                router.refresh();
                onClose();
              }
            }}
          >
            Enregistrer
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {(item.kind === 'text' || item.kind === 'note' || item.kind === 'link') && (
          <Field label={item.kind === 'link' ? 'Intitulé' : 'Texte'} htmlFor="me-content">
            <Textarea
              id="me-content"
              rows={4}
              value={values.content}
              onChange={(event) => set('content', event.target.value)}
              maxLength={2000}
              autoFocus
            />
          </Field>
        )}

        {(item.kind === 'image' || item.kind === 'link') && (
          <Field label="Adresse" htmlFor="me-url">
            <Input id="me-url" value={values.url} onChange={(event) => set('url', event.target.value)} maxLength={1000} />
          </Field>
        )}

        {item.kind === 'color' && (
          <Field label="Couleur" htmlFor="me-color">
            <div className="flex gap-2">
              <input
                id="me-color"
                type="color"
                value={values.color.startsWith('#') ? values.color : '#2563eb'}
                onChange={(event) => set('color', event.target.value)}
                className="h-9 w-14 cursor-pointer rounded-lg border border-line bg-surface"
              />
              <Input
                value={values.color}
                onChange={(event) => set('color', event.target.value)}
                maxLength={40}
                aria-label="Valeur de la couleur"
                className="font-mono"
              />
            </div>
          </Field>
        )}

        <Field label="Note interne" htmlFor="me-notes">
          <Input id="me-notes" value={values.notes} onChange={(event) => set('notes', event.target.value)} maxLength={1000} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Largeur (px)" htmlFor="me-width">
            <Input
              id="me-width"
              type="number"
              min={20}
              max={4000}
              value={values.width}
              onChange={(event) => set('width', event.target.value)}
              className="tabular-nums"
            />
          </Field>
          <Field label="Hauteur (px)" htmlFor="me-height">
            <Input
              id="me-height"
              type="number"
              min={20}
              max={4000}
              value={values.height}
              onChange={(event) => set('height', event.target.value)}
              className="tabular-nums"
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
