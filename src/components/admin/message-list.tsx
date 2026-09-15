'use client';

import * as React from 'react';
import { AlertCircle, Clock, Lock, RefreshCw, Send, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/modal';
import { useAction } from './use-resource-form';

/**
 * Message history.
 *
 * Sent messages are read-only and cannot be deleted — that is the point of
 * keeping them. The interface shows why rather than just disabling the buttons,
 * so the restriction reads as a guarantee instead of a limitation.
 */

export type MessageRecord = {
  id: number;
  subject: string | null;
  body: string | null;
  to_name: string | null;
  to_address: string | null;
  status: string;
  error: string | null;
  template_key: string | null;
  client_name: string | null;
  project_title: string | null;
  sent_at: string | null;
  created_at: string;
};

const STATUS_TONES: Record<string, BadgeTone> = {
  sent: 'success',
  draft: 'neutral',
  queued: 'warning',
  failed: 'danger',
};

const STATUS_LABELS: Record<string, string> = {
  sent: 'Envoyé',
  draft: 'Brouillon',
  queued: 'En attente',
  failed: 'Échec',
};

export function MessageList({
  csrf,
  messages,
  canSend,
  mailConfigured,
  queuedCount,
}: {
  csrf: string;
  messages: MessageRecord[];
  canSend: boolean;
  mailConfigured: boolean;
  queuedCount: number;
}) {
  const { run, busy } = useAction(csrf);
  const [expanded, setExpanded] = React.useState<number | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<MessageRecord | null>(null);

  return (
    <div className="space-y-3">
      {queuedCount > 0 && canSend && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-surface-sunken px-3.5 py-3">
          <p className="text-[0.8125rem] text-fg-muted">
            <Clock className="me-1.5 inline size-3.5 text-warning" />
            {queuedCount} message{queuedCount === 1 ? '' : 's'} en attente d’envoi.
            {!mailConfigured && ' Aucun serveur SMTP n’est configuré pour l’instant.'}
          </p>
          <Button
            variant="secondary"
            size="sm"
            disabled={busy || !mailConfigured}
            onClick={() => run('/api/messages/file', { success: 'File d’envoi traitée.' })}
          >
            <RefreshCw className="size-3.5" />
            Traiter la file
          </Button>
        </div>
      )}

      {messages.length === 0 ? (
        <Card>
          <CardBody className="py-8 text-center">
            <Send className="mx-auto mb-2 size-5 text-fg-subtle" />
            <p className="text-[0.875rem] font-medium text-fg">Aucun message</p>
            <p className="mx-auto mt-1 max-w-md text-[0.8125rem] text-fg-muted">
              Les messages envoyés depuis un devis, une facture ou cette page apparaîtront ici.
            </p>
          </CardBody>
        </Card>
      ) : (
        <ul className="space-y-1.5">
          {messages.map((message) => {
            const open = expanded === message.id;
            const locked = message.status === 'sent';

            return (
              <li
                key={message.id}
                className={cn(
                  'rounded-lg border border-line bg-surface-raised',
                  message.status === 'failed' && 'border-danger/40',
                )}
              >
                <div className="flex items-start gap-2 p-3">
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : message.id)}
                    className="min-w-0 flex-1 text-start"
                    aria-expanded={open}
                  >
                    <span className="flex flex-wrap items-center gap-2">
                      <Badge tone={STATUS_TONES[message.status] ?? 'neutral'}>
                        {STATUS_LABELS[message.status] ?? message.status}
                      </Badge>
                      <span className="truncate text-[0.8125rem] font-medium text-fg">
                        {message.subject ?? '(sans objet)'}
                      </span>
                      {message.template_key && <Badge tone="outline">{message.template_key}</Badge>}
                    </span>

                    <span className="mt-0.5 block truncate text-[0.6875rem] text-fg-subtle">
                      {[
                        message.to_name ?? message.to_address,
                        message.client_name,
                        message.project_title,
                        (message.sent_at ?? message.created_at).slice(0, 16).replace('T', ' à '),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>

                    {!open && message.body && (
                      <span className="mt-0.5 block line-clamp-1 text-[0.75rem] text-fg-muted">{message.body}</span>
                    )}
                  </button>

                  <div className="flex shrink-0 items-center gap-1">
                    {locked ? (
                      <span
                        title="Un message envoyé est conservé tel quel"
                        className="p-1.5 text-fg-subtle"
                      >
                        <Lock className="size-3.5" />
                      </span>
                    ) : (
                      <>
                        {canSend && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              run(`/api/messages/${message.id}`, {
                                method: 'PATCH',
                                body: { send: true },
                                success: mailConfigured ? 'Message envoyé.' : 'Message mis en attente.',
                              })
                            }
                            aria-label="Envoyer ce message"
                            className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                          >
                            <Send className="size-3.5" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(message)}
                          aria-label="Supprimer ce message"
                          className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {message.status === 'failed' && message.error && (
                  <p className="flex items-start gap-1.5 border-t border-line bg-danger-soft px-3 py-2 text-[0.75rem] text-danger">
                    <AlertCircle className="mt-0.5 size-3 shrink-0" />
                    {message.error}
                  </p>
                )}

                {open && message.body && (
                  <p className="whitespace-pre-line border-t border-line px-3 py-2.5 text-[0.8125rem] leading-relaxed text-fg-muted">
                    {message.body}
                  </p>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          const target = confirmDelete;
          setConfirmDelete(null);
          if (!target) return;
          await run(`/api/messages/${target.id}`, { method: 'DELETE', success: 'Message supprimé.' });
        }}
        title="Supprimer ce message ?"
        message="Seuls les brouillons, les messages en attente et les échecs peuvent être supprimés. Un message envoyé reste conservé comme trace de ce que le client a reçu."
        confirmLabel="Supprimer"
        busy={busy}
      />
    </div>
  );
}
