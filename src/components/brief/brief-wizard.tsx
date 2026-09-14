'use client';

import * as React from 'react';
import { Check, ChevronLeft, ChevronRight, Loader2, Send } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea, Checkbox } from '@/components/ui/field';
import { Progress } from '@/components/ui/misc';
import type { BriefInputType } from '@/lib/db/types';

/**
 * Client-facing brief.
 *
 * Answers are saved section by section, not only at the end: a client who closes
 * the tab halfway keeps their progress, and the admin sees the brief advancing in
 * real time. `file` questions are collected as text here — the upload flow needs
 * an authenticated session, so the brief asks for links instead of silently
 * dropping an attachment.
 */

export type BriefQuestion = {
  key: string;
  label: string;
  helpText: string | null;
  inputType: BriefInputType;
  options: string[];
  required: boolean;
  /** Null when a question was added without one; grouped under "Questions". */
  section: string | null;
};

export function BriefWizard({
  token,
  title,
  introText,
  questions,
  initialAnswers,
  initialStatus,
}: {
  token: string;
  title: string;
  introText: string | null;
  questions: BriefQuestion[];
  initialAnswers: Record<string, string>;
  initialStatus: string;
}) {
  const sections = React.useMemo(() => groupBySection(questions), [questions]);
  const [step, setStep] = React.useState(0);
  const [answers, setAnswers] = React.useState<Record<string, string>>(initialAnswers);
  const [saving, setSaving] = React.useState(false);
  const [savedAt, setSavedAt] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [missing, setMissing] = React.useState<string[]>([]);
  const [done, setDone] = React.useState(initialStatus === 'completed');

  const set = (key: string, value: string) => {
    setAnswers((prev) => ({ ...prev, [key]: value }));
    setError(null);
  };

  const current = sections[step];
  const isLast = step === sections.length - 1;

  const answeredCount = questions.filter((q) => (answers[q.key] ?? '').trim() !== '').length;

  /** Saves the current section; `complete` also asks the server to validate. */
  const save = async (complete: boolean): Promise<boolean> => {
    setSaving(true);
    setError(null);
    setMissing([]);

    try {
      const payload = current.questions.map((question) => ({
        key: question.key,
        value: answers[question.key] ?? null,
      }));

      const response = await fetch(`/api/brief/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Sending every answer on the final step guards against a section that
        // was edited and never re-saved.
        body: JSON.stringify({
          answers: complete
            ? questions.map((question) => ({ key: question.key, value: answers[question.key] ?? null }))
            : payload,
          complete,
        }),
      });

      const result = (await response.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        missing?: string[];
        completed?: boolean;
      };

      if (!response.ok) {
        setError(result.error ?? 'Enregistrement impossible.');
        if (result.missing) setMissing(result.missing);
        return false;
      }

      setSavedAt(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }));
      if (result.completed) setDone(true);
      return true;
    } catch {
      setError('Connexion interrompue. Vos réponses ne sont pas perdues : réessayez.');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const missingRequired = current?.questions.filter(
    (question) => question.required && (answers[question.key] ?? '').trim() === '',
  ) ?? [];

  if (done) {
    return (
      <div className="mx-auto max-w-xl rounded-[var(--radius-card)] border border-line bg-surface-raised p-8 text-center">
        <span className="mx-auto mb-5 flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
          <Check className="size-6" />
        </span>
        <h2 className="text-[1.25rem] font-semibold text-fg">Merci, votre brief est envoyé</h2>
        <p className="mt-2.5 text-[0.875rem] leading-relaxed text-fg-muted">
          Vos réponses ont bien été enregistrées. Vous serez recontacté rapidement pour en discuter.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-6">
        <h1 className="text-[1.5rem] font-semibold tracking-tight text-fg">{title}</h1>
        {introText && (
          <p className="mt-2.5 text-[0.875rem] leading-relaxed text-fg-muted">{introText}</p>
        )}
      </header>

      <div className="mb-5">
        <Progress
          value={answeredCount}
          total={questions.length}
          showLabel
          label={`${answeredCount} / ${questions.length} réponses`}
          tone={answeredCount === questions.length ? 'success' : 'accent'}
        />
      </div>

      {/* Section stepper */}
      <ol className="mb-6 flex flex-wrap gap-1.5" aria-label="Étapes">
        {sections.map((section, index) => (
          <li key={section.name}>
            <button
              type="button"
              onClick={() => setStep(index)}
              aria-current={index === step ? 'step' : undefined}
              className={cn(
                'rounded-full px-3 py-1 text-[0.75rem] font-medium transition-colors',
                index === step
                  ? 'bg-accent text-accent-fg'
                  : 'bg-surface-sunken text-fg-muted hover:text-fg',
              )}
            >
              {index + 1}. {section.name}
            </button>
          </li>
        ))}
      </ol>

      <div className="space-y-5 rounded-[var(--radius-card)] border border-line bg-surface-raised p-5 sm:p-6">
        <h2 className="text-[1.0625rem] font-semibold text-fg">{current.name}</h2>

        {current.questions.map((question) => (
          <QuestionField
            key={question.key}
            question={question}
            value={answers[question.key] ?? ''}
            onChange={(value) => set(question.key, value)}
          />
        ))}

        {error && (
          <p className="rounded-lg bg-danger-soft px-3 py-2.5 text-[0.8125rem] font-medium text-danger" role="alert">
            {error}
            {missing.length > 0 && (
              <span className="mt-1.5 block font-normal">Manquant : {missing.join(', ')}</span>
            )}
          </p>
        )}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button
          variant="secondary"
          disabled={step === 0 || saving}
          onClick={() => setStep((value) => Math.max(0, value - 1))}
        >
          <ChevronLeft className="size-4 rtl:-scale-x-100" />
          Précédent
        </Button>

        {isLast ? (
          <Button disabled={saving || missingRequired.length > 0} onClick={() => save(true)}>
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4 rtl:-scale-x-100" />}
            Envoyer le brief
          </Button>
        ) : (
          <Button
            disabled={saving || missingRequired.length > 0}
            onClick={async () => {
              if (await save(false)) setStep((value) => value + 1);
            }}
          >
            {saving ? <Loader2 className="size-4 animate-spin" /> : null}
            Continuer
            <ChevronRight className="size-4 rtl:-scale-x-100" />
          </Button>
        )}

        <div className="ms-auto text-[0.75rem] text-fg-subtle">
          {missingRequired.length > 0 ? (
            <span className="text-warning">
              {missingRequired.length} réponse(s) obligatoire(s) dans cette section
            </span>
          ) : savedAt ? (
            <span>Enregistré à {savedAt}</span>
          ) : (
            <span>Vos réponses sont enregistrées à chaque étape</span>
          )}
        </div>
      </div>
    </div>
  );
}

/** Native input type per question type; anything else falls back to text. */
const INPUT_TYPES: Partial<Record<BriefInputType, string>> = {
  date: 'date', number: 'number', color: 'color', url: 'url', text: 'text',
};

function QuestionField({
  question,
  value,
  onChange,
}: {
  question: BriefQuestion;
  value: string;
  onChange: (value: string) => void;
}) {
  const id = `q-${question.key}`;

  // Multiselect is stored as a comma-separated string so one text column serves
  // every question type.
  const selected = React.useMemo(
    () => value.split(',').map((part) => part.trim()).filter(Boolean),
    [value],
  );

  const toggle = (option: string) => {
    const next = selected.includes(option)
      ? selected.filter((item) => item !== option)
      : [...selected, option];
    onChange(next.join(', '));
  };

  return (
    <Field
      label={question.label}
      required={question.required}
      htmlFor={id}
      hint={
        question.inputType === 'file'
          ? (question.helpText ?? 'Partagez un lien (Drive, WeTransfer…). Nous récupérerons les fichiers avec vous.')
          : (question.helpText ?? undefined)
      }
    >
      {question.inputType === 'textarea' || question.inputType === 'file' ? (
        <Textarea id={id} rows={4} value={value} onChange={(event) => onChange(event.target.value)} maxLength={8000} />
      ) : question.inputType === 'select' ? (
        <Select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">Choisissez…</option>
          {question.options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </Select>
      ) : question.inputType === 'multiselect' ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {question.options.map((option) => (
            <label key={option} className="flex items-center gap-2.5 text-[0.8125rem] text-fg">
              <Checkbox checked={selected.includes(option)} onChange={() => toggle(option)} />
              {option}
            </label>
          ))}
        </div>
      ) : question.inputType === 'rating' ? (
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label={question.label}>
          {[1, 2, 3, 4, 5].map((score) => (
            <button
              key={score}
              type="button"
              role="radio"
              aria-checked={value === String(score)}
              onClick={() => onChange(String(score))}
              className={cn(
                'size-9 rounded-lg border text-[0.8125rem] font-semibold tabular-nums transition-colors',
                value === String(score)
                  ? 'border-accent bg-accent text-accent-fg'
                  : 'border-line bg-surface text-fg-muted hover:border-line-strong',
              )}
            >
              {score}
            </button>
          ))}
        </div>
      ) : (
        <Input
          id={id}
          type={INPUT_TYPES[question.inputType] ?? 'text'}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          maxLength={500}
        />
      )}
    </Field>
  );
}

function groupBySection(questions: BriefQuestion[]): { name: string; questions: BriefQuestion[] }[] {
  const order: string[] = [];
  const map = new Map<string, BriefQuestion[]>();
  for (const question of questions) {
    const name = question.section || 'Questions';
    if (!map.has(name)) {
      map.set(name, []);
      order.push(name);
    }
    map.get(name)!.push(question);
  }
  return order.map((name) => ({ name, questions: map.get(name)! }));
}
