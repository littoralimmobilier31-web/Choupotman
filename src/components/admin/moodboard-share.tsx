'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, KeyRound, Link2, Plus, ShieldOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Field, Input, Select, Switch } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { useAction } from './use-resource-form';

/**
 * Sharing panel: the read-only public link, and the capture tokens.
 *
 * The two are different in kind and the interface says so. The share link lets
 * anyone with the address *look* at the board. A capture token lets a program
 * *add* one item to it and nothing else — which is what makes it safe to paste
 * into a browser extension.
 *
 * A token's value is shown exactly once, at creation, because only its hash is
 * stored. Saying that plainly is the difference between a person copying it now
 * and a person asking later why it cannot be shown again.
 */

export type TokenRecord = {
  id: number;
  label: string | null;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
};

export function MoodboardShare({
  csrf,
  boardId,
  shareToken,
  tokens,
  origin,
  canEdit,
}: {
  csrf: string;
  boardId: number;
  shareToken: string | null;
  tokens: TokenRecord[];
  origin: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const { run, busy } = useAction(csrf);
  const [creating, setCreating] = React.useState(false);
  const [issued, setIssued] = React.useState<string | null>(null);
  const [revoking, setRevoking] = React.useState<TokenRecord | null>(null);

  const shareUrl = shareToken ? `${origin}/moodboard/${shareToken}` : null;
  const active = tokens.filter((token) => token.revoked_at === null);

  const copy = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copié.`);
    } catch {
      toast.error('Copie impossible — sélectionnez le texte manuellement.');
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Lien de consultation</CardTitle>
          <CardDescription>
            Une adresse publique en lecture seule, à envoyer au client pour qu’il voie la planche sans compte.
          </CardDescription>
        </CardHeader>
        <CardBody className="space-y-3">
          <div className="flex items-start justify-between gap-4 rounded-lg bg-surface-sunken px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-[0.8125rem] font-medium text-fg">
                {shareToken ? 'Lien actif' : 'Lien désactivé'}
              </p>
              <p className="mt-0.5 text-[0.75rem] leading-relaxed text-fg-muted">
                {shareToken
                  ? 'Toute personne disposant de l’adresse peut consulter la planche.'
                  : 'La planche n’est visible que depuis l’administration.'}
              </p>
            </div>
            {canEdit && (
              <Switch
                checked={shareToken !== null}
                onChange={async (next) => {
                  await run(`/api/moodboards/${boardId}`, {
                    method: 'PATCH',
                    body: { share: next },
                    success: next ? 'Lien public activé.' : 'Lien public désactivé.',
                  });
                }}
                label={shareToken ? 'Activé' : 'Désactivé'}
              />
            )}
          </div>

          {shareUrl && (
            <div className="flex gap-2">
              <Input readOnly value={shareUrl} className="font-mono text-[0.75rem]" aria-label="Lien public" />
              <Button variant="secondary" size="sm" onClick={() => copy(shareUrl, 'Lien')}>
                <Copy className="size-3.5" />
              </Button>
              <a
                href={shareUrl}
                target="_blank"
                rel="noreferrer"
                aria-label="Ouvrir le lien public"
                className="inline-flex items-center rounded-lg border border-line px-2.5 text-fg-muted transition-colors hover:text-fg"
              >
                <Link2 className="size-3.5" />
              </a>
            </div>
          )}

          {shareToken && canEdit && (
            <button
              type="button"
              disabled={busy}
              onClick={async () => {
                // Re-enabling issues a fresh token: the old address stops working.
                await run(`/api/moodboards/${boardId}`, {
                  method: 'PATCH',
                  body: { share: true },
                  success: 'Nouveau lien généré — l’ancien ne fonctionne plus.',
                });
              }}
              className="text-[0.75rem] text-fg-subtle underline decoration-dotted underline-offset-2 transition-colors hover:text-fg"
            >
              Générer une nouvelle adresse (invalide l’ancienne)
            </button>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Jetons de capture</CardTitle>
              <CardDescription>
                Pour envoyer une image sur cette planche depuis l’extérieur — une extension de navigateur, un
                partage depuis le téléphone. Un jeton ne peut rien faire d’autre qu’ajouter un élément à cette
                planche.
              </CardDescription>
            </div>
            {canEdit && (
              <Button variant="secondary" size="sm" onClick={() => setCreating(true)}>
                <Plus className="size-3.5" />
                Créer
              </Button>
            )}
          </div>
        </CardHeader>

        <CardBody className="space-y-3">
          {issued && (
            <div className="rounded-lg border border-accent bg-accent-soft px-3 py-2.5">
              <p className="text-[0.75rem] font-semibold text-accent">
                Copiez ce jeton maintenant — il ne sera plus affiché.
              </p>
              <p className="mt-0.5 text-[0.6875rem] leading-relaxed text-fg-muted">
                Seule son empreinte est enregistrée : même en consultant la base, personne ne peut le retrouver.
              </p>
              <div className="mt-2 flex gap-2">
                <Input readOnly value={issued} className="font-mono text-[0.75rem]" aria-label="Jeton de capture" />
                <Button size="sm" onClick={() => copy(issued, 'Jeton')}>
                  <Copy className="size-3.5" />
                </Button>
              </div>
              <button
                type="button"
                onClick={() => setIssued(null)}
                className="mt-2 inline-flex items-center gap-1 text-[0.6875rem] font-medium text-accent"
              >
                <Check className="size-3" />
                C’est copié
              </button>
            </div>
          )}

          {active.length === 0 ? (
            <p className="py-1 text-[0.8125rem] text-fg-muted">
              Aucun jeton actif. La planche ne peut recevoir d’éléments que depuis l’administration.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {active.map((token) => {
                const expired = token.expires_at !== null && token.expires_at < new Date().toISOString();
                return (
                  <li
                    key={token.id}
                    className="flex items-center gap-2 rounded-lg border border-line bg-surface-raised px-3 py-2"
                  >
                    <KeyRound className="size-3.5 shrink-0 text-fg-subtle" />
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2">
                        <span className="truncate text-[0.8125rem] font-medium text-fg">
                          {token.label ?? 'Sans libellé'}
                        </span>
                        {expired && <Badge tone="outline">Expiré</Badge>}
                      </p>
                      <p className="text-[0.6875rem] text-fg-subtle">
                        créé le {token.created_at.slice(0, 10)}
                        {token.expires_at && ` · expire le ${token.expires_at.slice(0, 10)}`}
                        {token.last_used_at
                          ? ` · dernier usage ${token.last_used_at.slice(0, 10)}`
                          : ' · jamais utilisé'}
                      </p>
                    </div>
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => setRevoking(token)}
                        aria-label="Révoquer ce jeton"
                        className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                      >
                        <ShieldOff className="size-3.5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {active.length > 0 && (
            <details className="rounded-lg bg-surface-sunken px-3 py-2.5">
              <summary className="cursor-pointer text-[0.75rem] font-medium text-fg">
                Comment utiliser un jeton
              </summary>
              <p className="mt-2 text-[0.75rem] leading-relaxed text-fg-muted">
                Envoyez une requête <code className="font-mono">POST</code> à{' '}
                <code className="font-mono">{origin}/api/capture</code> avec l’en-tête{' '}
                <code className="font-mono">X-Capture-Token</code>, et soit un corps JSON
                (<code className="font-mono">url</code>, <code className="font-mono">source_url</code>), soit un
                envoi multipart avec le champ <code className="font-mono">fichier</code> pour une image.
              </p>
            </details>
          )}
        </CardBody>
      </Card>

      {creating && (
        <TokenModal
          csrf={csrf}
          boardId={boardId}
          onIssued={(token) => {
            setIssued(token);
            setCreating(false);
            router.refresh();
          }}
          onClose={() => setCreating(false)}
        />
      )}

      <ConfirmDialog
        open={revoking !== null}
        onClose={() => setRevoking(null)}
        onConfirm={async () => {
          const target = revoking;
          setRevoking(null);
          if (!target) return;
          await run(`/api/moodboards/${boardId}/jetons?jeton=${target.id}`, {
            method: 'DELETE',
            success: 'Jeton révoqué.',
          });
        }}
        title="Révoquer ce jeton ?"
        message="Toute application qui l’utilise cessera immédiatement de pouvoir ajouter des éléments. Les éléments déjà ajoutés restent en place."
        confirmLabel="Révoquer"
        busy={busy}
      />
    </div>
  );
}

function TokenModal({
  csrf,
  boardId,
  onIssued,
  onClose,
}: {
  csrf: string;
  boardId: number;
  onIssued: (token: string) => void;
  onClose: () => void;
}) {
  const { run, busy } = useAction(csrf);
  const [label, setLabel] = React.useState('');
  const [expiry, setExpiry] = React.useState('90');

  return (
    <Modal
      open
      onClose={onClose}
      title="Nouveau jeton de capture"
      description="Il autorise une seule action : ajouter un élément à cette planche."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={busy}
            onClick={async () => {
              const result = await run<{ token?: string }>(`/api/moodboards/${boardId}/jetons`, {
                body: {
                  label: label.trim() || null,
                  expires_in_days: expiry === '' ? null : Number(expiry),
                },
                silent: true,
              });
              if (result?.token) onIssued(result.token);
            }}
          >
            Créer le jeton
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Field label="Libellé" htmlFor="tk-label" hint="Où ce jeton sera utilisé — pour savoir lequel révoquer.">
          <Input
            id="tk-label"
            value={label}
            onChange={(event) => setLabel(event.target.value)}
            maxLength={120}
            placeholder="Extension Chrome — portable"
            autoFocus
          />
        </Field>

        <Field label="Expiration" htmlFor="tk-expiry" hint="Un jeton qui expire est un jeton qu’on n’oublie pas de retirer.">
          <Select id="tk-expiry" value={expiry} onChange={(event) => setExpiry(event.target.value)}>
            <option value="30">30 jours</option>
            <option value="90">90 jours</option>
            <option value="365">1 an</option>
            <option value="">Sans expiration</option>
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
