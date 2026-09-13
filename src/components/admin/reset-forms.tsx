'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Mail, KeyRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

/** Request a reset link. Always reports success, whether or not the account exists. */
export function ForgotPasswordForm() {
  const [state, setState] = React.useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = React.useState<string | null>(null);
  const [message, setMessage] = React.useState<string>('');

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === 'sending') return;
    setState('sending');
    setError(null);

    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch('/api/auth/reinitialiser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: String(form.get('email') ?? '') }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; message?: string };
      if (!response.ok) throw new Error(payload.error ?? 'Demande impossible.');
      setMessage(payload.message ?? 'Demande enregistrée.');
      setState('sent');
    } catch (err) {
      setState('idle');
      setError(err instanceof Error ? err.message : 'Demande impossible.');
    }
  }

  if (state === 'sent') {
    return (
      <div className="rounded-lg border border-success/30 bg-success-soft/50 px-4 py-5 text-center">
        <span className="inline-flex size-10 items-center justify-center rounded-full bg-success/15 text-success">
          <CheckCircle2 className="size-5" />
        </span>
        <p className="mt-3 text-[0.8125rem] leading-relaxed text-fg-muted">{message}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Adresse email" required htmlFor="reset-email">
        <Input
          id="reset-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={180}
          autoFocus
        />
      </Field>

      {error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2.5 text-[0.8125rem] font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={state === 'sending'}>
        {state === 'sending' ? 'Envoi…' : 'Envoyer le lien'}
        {state !== 'sending' && <Mail className="size-4" />}
      </Button>
    </form>
  );
}

/** Consume a reset token and set a new password. */
export function ResetPasswordForm({ token }: { token: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [fieldError, setFieldError] = React.useState<Record<string, string>>({});
  const [values, setValues] = React.useState({ newPassword: '', confirmPassword: '' });

  const strongEnough =
    values.newPassword.length >= 10 &&
    /[a-z]/.test(values.newPassword) &&
    /[A-Z]/.test(values.newPassword) &&
    /[0-9]/.test(values.newPassword) &&
    /[^A-Za-z0-9]/.test(values.newPassword);
  const matches = values.newPassword !== '' && values.newPassword === values.confirmPassword;

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    setFieldError({});

    try {
      const response = await fetch('/api/auth/reinitialiser', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...values }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        fields?: Record<string, string>;
        redirect?: string;
      };
      if (!response.ok) {
        if (payload.fields) setFieldError(payload.fields);
        throw new Error(payload.error ?? 'Réinitialisation impossible.');
      }
      router.push(`${payload.redirect ?? '/espace-admin/connexion'}?deconnecte=1`);
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Réinitialisation impossible.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Nouveau mot de passe" required htmlFor="new-password" error={fieldError.newPassword}>
        <Input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          maxLength={200}
          value={values.newPassword}
          onChange={(e) => setValues((v) => ({ ...v, newPassword: e.target.value }))}
          autoFocus
        />
      </Field>

      <Field
        label="Confirmer le mot de passe"
        required
        htmlFor="confirm-password"
        error={
          fieldError.confirmPassword ??
          (values.confirmPassword !== '' && !matches ? 'Les deux mots de passe ne correspondent pas.' : undefined)
        }
      >
        <Input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          maxLength={200}
          value={values.confirmPassword}
          onChange={(e) => setValues((v) => ({ ...v, confirmPassword: e.target.value }))}
        />
      </Field>

      <p className="text-[0.6875rem] leading-relaxed text-fg-subtle">
        Au moins 10 caractères, avec une majuscule, une minuscule, un chiffre et un caractère spécial.
      </p>

      {error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2.5 text-[0.8125rem] font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={busy || !strongEnough || !matches}>
        {busy ? 'Enregistrement…' : 'Définir le mot de passe'}
        {!busy && <KeyRound className="size-4" />}
      </Button>
    </form>
  );
}
