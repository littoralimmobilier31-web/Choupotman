'use client';

import * as React from 'react';
import { LogOut, Monitor, Smartphone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/modal';
import { useAction } from './use-resource-form';

/**
 * Open sessions for the signed-in account.
 *
 * "Close the other sessions" keeps the current one, so it can be clicked from
 * the device you are holding without locking yourself out — which is exactly the
 * situation it exists for: a laptop left somewhere, a browser on a shared
 * machine.
 */

export type SessionRecord = {
  id: string;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  ip_address: string | null;
  user_agent: string | null;
  current: boolean;
};

/** A user-agent string reduced to something a person can recognise. */
function describeAgent(agent: string | null): { label: string; mobile: boolean } {
  if (!agent) return { label: 'Appareil inconnu', mobile: false };

  const mobile = /android|iphone|ipad|mobile/i.test(agent);
  const browser =
    /edg\//i.test(agent) ? 'Edge'
    : /opr\/|opera/i.test(agent) ? 'Opera'
    : /chrome|crios/i.test(agent) ? 'Chrome'
    : /firefox|fxios/i.test(agent) ? 'Firefox'
    : /safari/i.test(agent) ? 'Safari'
    : 'Navigateur';
  const system =
    /windows/i.test(agent) ? 'Windows'
    : /android/i.test(agent) ? 'Android'
    : /iphone|ipad|ios/i.test(agent) ? 'iOS'
    : /mac os/i.test(agent) ? 'macOS'
    : /linux/i.test(agent) ? 'Linux'
    : null;

  return { label: system ? `${browser} sur ${system}` : browser, mobile };
}

export function SessionList({ csrf, sessions }: { csrf: string; sessions: SessionRecord[] }) {
  const { run, busy } = useAction(csrf);
  const [confirm, setConfirm] = React.useState(false);

  const others = sessions.filter((session) => !session.current);

  return (
    <div className="space-y-3">
      <ul className="space-y-1.5">
        {sessions.map((session) => {
          const agent = describeAgent(session.user_agent);
          const Icon = agent.mobile ? Smartphone : Monitor;

          return (
            <li
              key={session.id}
              className={cn(
                'flex items-start gap-3 rounded-lg border px-3 py-2.5',
                session.current ? 'border-accent/40 bg-accent-soft/30' : 'border-line bg-surface-raised',
              )}
            >
              <Icon className="mt-0.5 size-4 shrink-0 text-fg-subtle" />

              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-[0.8125rem] font-medium text-fg">{agent.label}</span>
                  {session.current && <Badge tone="success">Session actuelle</Badge>}
                </p>
                <p className="mt-0.5 text-[0.6875rem] text-fg-subtle">
                  {session.ip_address && <span className="font-mono">{session.ip_address}</span>}
                  {session.ip_address && ' · '}
                  ouverte le {session.created_at.slice(0, 16).replace('T', ' à ')}
                  {' · '}
                  vue pour la dernière fois le {session.last_seen_at.slice(0, 16).replace('T', ' à ')}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {others.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirm(true)}>
            <LogOut className="size-3.5" />
            Fermer les {others.length} autre{others.length === 1 ? '' : 's'} session
            {others.length === 1 ? '' : 's'}
          </Button>
          <span className="text-[0.75rem] text-fg-subtle">Vous resterez connecté ici.</span>
        </div>
      )}

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={async () => {
          setConfirm(false);
          await run('/api/mon-compte', { method: 'DELETE', success: 'Autres sessions fermées.' });
        }}
        title="Fermer les autres sessions ?"
        message="Tous les autres appareils connectés à ce compte devront se reconnecter. Votre session actuelle n’est pas affectée."
        confirmLabel="Fermer les autres sessions"
        busy={busy}
      />
    </div>
  );
}
