'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  ArrowLeft, ArrowRight, Check, CheckCircle2, Paperclip, Send,
} from 'lucide-react';
import { Button, buttonClass } from '@/components/ui/button';
import { Field, Input, Select, Textarea, Checkbox } from '@/components/ui/field';
import { cn } from '@/lib/utils';
import { path, type Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/types';
import { BUDGET_OPTIONS, DEADLINE_OPTIONS } from './contact-form';

/**
 * Nine-step project request.
 *
 * Answers accumulate in one object and are posted once at the end to
 * `/api/demande-de-projet`, which validates them, records the submission, opens a
 * CRM lead and notifies the admin. Navigation is blocked until the current step's
 * required fields are filled, so the final payload is always usable.
 */

type Answers = {
  name: string;
  company: string;
  email: string;
  phone: string;
  sector: string;
  projectName: string;
  projectDescription: string;
  objective: string;
  audience: string;
  services: string[];
  budget: string;
  deadline: string;
  launchDate: string;
  references: string;
  style: string;
  competitors: string;
  message: string;
};

const EMPTY: Answers = {
  name: '', company: '', email: '', phone: '', sector: '',
  projectName: '', projectDescription: '', objective: '', audience: '',
  services: [], budget: '', deadline: '', launchDate: '',
  references: '', style: '', competitors: '', message: '',
};

export function RequestWizard({
  locale,
  dict,
  services,
  defaultService,
}: {
  locale: Locale;
  dict: Dictionary;
  services: { slug: string; name: string }[];
  defaultService?: string;
}) {
  const [step, setStep] = React.useState(0);
  const [answers, setAnswers] = React.useState<Answers>(() => ({
    ...EMPTY,
    services: defaultService ? [defaultService] : [],
  }));
  const [file, setFile] = React.useState<File | null>(null);
  const [state, setState] = React.useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = React.useState<string | null>(null);

  const set = <K extends keyof Answers>(key: K, value: Answers[K]) =>
    setAnswers((prev) => ({ ...prev, [key]: value }));

  const steps = [
    dict.request.steps.who,
    dict.request.steps.project,
    dict.request.steps.goal,
    dict.request.steps.services,
    dict.request.steps.budget,
    dict.request.steps.deadline,
    dict.request.steps.references,
    dict.request.steps.files,
    dict.request.steps.contactDetails,
  ];

  /** Required fields per step — `next` stays disabled until they are filled. */
  const stepValid = React.useMemo(() => {
    switch (step) {
      case 0:
        return answers.name.trim().length >= 2;
      case 1:
        return answers.projectName.trim().length >= 2 && answers.projectDescription.trim().length >= 10;
      case 2:
        return answers.objective.trim().length >= 5;
      case 3:
        return answers.services.length > 0;
      case 4:
        return answers.budget !== '';
      case 5:
        return answers.deadline !== '';
      case 8:
        return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(answers.email.trim());
      default:
        return true;
    }
  }, [answers, step]);

  const isLast = step === steps.length - 1;

  async function submit() {
    if (state === 'sending' || !stepValid) return;
    setState('sending');
    setError(null);

    try {
      const data = new FormData();
      data.set('locale', locale);
      data.set('name', answers.name);
      data.set('email', answers.email);
      data.set('phone', answers.phone);
      data.set('company', answers.company);
      data.set('service', answers.services.join(', '));
      data.set('budget', answers.budget);
      data.set('deadline', answers.deadline);
      data.set(
        'message',
        [
          `Projet : ${answers.projectName}`,
          `Description : ${answers.projectDescription}`,
          `Objectif : ${answers.objective}`,
          answers.audience && `Audience : ${answers.audience}`,
          answers.sector && `Secteur : ${answers.sector}`,
          answers.launchDate && `Lancement visé : ${answers.launchDate}`,
          answers.style && `Style : ${answers.style}`,
          answers.references && `Références : ${answers.references}`,
          answers.competitors && `Concurrents : ${answers.competitors}`,
          answers.message && `Complément : ${answers.message}`,
        ]
          .filter(Boolean)
          .join('\n'),
      );
      data.set('payload', JSON.stringify(answers));
      if (file) data.set('file', file);

      const response = await fetch('/api/demande-de-projet', { method: 'POST', body: data });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? dict.contact.errorTitle);
      }
      setState('sent');
    } catch (err) {
      setState('idle');
      setError(err instanceof Error ? err.message : dict.contact.errorTitle);
    }
  }

  if (state === 'sent') {
    return (
      <div className="flex flex-col items-center rounded-[var(--radius-card)] border border-success/30 bg-success-soft/40 px-6 py-16 text-center">
        <span className="flex size-14 items-center justify-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="size-7" />
        </span>
        <h2 className="mt-5 text-xl font-semibold text-fg">{dict.request.thanksTitle}</h2>
        <p className="mt-3 max-w-md text-[0.9375rem] leading-relaxed text-fg-muted">{dict.request.thanksBody}</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Link href={path(locale)} className={buttonClass('primary', 'md')}>
            {dict.request.backHome}
          </Link>
          <Link href={path(locale, 'projects')} className={buttonClass('secondary', 'md')}>
            {dict.home.ctaProjects}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface-raised shadow-raised">
      {/* Progress */}
      <div className="border-b border-line px-5 py-4 sm:px-7">
        <div className="flex items-center justify-between gap-4">
          <p className="text-[0.75rem] font-medium text-fg-subtle">
            {dict.request.step} {step + 1} {dict.request.of} {steps.length}
          </p>
          <p className="text-[0.75rem] font-semibold tabular-nums text-accent">
            {Math.round(((step + 1) / steps.length) * 100)}%
          </p>
        </div>
        <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-surface-sunken">
          <div
            className="h-full rounded-full bg-accent transition-[width] duration-300"
            style={{ width: `${((step + 1) / steps.length) * 100}%` }}
          />
        </div>
        <ol className="mt-4 hide-scrollbar flex gap-1.5 overflow-x-auto lg:flex-wrap">
          {steps.map((label, index) => (
            <li key={label}>
              <button
                type="button"
                // Jumping forward is only allowed to a step already reached.
                onClick={() => index <= step && setStep(index)}
                disabled={index > step}
                className={cn(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.6875rem] font-medium transition-colors',
                  index === step
                    ? 'bg-accent text-accent-fg'
                    : index < step
                      ? 'bg-success-soft text-success'
                      : 'text-fg-subtle',
                  index > step && 'cursor-not-allowed',
                )}
              >
                {index < step ? <Check className="size-3" /> : <span>{index + 1}</span>}
                <span className="hidden sm:inline">{label}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      {/* Step body */}
      <div className="px-5 py-6 sm:px-7 sm:py-8">
        <h2 className="text-[1.25rem] font-semibold text-fg">{steps[step]}</h2>

        <div className="mt-6 space-y-4">
          {step === 0 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={dict.contact.name} required htmlFor="w-name">
                  <Input id="w-name" value={answers.name} onChange={(e) => set('name', e.target.value)} autoComplete="name" maxLength={120} />
                </Field>
                <Field label={dict.contact.company} hint={dict.contact.optional} htmlFor="w-company">
                  <Input id="w-company" value={answers.company} onChange={(e) => set('company', e.target.value)} autoComplete="organization" maxLength={140} />
                </Field>
              </div>
              <Field label="Secteur d’activité" hint={dict.contact.optional} htmlFor="w-sector">
                <Input id="w-sector" value={answers.sector} onChange={(e) => set('sector', e.target.value)} maxLength={120} />
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <Field label="Nom du projet" required htmlFor="w-project">
                <Input id="w-project" value={answers.projectName} onChange={(e) => set('projectName', e.target.value)} maxLength={160} />
              </Field>
              <Field
                label="Décrivez votre projet"
                required
                htmlFor="w-desc"
                hint="Plus c’est précis, plus l’estimation sera juste."
              >
                <Textarea id="w-desc" rows={5} value={answers.projectDescription} onChange={(e) => set('projectDescription', e.target.value)} maxLength={3000} />
              </Field>
            </>
          )}

          {step === 2 && (
            <>
              <Field
                label="Quel résultat concret attendez-vous ?"
                required
                htmlFor="w-objective"
                hint="Par exemple : recevoir plus de demandes, automatiser une tâche, moderniser votre image."
              >
                <Textarea id="w-objective" rows={4} value={answers.objective} onChange={(e) => set('objective', e.target.value)} maxLength={2000} />
              </Field>
              <Field label="Qui est votre audience cible ?" hint={dict.contact.optional} htmlFor="w-audience">
                <Textarea id="w-audience" rows={3} value={answers.audience} onChange={(e) => set('audience', e.target.value)} maxLength={1000} />
              </Field>
            </>
          )}

          {step === 3 && (
            <fieldset>
              <legend className="mb-3 text-[0.8125rem] text-fg-muted">
                Sélectionnez un ou plusieurs services.
              </legend>
              <div className="grid gap-2 sm:grid-cols-2">
                {services.map((service) => {
                  const checked = answers.services.includes(service.name);
                  return (
                    <label
                      key={service.slug}
                      className={cn(
                        'flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-[0.8125rem] transition-colors',
                        checked ? 'border-accent bg-accent-soft text-fg' : 'border-line hover:border-line-strong',
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onChange={(e) =>
                          set(
                            'services',
                            e.target.checked
                              ? [...answers.services, service.name]
                              : answers.services.filter((s) => s !== service.name),
                          )
                        }
                        className="mt-0.5"
                      />
                      <span>{service.name}</span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          )}

          {step === 4 && (
            <>
              <Field label={dict.contact.budget} required htmlFor="w-budget">
                <Select id="w-budget" value={answers.budget} onChange={(e) => set('budget', e.target.value)}>
                  <option value="">{dict.contact.selectPlaceholder}</option>
                  {BUDGET_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </Field>
              <p className="text-[0.75rem] leading-relaxed text-fg-subtle">
                Indiquer une fourchette permet de proposer un périmètre réaliste dès la première réponse. Cela n’engage à rien.
              </p>
            </>
          )}

          {step === 5 && (
            <>
              <Field label={dict.contact.deadline} required htmlFor="w-deadline">
                <Select id="w-deadline" value={answers.deadline} onChange={(e) => set('deadline', e.target.value)}>
                  <option value="">{dict.contact.selectPlaceholder}</option>
                  {DEADLINE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Date de lancement visée" hint={dict.contact.optional} htmlFor="w-launch">
                <Input id="w-launch" type="date" value={answers.launchDate} onChange={(e) => set('launchDate', e.target.value)} />
              </Field>
            </>
          )}

          {step === 6 && (
            <>
              <Field label="Sites ou marques que vous aimez" hint={dict.contact.optional} htmlFor="w-refs">
                <Textarea id="w-refs" rows={3} value={answers.references} onChange={(e) => set('references', e.target.value)} maxLength={1500} />
              </Field>
              <Field label="Style recherché" hint={dict.contact.optional} htmlFor="w-style">
                <Input id="w-style" value={answers.style} onChange={(e) => set('style', e.target.value)} placeholder="Moderne, épuré, corporate, coloré…" maxLength={300} />
              </Field>
              <Field label="Vos principaux concurrents" hint={dict.contact.optional} htmlFor="w-comp">
                <Textarea id="w-comp" rows={2} value={answers.competitors} onChange={(e) => set('competitors', e.target.value)} maxLength={1000} />
              </Field>
            </>
          )}

          {step === 7 && (
            <>
              <Field label={dict.contact.file} hint={dict.contact.optional} htmlFor="w-file">
                <label
                  htmlFor="w-file"
                  className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-line px-4 py-5 text-[0.8125rem] text-fg-muted transition-colors hover:border-accent hover:text-fg"
                >
                  <Paperclip className="size-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate">{file?.name ?? dict.contact.fileHint}</span>
                </label>
                <input
                  id="w-file"
                  type="file"
                  className="sr-only"
                  accept=".pdf,.doc,.docx,.odt,.txt,.png,.jpg,.jpeg,.webp,.zip"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </Field>
              <Field label="Autre chose à ajouter ?" hint={dict.contact.optional} htmlFor="w-extra">
                <Textarea id="w-extra" rows={3} value={answers.message} onChange={(e) => set('message', e.target.value)} maxLength={2000} />
              </Field>
            </>
          )}

          {step === 8 && (
            <>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={dict.contact.email} required htmlFor="w-email">
                  <Input id="w-email" type="email" inputMode="email" value={answers.email} onChange={(e) => set('email', e.target.value)} autoComplete="email" maxLength={180} />
                </Field>
                <Field label={dict.contact.phone} hint={dict.contact.optional} htmlFor="w-phone">
                  <Input id="w-phone" type="tel" inputMode="tel" value={answers.phone} onChange={(e) => set('phone', e.target.value)} autoComplete="tel" maxLength={40} />
                </Field>
              </div>

              <div className="rounded-lg border border-line bg-surface-sunken/50 p-4">
                <p className="text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-subtle">Récapitulatif</p>
                <dl className="mt-3 space-y-1.5 text-[0.8125rem]">
                  {[
                    ['Nom', answers.name],
                    ['Projet', answers.projectName],
                    ['Services', answers.services.join(', ')],
                    ['Budget', answers.budget],
                    ['Délai', answers.deadline],
                  ]
                    .filter(([, value]) => value)
                    .map(([label, value]) => (
                      <div key={label} className="flex flex-wrap gap-2">
                        <dt className="text-fg-subtle">{label} :</dt>
                        <dd className="font-medium text-fg">{value}</dd>
                      </div>
                    ))}
                </dl>
              </div>
            </>
          )}
        </div>

        {error && (
          <p className="mt-5 rounded-lg bg-danger-soft px-3 py-2.5 text-[0.8125rem] font-medium text-danger" role="alert">
            {error}
          </p>
        )}
      </div>

      {/* Navigation */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4 sm:px-7">
        <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          <ArrowLeft className="size-4 rtl:-scale-x-100" />
          {dict.request.back}
        </Button>

        {isLast ? (
          <Button onClick={submit} disabled={!stepValid || state === 'sending'} size="lg">
            {state === 'sending' ? dict.request.submitting : dict.request.submit}
            {state !== 'sending' && <Send className="size-4 rtl:-scale-x-100" />}
          </Button>
        ) : (
          <Button onClick={() => setStep((s) => Math.min(steps.length - 1, s + 1))} disabled={!stepValid}>
            {dict.request.next}
            <ArrowRight className="size-4 rtl:-scale-x-100" />
          </Button>
        )}
      </div>
    </div>
  );
}
