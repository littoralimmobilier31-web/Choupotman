'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, LogIn } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';

/**
 * Login form.
 *
 * Errors are deliberately generic ("identifiants incorrects") so the response
 * never reveals whether a username exists. A lockout or rate-limit response is
 * the one case where the message is specific, because the user needs to know how
 * long to wait.
 */
export function LoginForm({ redirectTo }: { redirectTo?: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showPassword, setShowPassword] = React.useState(false);
  const [csrf, setCsrf] = React.useState('');

  /**
   * The CSRF nonce is fetched from a route handler rather than rendered into the
   * page: Next only allows cookie writes from a handler, and the double-submit
   * check needs the cookie and the form value to be minted together.
   */
  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/auth/csrf', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error('csrf'))))
      .then((payload: { token?: string }) => {
        if (!cancelled && payload.token) setCsrf(payload.token);
      })
      .catch(() => {
        if (!cancelled) setError('Impossible de préparer le formulaire. Rechargez la page.');
      });
    return () => { cancelled = true; };
  }, []);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || csrf === '') return;
    setBusy(true);
    setError(null);

    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch('/api/auth/connexion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          login: String(form.get('login') ?? ''),
          password: String(form.get('password') ?? ''),
          csrf,
        }),
      });

      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        redirect?: string;
      };

      if (!response.ok) throw new Error(payload.error ?? 'Connexion impossible.');

      // A full refresh is required: the session cookie changes what the server
      // renders for every admin route.
      const target = payload.redirect ?? redirectTo ?? '/espace-admin';
      router.push(target.startsWith('/espace-admin') ? target : '/espace-admin');
      router.refresh();
    } catch (err) {
      setBusy(false);
      setError(err instanceof Error ? err.message : 'Connexion impossible.');
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <Field label="Nom d’utilisateur ou email" required htmlFor="login">
        <Input
          id="login"
          name="login"
          autoComplete="username"
          autoCapitalize="none"
          spellCheck={false}
          required
          maxLength={180}
          autoFocus
        />
      </Field>

      <Field label="Mot de passe" required htmlFor="password">
        <div className="relative">
          <Input
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            required
            maxLength={200}
            className="pe-10"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
            className="absolute end-2 top-1/2 -translate-y-1/2 rounded p-1 text-fg-subtle transition-colors hover:text-fg"
          >
            {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </Field>

      {error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2.5 text-[0.8125rem] font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={busy || csrf === ''}>
        {busy ? 'Connexion…' : csrf === '' ? 'Préparation…' : 'Se connecter'}
        {!busy && csrf !== '' && <LogIn className="size-4 rtl:-scale-x-100" />}
      </Button>
    </form>
  );
}
