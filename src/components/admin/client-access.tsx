'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, KeyRound, Plus, UserX } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Field, Input } from '@/components/ui/field';
import { useAction } from './use-resource-form';
import { formatRelative } from '@/lib/i18n/format';

/**
 * Client-portal access management.
 *
 * The temporary password is shown once, here, and never again — it is stored
 * only as a hash. A pre-filled email draft is left in the outbox rather than
 * sent: handing over credentials is the owner's decision, not the system's.
 */

export type PortalUser = {
  id: number;
  email: string;
  full_name: string | null;
  is_active: 0 | 1;
  last_login_at: string | null;
  must_change_password: 0 | 1;
};

type Issued = { email: string; temporaryPassword: string; portalUrl: string };

export function ClientAccessPanel({
  csrf,
  clientId,
  clientName,
  clientEmail,
  users,
  canManage,
}: {
  csrf: string;
  clientId: number;
  clientName: string;
  clientEmail: string | null;
  users: PortalUser[];
  canManage: boolean;
}) {
  const router = useRouter();
  const { run, busy } = useAction(csrf);
  const [creating, setCreating] = React.useState(false);
  const [issued, setIssued] = React.useState<Issued | null>(null);
  const [confirmDisable, setConfirmDisable] = React.useState<PortalUser | null>(null);

  return (
    <div className="space-y-3">
      {users.length === 0 ? (
        <p className="text-[0.75rem] leading-relaxed text-fg-muted">
          Aucun accès créé. L’espace client permet à ce client de suivre ses projets, de télécharger
          ses documents et ses factures, et de valider les livraisons.
        </p>
      ) : (
        <ul className="space-y-2">
          {users.map((user) => (
            <li key={user.id} className="rounded-lg border border-line px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[0.75rem] font-medium text-fg">{user.email}</span>
                <div className="flex items-center gap-1.5">
                  {user.must_change_password === 1 && <Badge tone="warning">Mot de passe provisoire</Badge>}
                  <Badge tone={user.is_active === 1 ? 'success' : 'neutral'}>
                    {user.is_active === 1 ? 'Actif' : 'Désactivé'}
                  </Badge>
                </div>
              </div>

              <p className="mt-1 text-[0.625rem] text-fg-subtle">
                {user.last_login_at
                  ? `Dernière connexion ${formatRelative(user.last_login_at, 'fr')}`
                  : 'Jamais connecté'}
              </p>

              {canManage && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={async () => {
                      const result = await run<{ temporaryPassword: string | null }>(
                        `/api/clients/${clientId}/acces`,
                        {
                          method: 'PATCH',
                          body: { client_user_id: user.id, reset_password: true },
                          success: 'Nouveau mot de passe provisoire généré.',
                        },
                      );
                      if (result?.temporaryPassword) {
                        setIssued({
                          email: user.email,
                          temporaryPassword: result.temporaryPassword,
                          portalUrl: `${window.location.origin}/client/connexion`,
                        });
                      }
                    }}
                  >
                    <KeyRound className="size-3.5" />
                    Réinitialiser
                  </Button>

                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={busy}
                    onClick={() => {
                      if (user.is_active === 1) setConfirmDisable(user);
                      else
                        run(`/api/clients/${clientId}/acces`, {
                          method: 'PATCH',
                          body: { client_user_id: user.id, is_active: true },
                          success: 'Accès réactivé.',
                        });
                    }}
                  >
                    <UserX className="size-3.5" />
                    {user.is_active === 1 ? 'Désactiver' : 'Réactiver'}
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <Button variant="secondary" size="sm" onClick={() => setCreating(true)} className="w-full">
          <Plus className="size-3.5" />
          Créer un accès
        </Button>
      )}

      {creating && (
        <NewAccessModal
          csrf={csrf}
          clientId={clientId}
          clientName={clientName}
          defaultEmail={clientEmail ?? ''}
          onClose={() => setCreating(false)}
          onIssued={(value) => {
            setCreating(false);
            setIssued(value);
            router.refresh();
          }}
        />
      )}

      {issued && <CredentialsModal issued={issued} onClose={() => setIssued(null)} />}

      <ConfirmDialog
        open={confirmDisable !== null}
        onClose={() => setConfirmDisable(null)}
        onConfirm={async () => {
          const target = confirmDisable;
          setConfirmDisable(null);
          if (target) {
            await run(`/api/clients/${clientId}/acces`, {
              method: 'PATCH',
              body: { client_user_id: target.id, is_active: false },
              success: 'Accès désactivé.',
            });
          }
        }}
        title="Désactiver cet accès ?"
        message="Le client sera immédiatement déconnecté et ne pourra plus se connecter. Ses données et son historique sont conservés ; vous pourrez réactiver l’accès à tout moment."
        confirmLabel="Désactiver"
        busy={busy}
      />
    </div>
  );
}

function NewAccessModal({
  csrf,
  clientId,
  clientName,
  defaultEmail,
  onClose,
  onIssued,
}: {
  csrf: string;
  clientId: number;
  clientName: string;
  defaultEmail: string;
  onClose: () => void;
  onIssued: (issued: Issued) => void;
}) {
  const { run, busy } = useAction(csrf);
  const [email, setEmail] = React.useState(defaultEmail);
  const [fullName, setFullName] = React.useState(clientName);

  return (
    <Modal
      open
      onClose={onClose}
      title="Créer un accès à l’espace client"
      description="Un mot de passe provisoire est généré et affiché une seule fois. Un brouillon d’email prêt à envoyer est déposé dans la messagerie."
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={busy || !email.includes('@')}
            onClick={async () => {
              const result = await run<{ temporaryPassword: string; portalUrl: string; email: string }>(
                `/api/clients/${clientId}/acces`,
                {
                  method: 'POST',
                  body: { email: email.trim(), full_name: fullName.trim() || null },
                  success: 'Accès créé.',
                },
              );
              if (result?.temporaryPassword) {
                onIssued({
                  email: result.email,
                  temporaryPassword: result.temporaryPassword,
                  portalUrl: result.portalUrl,
                });
              }
            }}
          >
            Créer l’accès
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label="Adresse email" required htmlFor="ca-email" hint="servira d’identifiant">
          <Input
            id="ca-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            maxLength={180}
            autoFocus
          />
        </Field>
        <Field label="Nom du contact" htmlFor="ca-name">
          <Input
            id="ca-name"
            value={fullName}
            onChange={(event) => setFullName(event.target.value)}
            maxLength={160}
          />
        </Field>
      </div>
    </Modal>
  );
}

/** Shows the temporary password once; it cannot be retrieved afterwards. */
function CredentialsModal({ issued, onClose }: { issued: Issued; onClose: () => void }) {
  const [copied, setCopied] = React.useState(false);

  const text = [
    `Espace client : ${issued.portalUrl}`,
    `Identifiant : ${issued.email}`,
    `Mot de passe provisoire : ${issued.temporaryPassword}`,
  ].join('\n');

  return (
    <Modal
      open
      onClose={onClose}
      title="Accès créé"
      description="Notez ces informations maintenant : le mot de passe n’est stocké que sous forme de hash et ne pourra plus être affiché."
      size="sm"
      footer={<Button onClick={onClose}>J’ai noté</Button>}
    >
      <div className="space-y-3">
        <dl className="space-y-2 rounded-lg bg-surface-sunken px-3 py-3 text-[0.8125rem]">
          <div>
            <dt className="text-[0.625rem] font-semibold uppercase tracking-wider text-fg-subtle">Adresse</dt>
            <dd className="mt-0.5 break-all font-mono text-[0.75rem] text-fg">{issued.portalUrl}</dd>
          </div>
          <div>
            <dt className="text-[0.625rem] font-semibold uppercase tracking-wider text-fg-subtle">Identifiant</dt>
            <dd className="mt-0.5 break-all font-mono text-[0.75rem] text-fg">{issued.email}</dd>
          </div>
          <div>
            <dt className="text-[0.625rem] font-semibold uppercase tracking-wider text-fg-subtle">
              Mot de passe provisoire
            </dt>
            <dd className="mt-0.5 break-all font-mono text-[0.8125rem] font-semibold text-fg">
              {issued.temporaryPassword}
            </dd>
          </div>
        </dl>

        <Button
          variant="secondary"
          size="sm"
          className="w-full"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            } catch {
              window.prompt('Copiez ces informations :', text);
            }
          }}
        >
          {copied ? <Check className="size-3.5 text-success" /> : <Copy className="size-3.5" />}
          {copied ? 'Copié' : 'Copier les accès'}
        </Button>

        <p className="text-[0.6875rem] leading-relaxed text-fg-subtle">
          Le client devra choisir son propre mot de passe à la première connexion. Un brouillon d’email
          l’attend dans la messagerie — relisez-le avant de l’envoyer.
        </p>
      </div>
    </Modal>
  );
}
