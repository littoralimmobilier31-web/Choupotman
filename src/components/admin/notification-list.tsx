'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  AlertTriangle, Banknote, Bell, CalendarClock, CheckCheck, FileText, Inbox,
  MessageSquareQuote, RefreshCw, Trash2, Users, X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, buttonClass } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { useAction } from './use-resource-form';

/**
 * Notification list.
 *
 * Read state is per notification and marking all read is one request, because the
 * realistic action after a few days away is "I have seen these" rather than
 * dismissing twenty items one at a time.
 */

export type NotificationRecord = {
  id: number;
  kind: string;
  title: string;
  body: string | null;
  url: string | null;
  severity: string;
  read_at: string | null;
  created_at: string;
};

const KIND_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  task: CheckCheck,
  deadline: CalendarClock,
  payment_received: Banknote,
  payment_overdue: AlertTriangle,
  feedback: MessageSquareQuote,
  revision: RefreshCw,
  client: Users,
  message: Inbox,
  form: Inbox,
  project: FileText,
  subscription: RefreshCw,
  system: Bell,
};

const SEVERITY_STYLES: Record<string, string> = {
  info: 'text-info',
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
};

/** "il y a 3 h" — a relative time is easier to judge than a timestamp here. */
function relativeTime(iso: string): string {
  const then = Date.parse(iso.endsWith('Z') || iso.includes('+') ? iso : `${iso}Z`);
  if (Number.isNaN(then)) return iso.slice(0, 10);

  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return 'à l’instant';
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  if (days < 31) return `il y a ${days} j`;
  return iso.slice(0, 10);
}

export function NotificationList({
  csrf,
  notifications,
  unreadOnly,
  unreadCount,
  canUpdate,
}: {
  csrf: string;
  notifications: NotificationRecord[];
  unreadOnly: boolean;
  unreadCount: number;
  canUpdate: boolean;
}) {
  const { run, busy } = useAction(csrf);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Link
            href="/espace-admin/notifications"
            className={buttonClass(unreadOnly ? 'ghost' : 'secondary', 'sm')}
          >
            Toutes
          </Link>
          <Link
            href="/espace-admin/notifications?nonlues=1"
            className={buttonClass(unreadOnly ? 'secondary' : 'ghost', 'sm')}
          >
            Non lues{unreadCount > 0 && ` (${unreadCount})`}
          </Link>
        </div>

        {canUpdate && (
          <div className="flex items-center gap-2">
            {unreadCount > 0 && (
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => run('/api/notifications/tout-lu', { success: 'Tout marqué comme lu.' })}
              >
                <CheckCheck className="size-3.5" />
                Tout marquer comme lu
              </Button>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run('/api/notifications?anciennes=1', {
                  method: 'DELETE',
                  success: 'Anciennes notifications effacées.',
                })
              }
              className="text-[0.75rem] text-fg-subtle underline decoration-dotted underline-offset-2 transition-colors hover:text-fg"
            >
              Effacer les notifications lues de plus de 3 mois
            </button>
          </div>
        )}
      </div>

      {notifications.length === 0 ? (
        <Card>
          <CardBody className="py-8 text-center">
            <Bell className="mx-auto mb-2 size-5 text-fg-subtle" />
            <p className="text-[0.875rem] font-medium text-fg">
              {unreadOnly ? 'Aucune notification non lue' : 'Aucune notification'}
            </p>
            <p className="mx-auto mt-1 max-w-md text-[0.8125rem] text-fg-muted">
              Les retours clients, les paiements reçus et les échéances qui approchent apparaîtront ici.
            </p>
          </CardBody>
        </Card>
      ) : (
        <ul className="space-y-1.5">
          {notifications.map((notification) => {
            const Icon = KIND_ICONS[notification.kind] ?? Bell;
            const unread = notification.read_at === null;

            return (
              <li
                key={notification.id}
                className={cn(
                  'flex items-start gap-3 rounded-lg border px-3 py-2.5',
                  unread ? 'border-accent/30 bg-accent-soft/30' : 'border-line bg-surface-raised',
                )}
              >
                <Icon
                  className={cn('mt-0.5 size-4 shrink-0', SEVERITY_STYLES[notification.severity] ?? 'text-fg-subtle')}
                />

                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2">
                    {unread && <span className="size-1.5 shrink-0 rounded-full bg-accent" aria-label="Non lue" />}
                    <span className={cn('truncate text-[0.8125rem]', unread ? 'font-semibold text-fg' : 'text-fg')}>
                      {notification.title}
                    </span>
                  </p>
                  {notification.body && (
                    <p className="mt-0.5 text-[0.75rem] leading-relaxed text-fg-muted">{notification.body}</p>
                  )}
                  <p className="mt-0.5 flex items-center gap-2 text-[0.6875rem] text-fg-subtle">
                    {relativeTime(notification.created_at)}
                    {notification.url && (
                      <Link href={notification.url} className="text-accent underline-offset-2 hover:underline">
                        Ouvrir
                      </Link>
                    )}
                  </p>
                </div>

                {canUpdate && (
                  <div className="flex shrink-0 items-center gap-1">
                    {unread && (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          run('/api/notifications/tout-lu', { body: { id: notification.id }, success: 'Marquée comme lue.' })
                        }
                        aria-label="Marquer comme lue"
                        className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
                      >
                        <X className="size-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        run(`/api/notifications?id=${notification.id}`, {
                          method: 'DELETE',
                          success: 'Notification effacée.',
                        })
                      }
                      aria-label="Effacer cette notification"
                      className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
