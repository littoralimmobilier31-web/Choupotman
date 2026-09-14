'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

/**
 * Password change for a portal user.
 *
 * The requirements are shown as a live checklist rather than revealed one at a
 * time by the server: the user sees what is still missing while typing. The
 * server enforces exactly the same policy — this is guidance, not the gate.
 */

const RULES: { label: string; test: (value: string) => boolean }[] = [
  { label: 'Au moins 10 caractères', test: (v) => v.length >= 10 },
  { label: 'Une lettre minuscule', test: (v) => /[a-z]/.test(v) },
  { label: 'Une lettre majuscule', test: (v) => /[A-Z]/.test(v) },
  { label: 'Un chiffre', test: (v) => /[0-9]/.test(v) },
  { label: 'Un caractère spécial', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

export function ClientPasswordForm({ csrf, forced }: { csrf: string; forced: boolean }) {
  const router = useRouter();
  const [current, setCurrent] = React.useState('');
  const [next, setNext] = React.useState('');
  const [confirm, setConfirm] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const satisfied = RULES.filter((rule) => rule.test(next)).length;
  const matches = next.length > 0 && next === confirm;
  const ready = satisfied === RULES.length && matches && current.length > 0;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/client/mot-de-passe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({
          currentPassword: current,
          newPassword: next,
          confirmPassword: confirm,
          csrf,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Changement impossible.');

      setDone(true);
      router.refresh();
      setTimeout(() => router.push('/client'), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Changement impossible.');
      setBusy(false);
    }
  };

  if (done) {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2.5 text-[0.8125rem] text-success">
        <Check className="size-4 shrink-0" />
        Mot de passe modifié. Redirection…
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field
        label={forced ? 'Mot de passe provisoire reçu' : 'Mot de passe actuel'}
        required
        htmlFor="cp-current"
      >
        <Input
          id="cp-current"
          type="password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          autoComplete="current-password"
          required
          autoFocus
        />
      </Field>

      <Field label="Nouveau mot de passe" required htmlFor="cp-next">
        <Input
          id="cp-next"
          type="password"
          value={next}
          onChange={(event) => setNext(event.target.value)}
          autoComplete="new-password"
          required
        />
      </Field>

      <ul className="space-y-1">
        {RULES.map((rule) => {
          const passed = rule.test(next);
          return (
            <li
              key={rule.label}
              className={cn(
                'flex items-center gap-1.5 text-[0.6875rem]',
                passed ? 'text-success' : 'text-fg-subtle',
              )}
            >
              <Check className={cn('size-3', passed ? 'opacity-100' : 'opacity-30')} />
              {rule.label}
            </li>
          );
        })}
      </ul>

      <Field
        label="Confirmer le nouveau mot de passe"
        required
        htmlFor="cp-confirm"
        error={confirm.length > 0 && !matches ? 'Les deux mots de passe ne correspondent pas.' : undefined}
      >
        <Input
          id="cp-confirm"
          type="password"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          autoComplete="new-password"
          required
        />
      </Field>

      {error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2.5 text-[0.8125rem] font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={!ready || busy} className="w-full">
        {busy && <Loader2 className="size-4 animate-spin" />}
        {busy ? 'Enregistrement…' : 'Enregistrer le nouveau mot de passe'}
      </Button>
    </form>
  );
}
