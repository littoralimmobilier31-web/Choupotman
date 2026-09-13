'use client';

import * as React from 'react';
import { CheckCircle2, Paperclip, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/field';
import { cn } from '@/lib/utils';
import type { Locale } from '@/lib/i18n/config';
import type { Dictionary } from '@/lib/i18n/types';

/**
 * Public contact form.
 *
 * Posts multipart to `/api/contact`, which validates everything again server-side
 * (the client checks here are for feedback only), creates the submission, opens a
 * CRM lead through the automation engine and notifies the admin.
 */

export const BUDGET_OPTIONS = [
  '< 50 000 DZD',
  '50 000 – 150 000 DZD',
  '150 000 – 400 000 DZD',
  '400 000 – 1 000 000 DZD',
  '> 1 000 000 DZD',
  'À définir',
];

export const DEADLINE_OPTIONS = [
  'Urgent (< 2 semaines)',
  '1 mois',
  '2 à 3 mois',
  '> 3 mois',
  'Flexible',
];

export function ContactForm({
  locale,
  dict,
  services,
  compact = false,
  defaultService,
}: {
  locale: Locale;
  dict: Dictionary;
  services: { slug: string; name: string }[];
  compact?: boolean;
  defaultService?: string;
}) {
  const [state, setState] = React.useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [fileName, setFileName] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === 'sending') return;

    const form = event.currentTarget;
    const data = new FormData(form);
    data.set('locale', locale);

    // Light client-side check so the user gets instant feedback; the server
    // performs the authoritative validation.
    const errors: Record<string, string> = {};
    const name = String(data.get('name') ?? '').trim();
    const email = String(data.get('email') ?? '').trim();
    const message = String(data.get('message') ?? '').trim();
    if (name.length < 2) errors.name = 'Merci d’indiquer votre nom.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) errors.email = 'Adresse email invalide.';
    if (message.length < 10) errors.message = 'Décrivez votre besoin en quelques mots.';
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setState('sending');
    setError(null);

    try {
      const response = await fetch('/api/contact', { method: 'POST', body: data });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        fields?: Record<string, string>;
      };

      if (!response.ok) {
        if (payload.fields) setFieldErrors(payload.fields);
        throw new Error(payload.error ?? dict.contact.errorTitle);
      }

      setState('sent');
      form.reset();
      setFileName(null);
    } catch (err) {
      setState('idle');
      setError(err instanceof Error ? err.message : dict.contact.errorTitle);
    }
  }

  if (state === 'sent') {
    return (
      <div className="flex flex-col items-center rounded-[var(--radius-card)] border border-success/30 bg-success-soft/50 px-6 py-12 text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="size-6" />
        </span>
        <h3 className="mt-4 text-[1.0625rem] font-semibold text-fg">{dict.contact.successTitle}</h3>
        <p className="mt-2 max-w-sm text-[0.875rem] leading-relaxed text-fg-muted">{dict.contact.successBody}</p>
        <Button variant="secondary" size="sm" className="mt-6" onClick={() => setState('idle')}>
          {dict.common.retry}
        </Button>
      </div>
    );
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-4">
      {!compact && (
        <div className="mb-2">
          <h2 className="text-[1.0625rem] font-semibold text-fg">{dict.contact.title}</h2>
          <p className="mt-1 text-[0.8125rem] text-fg-muted">{dict.contact.subtitle}</p>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={dict.contact.name} required htmlFor="cf-name" error={fieldErrors.name}>
          <Input
            id="cf-name"
            name="name"
            autoComplete="name"
            required
            maxLength={120}
            aria-invalid={Boolean(fieldErrors.name)}
          />
        </Field>
        <Field label={dict.contact.email} required htmlFor="cf-email" error={fieldErrors.email}>
          <Input
            id="cf-email"
            name="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            required
            maxLength={180}
            aria-invalid={Boolean(fieldErrors.email)}
          />
        </Field>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={dict.contact.phone} hint={dict.contact.optional} htmlFor="cf-phone">
          <Input id="cf-phone" name="phone" type="tel" inputMode="tel" autoComplete="tel" maxLength={40} />
        </Field>
        <Field label={dict.contact.company} hint={dict.contact.optional} htmlFor="cf-company">
          <Input id="cf-company" name="company" autoComplete="organization" maxLength={140} />
        </Field>
      </div>

      <div className={cn('grid gap-4', compact ? 'sm:grid-cols-2' : 'sm:grid-cols-3')}>
        <Field label={dict.contact.service} htmlFor="cf-service">
          <Select id="cf-service" name="service" defaultValue={defaultService ?? ''}>
            <option value="">{dict.contact.selectPlaceholder}</option>
            {services.map((service) => (
              <option key={service.slug} value={service.name}>
                {service.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={dict.contact.budget} htmlFor="cf-budget">
          <Select id="cf-budget" name="budget" defaultValue="">
            <option value="">{dict.contact.selectPlaceholder}</option>
            {BUDGET_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </Field>
        {!compact && (
          <Field label={dict.contact.deadline} htmlFor="cf-deadline">
            <Select id="cf-deadline" name="deadline" defaultValue="">
              <option value="">{dict.contact.selectPlaceholder}</option>
              {DEADLINE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </Select>
          </Field>
        )}
      </div>

      <Field label={dict.contact.message} required htmlFor="cf-message" error={fieldErrors.message}>
        <Textarea
          id="cf-message"
          name="message"
          rows={compact ? 4 : 6}
          required
          maxLength={4000}
          aria-invalid={Boolean(fieldErrors.message)}
        />
      </Field>

      {!compact && (
        <Field label={dict.contact.file} hint={dict.contact.optional} htmlFor="cf-file">
          <label
            htmlFor="cf-file"
            className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-line px-3 py-3 text-[0.8125rem] text-fg-muted transition-colors hover:border-accent hover:text-fg"
          >
            <Paperclip className="size-4 shrink-0" />
            <span className="min-w-0 flex-1 truncate">{fileName ?? dict.contact.fileHint}</span>
          </label>
          <input
            id="cf-file"
            name="file"
            type="file"
            className="sr-only"
            accept=".pdf,.doc,.docx,.odt,.txt,.png,.jpg,.jpeg,.webp,.zip"
            onChange={(e) => setFileName(e.target.files?.[0]?.name ?? null)}
          />
        </Field>
      )}

      {/* Honeypot: a real user never fills this. Bots usually do. */}
      <div aria-hidden className="absolute h-0 w-0 overflow-hidden opacity-0">
        <label htmlFor="cf-website">Website</label>
        <input id="cf-website" name="website" type="text" tabIndex={-1} autoComplete="off" />
      </div>

      {error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2.5 text-[0.8125rem] font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 pt-1">
        <Button type="submit" size="lg" disabled={state === 'sending'}>
          {state === 'sending' ? dict.contact.sending : dict.contact.send}
          {state !== 'sending' && <Send className="size-4 rtl:-scale-x-100" />}
        </Button>
        <p className="text-[0.75rem] text-fg-subtle">{dict.contact.orChat}</p>
      </div>
    </form>
  );
}
