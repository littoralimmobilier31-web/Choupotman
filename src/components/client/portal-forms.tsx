'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Loader2, LogOut, MessageSquare, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea, Select } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';

/** Client-portal login. */
export function ClientLoginForm({ redirectTo = '/client' }: { redirectTo?: string }) {
  const router = useRouter();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/client/connexion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Connexion impossible.');

      router.push(redirectTo);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Connexion impossible.');
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <Field label="Adresse email" required htmlFor="cl-email">
        <Input
          id="cl-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          autoComplete="username"
          required
          autoFocus
        />
      </Field>

      <Field label="Mot de passe" required htmlFor="cl-password">
        <Input
          id="cl-password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          required
        />
      </Field>

      {error && (
        <p className="rounded-lg bg-danger-soft px-3 py-2.5 text-[0.8125rem] font-medium text-danger" role="alert">
          {error}
        </p>
      )}

      <Button type="submit" disabled={busy || !email || !password} className="w-full">
        {busy && <Loader2 className="size-4 animate-spin" />}
        {busy ? 'Connexion…' : 'Se connecter'}
      </Button>

      <p className="text-center text-[0.75rem] leading-relaxed text-fg-subtle">
        Vos accès vous ont été transmis par email. Si vous les avez perdus, contactez-nous et un
        nouvel accès vous sera envoyé.
      </p>
    </form>
  );
}

export function ClientLogoutButton() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch('/api/client/deconnexion', { method: 'POST' }).catch(() => null);
        router.push('/client/connexion');
        router.refresh();
      }}
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.75rem] font-medium text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
    >
      <LogOut className="size-3.5 rtl:-scale-x-100" />
      Déconnexion
    </button>
  );
}

/**
 * Client feedback on a delivery.
 *
 * Approving is separated from requesting changes because they mean different
 * things downstream: an approval can close the project, a change request may
 * consume a revision from the allowance. The form says so before sending.
 */
export function ClientFeedbackForm({
  csrf,
  projectId,
  revisionsRemaining,
  revisionExtraCost,
  currency,
}: {
  csrf: string;
  projectId: number;
  revisionsRemaining: number;
  revisionExtraCost: number;
  currency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState<'approved' | 'changes_requested' | 'comment' | null>(null);
  const [comment, setComment] = React.useState('');
  const [rating, setRating] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [sent, setSent] = React.useState(false);

  const submit = async () => {
    if (!open || busy) return;
    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/client/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
        body: JSON.stringify({
          projectId,
          decision: open,
          comment: comment || undefined,
          rating: open === 'approved' && rating ? Number(rating) : undefined,
          csrf,
        }),
      });
      const result = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? 'Envoi impossible.');

      setSent(true);
      setOpen(null);
      setComment('');
      setRating('');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Envoi impossible.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <p className="flex items-center gap-2 rounded-lg bg-success-soft px-3 py-2.5 text-[0.8125rem] text-success">
        <Check className="size-4 shrink-0" />
        Merci, votre retour a bien été transmis.
      </p>
    );
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => setOpen('approved')}>
          <Check className="size-3.5" />
          Valider la livraison
        </Button>
        <Button size="sm" variant="secondary" onClick={() => setOpen('changes_requested')}>
          Demander des modifications
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen('comment')}>
          <MessageSquare className="size-3.5" />
          Laisser un commentaire
        </Button>
      </div>

      {open && (
        <Modal
          open
          onClose={() => setOpen(null)}
          title={
            open === 'approved'
              ? 'Valider la livraison'
              : open === 'changes_requested'
                ? 'Demander des modifications'
                : 'Laisser un commentaire'
          }
          description={
            open === 'changes_requested'
              ? revisionsRemaining > 0
                ? `Il vous reste ${revisionsRemaining} révision(s) incluse(s) dans votre forfait.`
                : revisionExtraCost > 0
                  ? `Votre forfait de révisions est épuisé : cette demande pourra faire l’objet d’un supplément de ${new Intl.NumberFormat('fr-FR', { style: 'currency', currency }).format(revisionExtraCost)}.`
                  : 'Votre forfait de révisions est épuisé : cette demande sera étudiée avec vous.'
              : undefined
          }
          size="sm"
          footer={
            <>
              <Button variant="secondary" onClick={() => setOpen(null)}>
                Annuler
              </Button>
              <Button
                disabled={busy || (open !== 'approved' && comment.trim().length < 3)}
                onClick={submit}
              >
                {busy && <Loader2 className="size-4 animate-spin" />}
                Envoyer
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            {open === 'approved' && (
              <Field label="Votre satisfaction" htmlFor="cf-rating" hint="facultatif">
                <Select id="cf-rating" value={rating} onChange={(event) => setRating(event.target.value)}>
                  <option value="">Ne pas noter</option>
                  {[5, 4, 3, 2, 1].map((score) => (
                    <option key={score} value={score}>
                      {score} / 5
                    </option>
                  ))}
                </Select>
              </Field>
            )}

            <Field
              label={open === 'changes_requested' ? 'Modifications souhaitées' : 'Votre message'}
              required={open !== 'approved'}
              htmlFor="cf-comment"
              hint={
                open === 'changes_requested'
                  ? 'Soyez aussi précis que possible : cela évite des allers-retours.'
                  : undefined
              }
            >
              <Textarea
                id="cf-comment"
                rows={5}
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                maxLength={4000}
                autoFocus
              />
            </Field>

            {error && (
              <p className="rounded-lg bg-danger-soft px-3 py-2.5 text-[0.8125rem] font-medium text-danger" role="alert">
                {error}
              </p>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

/** Read-only star display for a rating already given. */
export function RatingStars({ value, className }: { value: number; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)} aria-label={`${value} sur 5`}>
      {[1, 2, 3, 4, 5].map((score) => (
        <Star
          key={score}
          className={cn('size-3.5', score <= value ? 'fill-warning text-warning' : 'text-line-strong')}
          aria-hidden
        />
      ))}
    </span>
  );
}
