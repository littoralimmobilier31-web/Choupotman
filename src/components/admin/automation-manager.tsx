'use client';

import * as React from 'react';
import { AlertCircle, ArrowRight, CheckCircle2, Clock, MinusCircle, Play, Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Switch } from '@/components/ui/field';
import { useAction } from './use-resource-form';

/**
 * The automation rules.
 *
 * Each rule is rendered as the sentence it is — "SI un projet est créé, ALORS …"
 * — because a list of rule names tells you nothing about what the application
 * will do behind your back. Seeing the consequences is what makes the switch a
 * real decision.
 *
 * The rules themselves come from the code, not from a table anyone can add to:
 * every rule has a handler behind it, and a row without one would be a promise
 * the application cannot keep.
 */

export type AutomationRecord = {
  id: number;
  key: string;
  name: string;
  description: string | null;
  trigger_type: string;
  trigger_key: string | null;
  is_enabled: 0 | 1;
  last_run_at: string | null;
  run_count: number;
  condition: string;
  effects: string[];
};

export type RunRecord = {
  id: number;
  automation_key: string;
  trigger_key: string | null;
  status: string;
  actions_count: number;
  summary: string | null;
  error: string | null;
  duration_ms: number | null;
  created_at: string;
};

const STATUS_TONES: Record<string, BadgeTone> = {
  success: 'success',
  skipped: 'neutral',
  failed: 'danger',
};

const STATUS_LABELS: Record<string, string> = {
  success: 'Exécutée',
  skipped: 'Rien à faire',
  failed: 'Échec',
};

export function AutomationManager({
  csrf,
  automations,
  runs,
  lastDailyRun,
  canUpdate,
}: {
  csrf: string;
  automations: AutomationRecord[];
  runs: RunRecord[];
  lastDailyRun: string | null;
  canUpdate: boolean;
}) {
  const { run, busy } = useAction(csrf);

  const scheduled = automations.filter((rule) => rule.trigger_type === 'schedule');
  const evented = automations.filter((rule) => rule.trigger_type !== 'schedule');

  const ranToday = lastDailyRun !== null && lastDailyRun.slice(0, 10) === new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <CardTitle>Balayage quotidien</CardTitle>
              <CardDescription>
                Une passe par jour sur les échéances, les relances et les renouvellements. Elle est sans danger à
                relancer : chaque notification porte une empreinte qui évite les doublons du même jour.
              </CardDescription>
            </div>
            {canUpdate && (
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() =>
                  run('/api/automatisations', {
                    body: { action: 'run_daily', force: true },
                    success: 'Balayage terminé.',
                  })
                }
              >
                <Play className="size-3.5" />
                Lancer maintenant
              </Button>
            )}
          </div>
        </CardHeader>
        <CardBody>
          <p className="text-[0.8125rem] text-fg-muted">
            <Clock className="me-1.5 inline size-3.5 text-fg-subtle" />
            {lastDailyRun
              ? `Dernier passage : ${lastDailyRun.slice(0, 16).replace('T', ' à ')}${ranToday ? ' (aujourd’hui)' : ''}`
              : 'Jamais lancé. En production, une tâche planifiée appelle ce balayage une fois par jour — voir docs/DEPLOYMENT.md.'}
          </p>
        </CardBody>
      </Card>

      {scheduled.length > 0 && (
        <section>
          <h2 className="mb-3 text-[0.9375rem] font-semibold text-fg">Règles quotidiennes</h2>
          <ul className="space-y-2.5">
            {scheduled.map((rule) => (
              <RuleCard key={rule.key} csrf={csrf} rule={rule} canUpdate={canUpdate} />
            ))}
          </ul>
        </section>
      )}

      {evented.length > 0 && (
        <section>
          <h2 className="mb-3 text-[0.9375rem] font-semibold text-fg">Règles déclenchées par un événement</h2>
          <ul className="space-y-2.5">
            {evented.map((rule) => (
              <RuleCard key={rule.key} csrf={csrf} rule={rule} canUpdate={canUpdate} />
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-[0.9375rem] font-semibold text-fg">Journal des exécutions</h2>
            <p className="mt-0.5 text-[0.75rem] text-fg-muted">
              Ce que les règles ont réellement fait, et quand.
            </p>
          </div>
          {canUpdate && runs.length > 0 && (
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                run('/api/automatisations', {
                  body: { action: 'prune_runs' },
                  success: 'Anciennes exécutions effacées.',
                })
              }
              className="text-[0.75rem] text-fg-subtle underline decoration-dotted underline-offset-2 transition-colors hover:text-fg"
            >
              Effacer les exécutions de plus de 3 mois
            </button>
          )}
        </div>

        {runs.length === 0 ? (
          <Card>
            <CardBody className="py-6 text-center">
              <Workflow className="mx-auto mb-2 size-5 text-fg-subtle" />
              <p className="text-[0.8125rem] text-fg-muted">
                Aucune exécution enregistrée. Les règles se déclencheront au fil de votre activité.
              </p>
            </CardBody>
          </Card>
        ) : (
          <ul className="space-y-1.5">
            {runs.map((entry) => {
              const rule = automations.find((candidate) => candidate.key === entry.automation_key);
              return (
                <li
                  key={entry.id}
                  className={cn(
                    'flex items-start gap-2.5 rounded-lg border border-line bg-surface-raised px-3 py-2',
                    entry.status === 'failed' && 'border-danger/40',
                  )}
                >
                  {entry.status === 'success' ? (
                    <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-success" />
                  ) : entry.status === 'failed' ? (
                    <AlertCircle className="mt-0.5 size-3.5 shrink-0 text-danger" />
                  ) : (
                    <MinusCircle className="mt-0.5 size-3.5 shrink-0 text-fg-subtle" />
                  )}

                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="text-[0.8125rem] font-medium text-fg">
                        {rule?.name ?? entry.automation_key}
                      </span>
                      <Badge tone={STATUS_TONES[entry.status] ?? 'neutral'}>
                        {STATUS_LABELS[entry.status] ?? entry.status}
                      </Badge>
                      {entry.actions_count > 0 && (
                        <span className="text-[0.6875rem] text-fg-subtle">
                          {entry.actions_count} action{entry.actions_count === 1 ? '' : 's'}
                        </span>
                      )}
                    </p>
                    {entry.summary && (
                      <p className="mt-0.5 text-[0.75rem] leading-relaxed text-fg-muted">{entry.summary}</p>
                    )}
                    {entry.error && <p className="mt-0.5 text-[0.75rem] text-danger">{entry.error}</p>}
                    <p className="mt-0.5 text-[0.625rem] text-fg-subtle">
                      {entry.created_at.slice(0, 16).replace('T', ' à ')}
                      {entry.duration_ms !== null && ` · ${entry.duration_ms} ms`}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function RuleCard({
  csrf,
  rule,
  canUpdate,
}: {
  csrf: string;
  rule: AutomationRecord;
  canUpdate: boolean;
}) {
  const { run, busy } = useAction(csrf);

  return (
    <li
      className={cn(
        'rounded-[var(--radius-card)] border border-line bg-surface-raised p-3.5',
        rule.is_enabled === 0 && 'opacity-60',
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[0.875rem] font-semibold text-fg">{rule.name}</p>
          {rule.description && (
            <p className="mt-0.5 text-[0.75rem] leading-relaxed text-fg-muted">{rule.description}</p>
          )}
        </div>

        {canUpdate && (
          <Switch
            checked={rule.is_enabled === 1}
            onChange={(next) =>
              run('/api/automatisations', {
                body: { key: rule.key, enabled: next },
                success: next ? 'Règle activée.' : 'Règle désactivée.',
              })
            }
            label={rule.is_enabled === 1 ? 'Active' : 'Inactive'}
          />
        )}
      </div>

      {/* The rule as a sentence: the condition, then what follows from it. */}
      <div className="mt-3 rounded-lg bg-surface-sunken px-3 py-2.5">
        <p className="text-[0.75rem] font-medium uppercase tracking-wider text-fg-subtle">Si</p>
        <p className="mt-0.5 text-[0.8125rem] text-fg">{rule.condition}</p>

        {rule.effects.length > 0 && (
          <>
            <p className="mt-2 text-[0.75rem] font-medium uppercase tracking-wider text-fg-subtle">Alors</p>
            <ul className="mt-0.5 space-y-0.5">
              {rule.effects.map((effect, index) => (
                <li key={index} className="flex items-start gap-1.5 text-[0.8125rem] text-fg">
                  <ArrowRight className="mt-0.5 size-3 shrink-0 text-accent rtl:-scale-x-100" />
                  {effect}
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <p className="mt-2 text-[0.625rem] text-fg-subtle">
        {rule.run_count > 0
          ? `${rule.run_count} exécution${rule.run_count === 1 ? '' : 's'}${
              rule.last_run_at ? ` · dernière le ${rule.last_run_at.slice(0, 10)}` : ''
            }`
          : 'Jamais déclenchée'}
        {busy && ' · enregistrement…'}
      </p>
    </li>
  );
}
