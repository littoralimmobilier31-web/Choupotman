import { z } from 'zod';
import { createHandler, ok, badRequest } from '@/lib/api/handler';
import { automationToggleSchema, automationConfigSchema } from '@/lib/validation/admin';
import {
  findAutomation,
  getAutomationStats,
  lastDailyRun,
  listAutomations,
  listRuns,
  pruneRuns,
  setAutomationConfig,
  setAutomationEnabled,
} from '@/lib/db/repositories/automations';
import { describeAutomation, runDaily } from '@/lib/automation/engine';
import { findAutomationDefinition } from '@/lib/automation/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The automation engine's control surface.
 *
 * Every rule reads as "SI … ALORS …" and can be switched off. Nothing here can
 * invent a rule: the catalogue comes from the code, because a rule is a piece of
 * behaviour with a handler behind it, and a row in a table with no handler would
 * be a promise the application cannot keep.
 */
export const GET = createHandler({ permission: 'automations.view' }, async ({ request }) => {
  const url = new URL(request.url);

  return Response.json({
    ok: true,
    items: listAutomations().map((automation) => {
      const description = describeAutomation(automation.key);
      const definition = findAutomationDefinition(automation.key);
      return {
        id: automation.id,
        key: automation.key,
        name: automation.name,
        description: automation.description,
        trigger_type: automation.trigger_type,
        trigger_key: automation.trigger_key,
        is_enabled: automation.is_enabled,
        last_run_at: automation.last_run_at,
        run_count: automation.run_count,
        config: automation.config,
        condition: description?.condition ?? automation.trigger_key,
        effects: description?.effects ?? [],
        defaultConfig: definition?.defaultConfig ?? null,
      };
    }),
    runs: listRuns({
      automationKey: url.searchParams.get('regle') ?? undefined,
      status: url.searchParams.get('statut') ?? undefined,
      limit: 60,
    }),
    stats: getAutomationStats(),
    lastDailyRun: lastDailyRun(),
  });
});

const actionSchema = z.union([
  automationToggleSchema,
  automationConfigSchema,
  z.object({ csrf: z.string().optional(), action: z.literal('run_daily'), force: z.boolean().optional() }),
  z.object({ csrf: z.string().optional(), action: z.literal('prune_runs') }),
]);

export const POST = createHandler(
  { permission: 'automations.update', schema: actionSchema },
  async ({ body, log }) => {
    if ('action' in body && body.action === 'run_daily') {
      /**
       * Running the daily sweep by hand is safe: every notification it can
       * create carries a dedupe key derived from the fact plus the day, so a
       * second run the same day inserts nothing. `force` only bypasses the
       * "already ran today" short-circuit.
       */
      const report = runDaily({ force: body.force === true });

      log({
        action: 'automation',
        entityType: 'automation',
        summary:
          report.totalActions === 0
            ? 'Balayage quotidien lancé manuellement — rien à signaler'
            : `Balayage quotidien lancé manuellement — ${report.totalActions} action${report.totalActions === 1 ? '' : 's'}`,
        metadata: { outcomes: report.outcomes.length, forced: body.force === true },
      });

      return ok({ report });
    }

    if ('action' in body && body.action === 'prune_runs') {
      const removed = pruneRuns(90);
      return ok({ pruned: removed });
    }

    if ('enabled' in body) {
      const automation = findAutomation(body.key);
      if (!automation) return badRequest('Règle introuvable.');

      setAutomationEnabled(body.key, body.enabled);
      log({
        action: 'automation',
        entityType: 'automation',
        entityId: automation.id,
        entityLabel: automation.name,
        summary: `${body.enabled ? 'Automatisation activée' : 'Automatisation désactivée'} : ${automation.name}`,
      });

      return ok({ key: body.key, enabled: body.enabled });
    }

    // Remaining shape: a configuration change.
    const automation = findAutomation(body.key);
    if (!automation) return badRequest('Règle introuvable.');

    setAutomationConfig(body.key, body.config);
    log({
      action: 'automation',
      entityType: 'automation',
      entityId: automation.id,
      entityLabel: automation.name,
      summary: `Réglages modifiés : ${automation.name}`,
      metadata: body.config,
    });

    return ok({ key: body.key, config: body.config });
  },
);
