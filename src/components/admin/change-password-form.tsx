'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Eye, EyeOff, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { cn } from '@/lib/utils';

/**
 * Password change form with live strength feedback.
 *
 * The rules shown here mirror `checkPasswordStrength` exactly so the user is
 * never told a password is acceptable and then rejected by the server — but the
 * server remains the authority, and this component's checks are advisory.
 */

type Rule = { label: string; test: (value: string, context: string[]) => boolean };

const RULES: Rule[] = [
  { label: 'Au moins 10 caractères', test: (v) => v.length >= 10 },
  { label: 'Une minuscule', test: (v) => /[a-z]/.test(v) },
  { label: 'Une majuscule', test: (v) => /[A-Z]/.test(v) },
  { label: 'Un chiffre', test: (v) => /[0-9]/.test(v) },
  { label: 'Un caractère spécial', test: (v) => /[^A-Za-z0-9]/.test(v) },
  {
    label: 'Ne contient pas votre identifiant',
    test: (v, context) =>
      v.length > 0 &&
      !context.some((hint) => hint && hint.length >= 4 && v.toLowerCase().includes(hint.toLowerCase())),
  },
];

export function ChangePasswordForm({
  csrf,
  forced,
  username,
  email,
}: {
  csrf: string;
  forced: boolean;
  username: string;
  email: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldError, setFieldError] = React.useState<Record<string, string>>({});
  const [show, setShow] = React.useState(false);
  const [values, setValues] = React.useState({ currentPassword: '', newPassword: '', confirmPassword: '' });

  const context = React.useMemo(() => [username, email.split('@')[0] ?? ''], [username, email]);
  const results = RULES.map((rule) => rule.test(values.newPassword, context));
  const passed = results.filter(Boolean).length;
  const allPassed = results.every(Boolean);
  const matches = values.newPassword !== '' && values.newPassword === values.confirmPassword;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setFieldError({});

    try {
      const response = await fetch('/api/auth/changer-mot-de-passe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({ ...values, csrf }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        fields?: Record<string, string>;
        redirect?: string;
      };

      if (!response.ok) {
        if (payload.fields) setFieldError(payload.fields);
        throw new Error(payload.error ?? 'Modification impossible.');
      }

      router.push(payload.redirect ?? '/espace-admin');
      router.refresh();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Modification impossible.');
    }
  }

  const strengthTone =
    passed <= 2 ? 'bg-danger' : passed <= 4 ? 'bg-warning' : allPassed ? 'bg-success' : 'bg-warning';

  return (
    /**
     * `data-csrf` exposes the token to the page's own scripts (and to the
     * end-to-end test). This is not a leak: the token is only valid together
     * with the httpOnly session cookie it is HMAC-bound to, so a third-party
     * page that could read it still could not use it.
     */
    <form onSubmit={onSubmit} className="space-y-4" data-csrf={csrf}>
      <Field
        label={forced ? 'Mot de passe actuel (initial)' : 'Mot de passe actuel'}
        required
        htmlFor="currentPassword"
        error={fieldError.currentPassword}
      >
        <Input
          id="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          maxLength={200}
          value={values.currentPassword}
          onChange={(e) => setValues((v) => ({ ...v, currentPassword: e.target.value }))}
          autoFocus
        />
      </Field>

      <Field label="Nouveau mot de passe" required htmlFor="newPassword" error={fieldError.newPassword}>
        <div className="relative">
          <Input
            id="newPassword"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            required
            maxLength={200}
            value={values.newPassword}
            onChange={(e) => setValues((v) => ({ ...v, newPassword: e.target.value }))}
            className="pe-10"
          />
          <button
            type="button"
            onClick={() => setShow((v) => !v)}
            aria-label={show ? 'Masquer' : 'Afficher'}
            className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-subtle transition-colors hover:text-fg"
          >
            {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>

      {values.newPassword !== '' && (
        <div>
          <div className="flex gap-1" aria-hidden>
            {Array.from({ length: RULES.length }, (_, i) => (
              <span
                key={i}
                className={cn('h-1 flex-1 rounded-full transition-colors', i < passed ? strengthTone : 'bg-surface-sunken')}
              />
            ))}
          </div>
          <ul className="mt-2.5 grid gap-1 sm:grid-cols-2">
            {RULES.map((rule, index) => (
              <li
                key={rule.label}
                className={cn(
                  'flex items-center gap-1.5 text-[0.6875rem]',
                  results[index] ? 'text-success' : 'text-fg-subtle',
                )}
              >
                {results[index] ? <Check className="size-3 shrink-0" /> : <X className="size-3 shrink-0" />}
                {rule.label}
              </li>
            ))}
          </ul>
        </div>
      )}

      <Field
        label="Confirmer le nouveau mot de passe"
        required
        htmlFor="confirmPassword"
        error={
          fieldError.confirmPassword ??
          (values.confirmPassword !== '' && !matches ? 'Les deux mots de passe ne correspondent pas.' : undefined)
        }
      >
        <Input
          id="confirmPassword"
          type={show ? 'text' : 'password'}
          autoComplete="new-password"
          required
          maxLength={200}
          value={values.confirmPassword}
          onChange={(e) => setValues((v) => ({ ...v, confirmPassword: e.target.value }))}
        />
      </Field>

      {error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2.5 text-[0.8125rem] font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      <Button
        type="submit"
        size="lg"
        className="w-full"
        disabled={busy || !allPassed || !matches || values.currentPassword === ''}
      >
        {busy ? 'Enregistrement…' : 'Enregistrer le mot de passe'}
      </Button>
    </form>
  );
}
