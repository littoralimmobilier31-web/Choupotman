'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, HelpCircle, Pencil, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Field, Input, Textarea, Switch } from '@/components/ui/field';
import { useAction } from './use-resource-form';

/**
 * The questions shown under the public services page.
 *
 * Answering the same five questions here saves answering them by email fifteen
 * times a month, and the answers also feed the public chatbot's knowledge base —
 * which is how the chatbot can reply without inventing anything.
 */

export type FaqRecord = {
  id: number;
  question: string;
  answer: string;
  category: string | null;
  position: number;
  is_published: 0 | 1;
};

export function FaqManager({
  csrf,
  faqs,
  canEdit,
  canDelete,
}: {
  csrf: string;
  faqs: FaqRecord[];
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [editing, setEditing] = React.useState<FaqRecord | 'new' | null>(null);

  return (
    <div className="space-y-4">
      {canEdit && (
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => setEditing('new')}>
            <Plus className="size-3.5" />
            Ajouter une question
          </Button>
        </div>
      )}

      {faqs.length === 0 ? (
        <Card>
          <CardBody className="py-8 text-center">
            <HelpCircle className="mx-auto mb-2 size-5 text-fg-subtle" />
            <p className="text-[0.875rem] font-medium text-fg">Aucune question</p>
            <p className="mx-auto mt-1 max-w-md text-[0.8125rem] leading-relaxed text-fg-muted">
              Notez les questions que les clients posent le plus souvent : délais, tarifs, modes de paiement,
              maintenance. Elles apparaîtront sous la page Services et serviront de base aux réponses du chatbot.
            </p>
          </CardBody>
        </Card>
      ) : (
        <ul className="space-y-2">
          {faqs.map((faq) => (
            <FaqRow
              key={faq.id}
              csrf={csrf}
              faq={faq}
              canEdit={canEdit}
              canDelete={canDelete}
              onEdit={() => setEditing(faq)}
            />
          ))}
        </ul>
      )}

      {editing !== null && (
        <FaqModal csrf={csrf} faq={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}

function FaqRow({
  csrf,
  faq,
  canEdit,
  canDelete,
  onEdit,
}: {
  csrf: string;
  faq: FaqRecord;
  canEdit: boolean;
  canDelete: boolean;
  onEdit: () => void;
}) {
  const { run, busy } = useAction(csrf);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [open, setOpen] = React.useState(false);

  return (
    <li
      className={cn(
        'rounded-[var(--radius-card)] border border-line bg-surface-raised',
        faq.is_published === 0 && 'opacity-60',
      )}
    >
      <div className="flex items-start gap-2 p-3">
        <button
          type="button"
          onClick={() => setOpen((previous) => !previous)}
          className="min-w-0 flex-1 text-start"
          aria-expanded={open}
        >
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-[0.8125rem] font-medium text-fg">{faq.question}</span>
            {faq.category && <Badge tone="outline">{faq.category}</Badge>}
            {faq.is_published === 0 && <Badge tone="outline">Masquée</Badge>}
          </span>
          {!open && <span className="mt-0.5 line-clamp-1 block text-[0.75rem] text-fg-muted">{faq.answer}</span>}
        </button>

        <div className="flex shrink-0 items-center gap-1">
          {canEdit && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  run(`/api/faq/${faq.id}`, {
                    method: 'PATCH',
                    body: { is_published: faq.is_published === 0 },
                    success: faq.is_published === 1 ? 'Masquée.' : 'Publiée.',
                  })
                }
                aria-label={faq.is_published === 1 ? 'Masquer' : 'Publier'}
                className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
              >
                {faq.is_published === 1 ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
              </button>
              <button
                type="button"
                onClick={onEdit}
                aria-label={`Modifier : ${faq.question}`}
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
              aria-label={`Supprimer : ${faq.question}`}
              className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 className="size-3.5" />
            </button>
          )}
        </div>
      </div>

      {open && (
        <p className="whitespace-pre-line border-t border-line px-3 py-2.5 text-[0.8125rem] leading-relaxed text-fg-muted">
          {faq.answer}
        </p>
      )}

      <ConfirmDialog
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={async () => {
          setConfirmDelete(false);
          await run(`/api/faq/${faq.id}`, { method: 'DELETE', success: 'Question supprimée.' });
        }}
        title="Supprimer cette question ?"
        message="Elle disparaît de la page Services et de la base de connaissances du chatbot."
        confirmLabel="Supprimer"
        busy={busy}
      />
    </li>
  );
}

function FaqModal({ csrf, faq, onClose }: { csrf: string; faq: FaqRecord | null; onClose: () => void }) {
  const router = useRouter();
  const { run, busy } = useAction(csrf);

  const [values, setValues] = React.useState({
    question: faq?.question ?? '',
    answer: faq?.answer ?? '',
    category: faq?.category ?? '',
    position: faq ? String(faq.position) : '0',
    is_published: faq ? faq.is_published === 1 : true,
  });

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  const valid = values.question.trim().length >= 5 && values.answer.trim().length >= 5;

  return (
    <Modal
      open
      onClose={onClose}
      title={faq ? 'Modifier la question' : 'Nouvelle question'}
      description="Répondez comme vous le feriez par message : une réponse claire vaut mieux qu’une réponse complète."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={busy || !valid}
            onClick={async () => {
              const payload = {
                question: values.question.trim(),
                answer: values.answer.trim(),
                category: values.category.trim() || null,
                position: Number(values.position) || 0,
                is_published: values.is_published,
              };

              const result = faq
                ? await run(`/api/faq/${faq.id}`, { method: 'PATCH', body: payload, success: 'Question enregistrée.' })
                : await run('/api/faq', { method: 'POST', body: payload, success: 'Question ajoutée.' });

              if (result) {
                router.refresh();
                onClose();
              }
            }}
          >
            {faq ? 'Enregistrer' : 'Ajouter'}
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Question" htmlFor="fq-question" required>
          <Input
            id="fq-question"
            value={values.question}
            onChange={(event) => set('question', event.target.value)}
            maxLength={400}
            autoFocus
          />
        </Field>

        <Field label="Réponse" htmlFor="fq-answer" required>
          <Textarea
            id="fq-answer"
            rows={6}
            value={values.answer}
            onChange={(event) => set('answer', event.target.value)}
            maxLength={4000}
          />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Catégorie" htmlFor="fq-category" hint="Par exemple : tarifs, délais, maintenance.">
            <Input
              id="fq-category"
              value={values.category}
              onChange={(event) => set('category', event.target.value)}
              maxLength={80}
            />
          </Field>

          <Field label="Ordre d’affichage" htmlFor="fq-position" hint="0 = en premier.">
            <Input
              id="fq-position"
              type="number"
              min={0}
              max={999}
              value={values.position}
              onChange={(event) => set('position', event.target.value)}
              className="tabular-nums"
            />
          </Field>
        </div>

        <div className="flex items-center rounded-lg bg-surface-sunken px-3 py-2.5">
          <Switch
            checked={values.is_published}
            onChange={(next) => set('is_published', next)}
            label={values.is_published ? 'Visible sur le site' : 'Masquée'}
          />
        </div>
      </div>
    </Modal>
  );
}
