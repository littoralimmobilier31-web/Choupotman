'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Copy, Lock, Pencil, Plus, ShieldCheck, Trash2, Users } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Field, Input, Textarea } from '@/components/ui/field';
import { useAction } from './use-resource-form';

/**
 * Roles and their permissions.
 *
 * The editor is a grid of resources by actions, with a row and column toggle,
 * because granting "everything on invoices" or "view on everything" is what people
 * actually want to express — clicking thirty checkboxes is not.
 *
 * Built-in roles are read-only and shown as such rather than hidden. Seeing what
 * "Finance" is allowed to do is the fastest way to decide what a custom role
 * should look like, and duplicating one is offered for exactly that reason.
 */

export type RoleRecord = {
  id: number;
  slug: string;
  name: string;
  description: string | null;
  is_system: 0 | 1;
  user_count: number;
  permissions: string[];
};

export type ResourceEntry = { key: string; label: string };
export type ActionEntry = { key: string; label: string };

export function RoleManager({
  csrf,
  roles,
  resources,
  actions,
  canCreate,
  canUpdate,
  canDelete,
}: {
  csrf: string;
  roles: RoleRecord[];
  resources: ResourceEntry[];
  actions: ActionEntry[];
  canCreate: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}) {
  const { run, busy } = useAction(csrf);
  const [editing, setEditing] = React.useState<{ role: RoleRecord | null; duplicate?: RoleRecord } | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<RoleRecord | null>(null);

  const total = resources.length * actions.length;

  return (
    <div className="space-y-4">
      {canCreate && (
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => setEditing({ role: null })}>
            <Plus className="size-3.5" />
            Nouveau rôle
          </Button>
        </div>
      )}

      <ul className="grid gap-2.5 sm:grid-cols-2">
        {roles.map((role) => {
          const share = Math.round((role.permissions.length / total) * 100);

          return (
            <li
              key={role.id}
              className="flex flex-col rounded-[var(--radius-card)] border border-line bg-surface-raised p-3.5"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="flex items-center gap-2">
                    <span className="truncate text-[0.875rem] font-semibold text-fg">{role.name}</span>
                    {role.is_system === 1 && (
                      <span title="Rôle fourni — permissions verrouillées" className="text-fg-subtle">
                        <Lock className="size-3" />
                      </span>
                    )}
                  </p>
                  <p className="truncate font-mono text-[0.625rem] text-fg-subtle">{role.slug}</p>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  {role.user_count > 0 && (
                    <Badge tone="outline">
                      <Users className="me-0.5 inline size-2.5" />
                      {role.user_count}
                    </Badge>
                  )}
                  {canCreate && (
                    <button
                      type="button"
                      onClick={() => setEditing({ role: null, duplicate: role })}
                      aria-label={`Dupliquer ${role.name}`}
                      title="Dupliquer ce rôle"
                      className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                    >
                      <Copy className="size-3.5" />
                    </button>
                  )}
                  {canUpdate && (
                    <button
                      type="button"
                      onClick={() => setEditing({ role })}
                      aria-label={role.is_system === 1 ? `Consulter ${role.name}` : `Modifier ${role.name}`}
                      className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                    >
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                  {canDelete && role.is_system === 0 && (
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(role)}
                      aria-label={`Supprimer ${role.name}`}
                      className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {role.description && (
                <p className="mt-1.5 text-[0.75rem] leading-relaxed text-fg-muted">{role.description}</p>
              )}

              <div className="mt-auto pt-2.5">
                <div className="mb-1 flex items-baseline justify-between gap-2">
                  <span className="text-[0.6875rem] text-fg-subtle">
                    {role.permissions.length} / {total} permissions
                  </span>
                  <span className="text-[0.6875rem] tabular-nums text-fg-subtle">{share}%</span>
                </div>
                <div className="h-1 overflow-hidden rounded-full bg-surface-sunken">
                  <div
                    className={cn('h-full rounded-full', share === 100 ? 'bg-brand' : 'bg-accent')}
                    style={{ width: `${share}%` }}
                  />
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {roles.length === 0 && (
        <Card>
          <CardBody className="py-6 text-center">
            <ShieldCheck className="mx-auto mb-2 size-5 text-fg-subtle" />
            <p className="text-[0.8125rem] text-fg-muted">Aucun rôle. Relancez le peuplement de la base.</p>
          </CardBody>
        </Card>
      )}

      {editing !== null && (
        <RoleModal
          csrf={csrf}
          role={editing.role}
          duplicate={editing.duplicate}
          resources={resources}
          actions={actions}
          readOnly={editing.role?.is_system === 1}
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
          await run(`/api/roles/${target.id}`, { method: 'DELETE', success: 'Rôle supprimé.' });
        }}
        title={`Supprimer le rôle « ${confirmDelete?.name ?? ''} » ?`}
        message={
          confirmDelete && confirmDelete.user_count > 0
            ? `${confirmDelete.user_count} compte${confirmDelete.user_count === 1 ? '' : 's'} utilise${confirmDelete.user_count === 1 ? '' : 'nt'} encore ce rôle : la suppression sera refusée jusqu’à ce qu’ils en aient un autre.`
            : 'Le rôle disparaît. Aucun compte ne l’utilise actuellement.'
        }
        confirmLabel="Supprimer"
        busy={busy}
      />
    </div>
  );
}

function RoleModal({
  csrf,
  role,
  duplicate,
  resources,
  actions,
  readOnly,
  onClose,
}: {
  csrf: string;
  role: RoleRecord | null;
  duplicate?: RoleRecord;
  resources: ResourceEntry[];
  actions: ActionEntry[];
  readOnly?: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { run, busy } = useAction(csrf);

  const source = role ?? duplicate;
  const [name, setName] = React.useState(role ? role.name : duplicate ? `${duplicate.name} (copie)` : '');
  const [description, setDescription] = React.useState(source?.description ?? '');
  const [granted, setGranted] = React.useState<Set<string>>(new Set(source?.permissions ?? []));

  const toggle = (permission: string) => {
    if (readOnly) return;
    setGranted((previous) => {
      const next = new Set(previous);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  };

  const toggleResource = (resource: string) => {
    if (readOnly) return;
    const keys = actions.map((action) => `${resource}.${action.key}`);
    const allOn = keys.every((key) => granted.has(key));
    setGranted((previous) => {
      const next = new Set(previous);
      for (const key of keys) {
        if (allOn) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  };

  const toggleAction = (action: string) => {
    if (readOnly) return;
    const keys = resources.map((resource) => `${resource.key}.${action}`);
    const allOn = keys.every((key) => granted.has(key));
    setGranted((previous) => {
      const next = new Set(previous);
      for (const key of keys) {
        if (allOn) next.delete(key);
        else next.add(key);
      }
      return next;
    });
  };

  const valid = name.trim().length >= 2;

  return (
    <Modal
      open
      onClose={onClose}
      title={readOnly ? `${role?.name} — permissions` : role ? `Modifier ${role.name}` : 'Nouveau rôle'}
      description={
        readOnly
          ? 'Rôle fourni par le système : ses permissions sont verrouillées. Dupliquez-le pour créer une variante.'
          : 'Cliquez un intitulé de ligne ou de colonne pour tout accorder ou tout retirer d’un coup.'
      }
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {readOnly ? 'Fermer' : 'Annuler'}
          </Button>
          {!readOnly && (
            <Button
              disabled={busy || !valid}
              onClick={async () => {
                const payload = {
                  name: name.trim(),
                  description: description.trim() || null,
                  permissions: [...granted],
                };

                const result = role
                  ? await run(`/api/roles/${role.id}`, { method: 'PATCH', body: payload, success: 'Rôle enregistré.' })
                  : await run('/api/roles', { body: payload, success: 'Rôle créé.' });

                if (result) {
                  router.refresh();
                  onClose();
                }
              }}
            >
              {role ? 'Enregistrer' : 'Créer le rôle'}
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {!readOnly && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Nom du rôle" htmlFor="rl-name" required>
              <Input
                id="rl-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={80}
                autoFocus
                placeholder="Assistant administratif"
              />
            </Field>
            <Field label="Description" htmlFor="rl-description" hint="À quoi sert ce rôle.">
              <Textarea
                id="rl-description"
                rows={2}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                maxLength={400}
              />
            </Field>
          </div>
        )}

        <p className="text-[0.75rem] text-fg-muted">
          {granted.size} permission{granted.size === 1 ? '' : 's'} accordée{granted.size === 1 ? '' : 's'} sur{' '}
          {resources.length * actions.length}.
        </p>

        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full border-collapse text-[0.75rem]">
            <thead className="bg-surface-sunken">
              <tr>
                <th className="sticky start-0 z-10 bg-surface-sunken px-2.5 py-2 text-start font-medium text-fg-subtle">
                  Ressource
                </th>
                {actions.map((action) => (
                  <th key={action.key} className="px-2 py-2 text-center font-medium">
                    <button
                      type="button"
                      onClick={() => toggleAction(action.key)}
                      disabled={readOnly}
                      className={cn(
                        'whitespace-nowrap text-fg-subtle transition-colors',
                        !readOnly && 'hover:text-accent',
                      )}
                      title={readOnly ? undefined : `Tout ${action.label.toLowerCase()} / rien`}
                    >
                      {action.label}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {resources.map((resource) => (
                <tr key={resource.key} className="border-t border-line">
                  <th className="sticky start-0 z-10 bg-surface-raised px-2.5 py-1.5 text-start font-normal">
                    <button
                      type="button"
                      onClick={() => toggleResource(resource.key)}
                      disabled={readOnly}
                      className={cn('truncate text-fg transition-colors', !readOnly && 'hover:text-accent')}
                      title={readOnly ? undefined : 'Tout accorder / tout retirer sur cette ressource'}
                    >
                      {resource.label}
                    </button>
                  </th>
                  {actions.map((action) => {
                    const permission = `${resource.key}.${action.key}`;
                    const on = granted.has(permission);
                    return (
                      <td key={action.key} className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={on}
                          disabled={readOnly}
                          onChange={() => toggle(permission)}
                          aria-label={`${action.label} — ${resource.label}`}
                          className="size-3.5 cursor-pointer accent-[var(--color-accent)] disabled:cursor-not-allowed"
                        />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}
