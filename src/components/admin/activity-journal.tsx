'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Banknote, FileText, KeyRound, LogIn, LogOut, Pencil, Plus, ScrollText,
  ShieldAlert, Sparkles, Trash2, Upload, Workflow,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';

/**
 * The activity journal.
 *
 * Read-only by construction — there is no edit or delete control anywhere in
 * this component, and none in the API either. A log someone can tidy up is not
 * evidence of anything.
 *
 * A failed sign-in is drawn in red rather than shown as one grey line among
 * hundreds: a burst of them is the single most useful thing this screen can
 * surface, and it is invisible if every row looks the same.
 */

export type ActivityEntry = {
  id: number;
  actor_label: string | null;
  action: string;
  entity_type: string | null;
  entity_id: number | null;
  entity_label: string | null;
  summary: string | null;
  metadata: string | null;
  ip_address: string | null;
  created_at: string;
};

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  login: LogIn,
  logout: LogOut,
  login_failed: ShieldAlert,
  password_changed: KeyRound,
  password_reset: KeyRound,
  create: Plus,
  update: Pencil,
  delete: Trash2,
  status_change: Pencil,
  send: FileText,
  payment: Banknote,
  invoice: FileText,
  quote: FileText,
  contract: FileText,
  'ai.action': Sparkles,
  automation: Workflow,
  backup: Upload,
  restore: Upload,
  export: Upload,
};

const ACTION_LABELS: Record<string, string> = {
  login: 'Connexion',
  logout: 'Déconnexion',
  login_failed: 'Échec de connexion',
  password_changed: 'Mot de passe changé',
  password_reset: 'Mot de passe réinitialisé',
  create: 'Création',
  update: 'Modification',
  delete: 'Suppression',
  status_change: 'Changement de statut',
  send: 'Envoi',
  payment: 'Paiement',
  invoice: 'Facture',
  quote: 'Devis',
  contract: 'Contrat',
  'ai.action': 'Action IA',
  automation: 'Automatisation',
  backup: 'Sauvegarde',
  restore: 'Restauration',
  export: 'Export',
};

const ACTION_TONES: Record<string, BadgeTone> = {
  login_failed: 'danger',
  delete: 'danger',
  password_reset: 'warning',
  password_changed: 'warning',
  backup: 'info',
  export: 'info',
  'ai.action': 'brand',
  automation: 'brand',
  payment: 'success',
};

/** Where a logged entity can be opened, when there is somewhere to go. */
const ENTITY_ROUTES: Record<string, (id: number) => string> = {
  project: (id) => `/espace-admin/projets/${id}`,
  client: (id) => `/espace-admin/clients/${id}`,
  lead: (id) => `/espace-admin/prospects`,
  quote: (id) => `/espace-admin/devis/${id}`,
  invoice: (id) => `/espace-admin/factures/${id}`,
  contract: (id) => `/espace-admin/contrats/${id}`,
  portfolio: (id) => `/espace-admin/portfolio/${id}`,
  case_study: (id) => `/espace-admin/etudes-de-cas/${id}`,
  post: (id) => `/espace-admin/blog/${id}`,
  moodboard: (id) => `/espace-admin/moodboards/${id}`,
  user: () => '/espace-admin/utilisateurs',
  role: () => '/espace-admin/roles',
};

export function ActivityJournal({ entries }: { entries: ActivityEntry[] }) {
  const [expanded, setExpanded] = React.useState<number | null>(null);

  if (entries.length === 0) {
    return (
      <Card>
        <CardBody className="py-8 text-center">
          <ScrollText className="mx-auto mb-2 size-5 text-fg-subtle" />
          <p className="text-[0.875rem] font-medium text-fg">Aucune entrée</p>
          <p className="mx-auto mt-1 max-w-md text-[0.8125rem] text-fg-muted">
            Chaque action importante est enregistrée ici automatiquement : créations, modifications, paiements,
            connexions.
          </p>
        </CardBody>
      </Card>
    );
  }

  return (
    <ul className="space-y-1">
      {entries.map((entry) => {
        const Icon = ACTION_ICONS[entry.action] ?? ScrollText;
        const failed = entry.action === 'login_failed';
        const route =
          entry.entity_type && entry.entity_id
            ? ENTITY_ROUTES[entry.entity_type]?.(entry.entity_id)
            : undefined;
        const open = expanded === entry.id;

        return (
          <li
            key={entry.id}
            className={cn(
              'rounded-lg border px-3 py-2',
              failed ? 'border-danger/40 bg-danger-soft/30' : 'border-line bg-surface-raised',
            )}
          >
            <div className="flex items-start gap-2.5">
              <Icon className={cn('mt-0.5 size-3.5 shrink-0', failed ? 'text-danger' : 'text-fg-subtle')} />

              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <Badge tone={ACTION_TONES[entry.action] ?? 'neutral'}>
                    {ACTION_LABELS[entry.action] ?? entry.action}
                  </Badge>
                  <span className={cn('text-[0.8125rem]', failed ? 'font-medium text-danger' : 'text-fg')}>
                    {entry.summary ?? entry.entity_label ?? '—'}
                  </span>
                </p>

                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[0.6875rem] text-fg-subtle">
                  <span>{entry.created_at.slice(0, 19).replace('T', ' à ')}</span>
                  <span>·</span>
                  <span>{entry.actor_label ?? 'système'}</span>
                  {entry.ip_address && (
                    <>
                      <span>·</span>
                      <span className="font-mono">{entry.ip_address}</span>
                    </>
                  )}
                  {route && (
                    <>
                      <span>·</span>
                      <Link href={route} className="text-accent underline-offset-2 hover:underline">
                        Ouvrir la fiche
                      </Link>
                    </>
                  )}
                  {entry.metadata && (
                    <>
                      <span>·</span>
                      <button
                        type="button"
                        onClick={() => setExpanded(open ? null : entry.id)}
                        className="underline decoration-dotted underline-offset-2 transition-colors hover:text-fg"
                        aria-expanded={open}
                      >
                        {open ? 'Masquer le détail' : 'Voir le détail'}
                      </button>
                    </>
                  )}
                </p>
              </div>
            </div>

            {open && entry.metadata && (
              <pre className="mt-2 overflow-x-auto rounded-lg bg-surface-sunken p-2.5 font-mono text-[0.6875rem] leading-relaxed text-fg-muted">
                {formatMetadata(entry.metadata)}
              </pre>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Pretty-prints the stored JSON, falling back to the raw text if it is not JSON. */
function formatMetadata(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}
