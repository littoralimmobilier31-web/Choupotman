'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Check, Copy, KeyRound, Lock, Pencil, Plus, ShieldAlert, Trash2, UserPlus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { TableWrap, Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Field, Input, Select, Switch } from '@/components/ui/field';
import { useToast } from '@/components/ui/toast';
import { useAction } from './use-resource-form';

/**
 * User accounts.
 *
 * A created or reset account gets a temporary password shown exactly once, and
 * the account is flagged to change it at first sign-in — so the person who set it
 * up does not keep a working credential for someone else's account. The dialog
 * says that plainly, because it is the difference between someone copying the
 * password now and someone asking for it again tomorrow.
 */

export type UserRecord = {
  id: number;
  username: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  role_id: number;
  role_slug: string;
  role_name: string;
  locale: string;
  is_active: 0 | 1;
  must_change_password: 0 | 1;
  last_login_at: string | null;
  failed_login_count: number;
  locked_until: string | null;
};

export type RoleOption = { id: number; slug: string; name: string; description: string | null };

const ROLE_TONES: Record<string, BadgeTone> = {
  super_admin: 'brand',
  manager: 'info',
  finance: 'success',
  editor: 'warning',
  viewer: 'neutral',
};

export function UserManager({
  csrf,
  users,
  roles,
  currentUserId,
  superAdminCount,
  canCreate,
  canUpdate,
  canDelete,
}: {
  csrf: string;
  users: UserRecord[];
  roles: RoleOption[];
  currentUserId: number;
  superAdminCount: number;
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const { run, busy } = useAction(csrf);
  const [editing, setEditing] = React.useState<UserRecord | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<UserRecord | null>(null);
  const [issued, setIssued] = React.useState<{ username: string; password: string } | null>(null);

  const now = new Date().toISOString();

  return (
    <div className="space-y-4">
      {issued && <TemporaryPassword issued={issued} onDismiss={() => setIssued(null)} />}

      {canCreate && (
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => setEditing('new')}>
            <UserPlus className="size-3.5" />
            Nouveau compte
          </Button>
        </div>
      )}

      <TableWrap>
        <Table>
          <Thead>
            <tr>
              <Th>Compte</Th>
              <Th>Rôle</Th>
              <Th alignment="center">État</Th>
              <Th>Dernière connexion</Th>
              <Th alignment="end">Actions</Th>
            </tr>
          </Thead>
          <Tbody>
            {users.map((entry) => {
              const locked = entry.locked_until !== null && entry.locked_until > now;
              const isLastSuperAdmin =
                entry.role_slug === 'super_admin' && entry.is_active === 1 && superAdminCount === 1;

              return (
                <Tr key={entry.id} className={cn(entry.is_active === 0 && 'opacity-60')}>
                  <Td>
                    <span className="flex items-center gap-2">
                      <span className="truncate font-medium text-fg">{entry.username}</span>
                      {entry.id === currentUserId && <Badge tone="outline">vous</Badge>}
                    </span>
                    <span className="block truncate text-[0.6875rem] text-fg-subtle">
                      {[entry.full_name, entry.email].filter(Boolean).join(' · ')}
                    </span>
                  </Td>

                  <Td>
                    <Badge tone={ROLE_TONES[entry.role_slug] ?? 'neutral'}>{entry.role_name}</Badge>
                  </Td>

                  <Td alignment="center">
                    <span className="flex flex-wrap items-center justify-center gap-1">
                      {entry.is_active === 0 && <Badge tone="outline">Désactivé</Badge>}
                      {locked && (
                        <Badge tone="danger">
                          <Lock className="me-0.5 inline size-2.5" />
                          Verrouillé
                        </Badge>
                      )}
                      {entry.must_change_password === 1 && <Badge tone="warning">Mot de passe à changer</Badge>}
                      {entry.is_active === 1 && !locked && entry.must_change_password === 0 && (
                        <Badge tone="success">Actif</Badge>
                      )}
                    </span>
                    {entry.failed_login_count > 0 && (
                      <span className="mt-0.5 block text-[0.625rem] text-fg-subtle">
                        {entry.failed_login_count} échec{entry.failed_login_count === 1 ? '' : 's'} de connexion
                      </span>
                    )}
                  </Td>

                  <Td className="whitespace-nowrap text-[0.75rem] text-fg-muted">
                    {entry.last_login_at ? entry.last_login_at.slice(0, 16).replace('T', ' à ') : 'jamais'}
                  </Td>

                  <Td alignment="end">
                    <span className="flex items-center justify-end gap-1">
                      {canUpdate && (
                        <>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={async () => {
                              const result = await run<{ temporaryPassword?: string }>(
                                `/api/utilisateurs/${entry.id}`,
                                {
                                  method: 'PATCH',
                                  body: { reset_password: true },
                                  success: 'Mot de passe réinitialisé, sessions fermées.',
                                  silent: true,
                                },
                              );
                              if (result?.temporaryPassword) {
                                setIssued({ username: entry.username, password: result.temporaryPassword });
                              }
                            }}
                            aria-label={`Réinitialiser le mot de passe de ${entry.username}`}
                            title="Réinitialiser le mot de passe"
                            className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                          >
                            <KeyRound className="size-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditing(entry)}
                            aria-label={`Modifier ${entry.username}`}
                            className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                          >
                            <Pencil className="size-3.5" />
                          </button>
                        </>
                      )}
                      {canDelete && entry.id !== currentUserId && !isLastSuperAdmin && (
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(entry)}
                          aria-label={`Désactiver ${entry.username}`}
                          className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                      {isLastSuperAdmin && (
                        <span
                          title="Dernier Super Admin actif — ni modifiable en rôle, ni supprimable"
                          className="p-1.5 text-fg-subtle"
                        >
                          <ShieldAlert className="size-3.5" />
                        </span>
                      )}
                    </span>
                  </Td>
                </Tr>
              );
            })}
          </Tbody>
        </Table>
      </TableWrap>

      {editing !== null && (
        <UserModal
          csrf={csrf}
          user={editing === 'new' ? null : editing}
          roles={roles}
          isLastSuperAdmin={
            editing !== 'new' &&
            editing.role_slug === 'super_admin' &&
            editing.is_active === 1 &&
            superAdminCount === 1
          }
          onIssued={(password, username) => setIssued({ username, password })}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          const target = confirmDelete;
          setConfirmDelete(null);
          if (!target) return;
          await run(`/api/utilisateurs/${target.id}`, { method: 'DELETE', success: 'Compte désactivé.' });
        }}
        title={`Désactiver le compte « ${confirmDelete?.username ?? ''} » ?`}
        message="Ses sessions ouvertes sont fermées immédiatement et il ne pourra plus se connecter. Le compte est conservé, ainsi que sa trace dans le journal d’activité."
        confirmLabel="Désactiver"
        busy={busy}
      />
    </div>
  );
}

function TemporaryPassword({
  issued,
  onDismiss,
}: {
  issued: { username: string; password: string };
  onDismiss: () => void;
}) {
  const toast = useToast();

  return (
    <div className="rounded-lg border border-accent bg-accent-soft px-3.5 py-3" role="alert">
      <p className="text-[0.8125rem] font-semibold text-accent">
        Mot de passe provisoire de {issued.username} — copiez-le maintenant
      </p>
      <p className="mt-0.5 text-[0.75rem] leading-relaxed text-fg-muted">
        Il ne sera plus affiché : seule son empreinte est enregistrée. Transmettez-le par un canal sûr — la personne
        devra le remplacer à sa première connexion.
      </p>
      <div className="mt-2 flex gap-2">
        <Input readOnly value={issued.password} className="font-mono text-[0.8125rem]" aria-label="Mot de passe provisoire" />
        <Button
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(issued.password);
              toast.success('Mot de passe copié.');
            } catch {
              toast.error('Copie impossible — sélectionnez le texte manuellement.');
            }
          }}
        >
          <Copy className="size-3.5" />
        </Button>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-2 inline-flex items-center gap-1 text-[0.6875rem] font-medium text-accent"
      >
        <Check className="size-3" />
        C’est transmis
      </button>
    </div>
  );
}

function UserModal({
  csrf,
  user,
  roles,
  isLastSuperAdmin,
  onIssued,
  onClose,
}: {
  csrf: string;
  user: UserRecord | null;
  roles: RoleOption[];
  isLastSuperAdmin: boolean;
  onIssued: (password: string, username: string) => void;
  onClose: () => void;
}) {
  const router = useRouter();
  const { run, busy } = useAction(csrf);

  const [values, setValues] = React.useState({
    username: user?.username ?? '',
    email: user?.email ?? '',
    full_name: user?.full_name ?? '',
    phone: user?.phone ?? '',
    role_id: user ? String(user.role_id) : String(roles.find((role) => role.slug === 'viewer')?.id ?? roles[0]?.id ?? ''),
    locale: user?.locale ?? 'fr',
    is_active: user ? user.is_active === 1 : true,
    password: '',
  });

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  const selectedRole = roles.find((role) => String(role.id) === values.role_id);
  const valid =
    /^[A-Za-z0-9._-]{3,60}$/.test(values.username) &&
    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email) &&
    values.role_id !== '';

  return (
    <Modal
      open
      onClose={onClose}
      title={user ? `Modifier ${user.username}` : 'Nouveau compte'}
      description={
        user
          ? undefined
          : 'Le compte recevra un mot de passe provisoire, à changer obligatoirement à la première connexion.'
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={busy || !valid}
            onClick={async () => {
              const payload = {
                username: values.username,
                email: values.email,
                full_name: values.full_name.trim() || null,
                phone: values.phone.trim() || null,
                role_id: Number(values.role_id),
                locale: values.locale,
                is_active: values.is_active,
                ...(user ? {} : values.password ? { password: values.password } : {}),
              };

              if (user) {
                const result = await run(`/api/utilisateurs/${user.id}`, {
                  method: 'PATCH',
                  body: payload,
                  success: 'Compte enregistré.',
                });
                if (result) {
                  router.refresh();
                  onClose();
                }
                return;
              }

              const created = await run<{ temporaryPassword?: string | null }>('/api/utilisateurs', {
                body: payload,
                success: 'Compte créé.',
                silent: true,
              });
              if (created) {
                // Shown once, by the list above: the value is not stored anywhere.
                if (created.temporaryPassword) onIssued(created.temporaryPassword, values.username);
                router.refresh();
                onClose();
              }
            }}
          >
            {user ? 'Enregistrer' : 'Créer le compte'}
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          label="Nom d’utilisateur"
          htmlFor="us-username"
          required
          hint="Lettres, chiffres, point, tiret et souligné."
        >
          <Input
            id="us-username"
            value={values.username}
            onChange={(event) => set('username', event.target.value)}
            maxLength={60}
            autoFocus={!user}
          />
        </Field>

        <Field label="Adresse email" htmlFor="us-email" required>
          <Input
            id="us-email"
            type="email"
            value={values.email}
            onChange={(event) => set('email', event.target.value)}
            maxLength={180}
          />
        </Field>

        <Field label="Nom complet" htmlFor="us-fullname">
          <Input
            id="us-fullname"
            value={values.full_name}
            onChange={(event) => set('full_name', event.target.value)}
            maxLength={160}
          />
        </Field>

        <Field label="Téléphone" htmlFor="us-phone">
          <Input
            id="us-phone"
            value={values.phone}
            onChange={(event) => set('phone', event.target.value)}
            maxLength={40}
          />
        </Field>

        <Field label="Rôle" htmlFor="us-role" required className="sm:col-span-2" hint={selectedRole?.description ?? undefined}>
          <Select
            id="us-role"
            value={values.role_id}
            onChange={(event) => set('role_id', event.target.value)}
            disabled={isLastSuperAdmin}
          >
            {roles.map((role) => (
              <option key={role.id} value={String(role.id)}>
                {role.name}
              </option>
            ))}
          </Select>
        </Field>

        {isLastSuperAdmin && (
          <p className="flex items-start gap-1.5 rounded-lg bg-warning-soft px-3 py-2 text-[0.75rem] text-fg sm:col-span-2">
            <ShieldAlert className="mt-0.5 size-3.5 shrink-0 text-warning" />
            Ce compte est le dernier Super Admin actif. Son rôle et son activation sont verrouillés : les changer
            supprimerait tout accès aux paramètres. Donnez d’abord ce rôle à un autre compte.
          </p>
        )}

        <Field label="Langue de l’interface" htmlFor="us-locale">
          <Select id="us-locale" value={values.locale} onChange={(event) => set('locale', event.target.value)}>
            <option value="fr">Français</option>
            <option value="ar">العربية</option>
            <option value="en">English</option>
          </Select>
        </Field>

        {!user && (
          <Field
            label="Mot de passe provisoire"
            htmlFor="us-password"
            hint="Laissez vide pour en générer un — il sera affiché une seule fois."
          >
            <Input
              id="us-password"
              type="text"
              value={values.password}
              onChange={(event) => set('password', event.target.value)}
              maxLength={200}
              autoComplete="off"
            />
          </Field>
        )}

        <div className="flex items-center rounded-lg bg-surface-sunken px-3 py-2.5 sm:col-span-2">
          <Switch
            checked={values.is_active}
            onChange={(next) => set('is_active', next)}
            label={values.is_active ? 'Compte actif' : 'Compte désactivé'}
            disabled={isLastSuperAdmin}
          />
        </div>
      </div>
    </Modal>
  );
}
