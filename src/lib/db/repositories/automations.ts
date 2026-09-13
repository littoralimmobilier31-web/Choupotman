import { all, one, run, scalar } from '../client';
import type { AutomationRow, AutomationRunRow } from '../types';
import { safeJson, toJson } from '@/lib/utils';

/** Storage for the automation engine's rule definitions and run history. */

export function listAutomations(): AutomationRow[] {
  return all<AutomationRow>('SELECT * FROM automations ORDER BY trigger_type, key');
}

export function findAutomation(key: string): AutomationRow | null {
  return one<AutomationRow>('SELECT * FROM automations WHERE key = ?', [key]);
}

export function findAutomationById(id: number): AutomationRow | null {
  return one<AutomationRow>('SELECT * FROM automations WHERE id = ?', [id]);
}

/** Enabled rules bound to a trigger key (an event name, or "daily"). */
export function automationsFor(triggerKey: string): AutomationRow[] {
  return all<AutomationRow>(
    'SELECT * FROM automations WHERE trigger_key = ? AND is_enabled = 1 ORDER BY key',
    [triggerKey],
  );
}

export function isAutomationEnabled(key: string): boolean {
  return scalar<number>('SELECT is_enabled AS e FROM automations WHERE key = ?', [key], 0) === 1;
}

export function automationConfig<T>(key: string, fallback: T): T {
  const row = findAutomation(key);
  return safeJson<T>(row?.config, fallback);
}

/** Idempotent registration — the seed re-runs this on every deploy. */
export function registerAutomation(input: {
  key: string;
  name: string;
  description?: string | null;
  triggerType: AutomationRow['trigger_type'];
  triggerKey: string;
  config?: unknown;
  enabled?: boolean;
  isSystem?: boolean;
}): number {
  run(
    `INSERT INTO automations (key, name, description, trigger_type, trigger_key, config, is_enabled, is_system)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       name = excluded.name,
       description = excluded.description,
       trigger_type = excluded.trigger_type,
       trigger_key = excluded.trigger_key,
       -- A config the user has tuned is preserved; only a missing one is seeded.
       config = COALESCE(automations.config, excluded.config),
       updated_at = datetime('now')`,
    [
      input.key, input.name, input.description ?? null, input.triggerType, input.triggerKey,
      input.config === undefined ? null : toJson(input.config),
      input.enabled === false ? 0 : 1, input.isSystem === false ? 0 : 1,
    ],
  );
  return one<{ id: number }>('SELECT id FROM automations WHERE key = ?', [input.key])?.id ?? 0;
}

export function setAutomationEnabled(key: string, enabled: boolean): void {
  run(
    `UPDATE automations SET is_enabled = ?, updated_at = datetime('now') WHERE key = ?`,
    [enabled ? 1 : 0, key],
  );
}

export function setAutomationConfig(key: string, config: unknown): void {
  run(
    `UPDATE automations SET config = ?, updated_at = datetime('now') WHERE key = ?`,
    [toJson(config), key],
  );
}

export function markAutomationRan(key: string): void {
  run(
    `UPDATE automations SET last_run_at = datetime('now'), run_count = run_count + 1 WHERE key = ?`,
    [key],
  );
}

// ── Run history ──────────────────────────────────────────────────────────

export function recordRun(input: {
  automationKey: string;
  triggerKey?: string | null;
  status?: AutomationRunRow['status'];
  actionsCount?: number;
  summary?: string | null;
  error?: string | null;
  payload?: unknown;
  durationMs?: number | null;
}): number {
  const automation = findAutomation(input.automationKey);
  const result = run(
    `INSERT INTO automation_runs
      (automation_id, automation_key, trigger_key, status, actions_count, summary, error, payload, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      automation?.id ?? null, input.automationKey, input.triggerKey ?? null,
      input.status ?? 'success', input.actionsCount ?? 0, input.summary ?? null,
      input.error ? input.error.slice(0, 800) : null,
      input.payload === undefined ? null : toJson(input.payload),
      input.durationMs ?? null,
    ],
  );
  markAutomationRan(input.automationKey);
  return Number(result.lastInsertRowid);
}

export function listRuns(filter: { automationKey?: string; status?: string; limit?: number } = {}): AutomationRunRow[] {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filter.automationKey) { where.push('automation_key = ?'); params.push(filter.automationKey); }
  if (filter.status) { where.push('status = ?'); params.push(filter.status); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  params.push(filter.limit ?? 50);
  return all<AutomationRunRow>(
    `SELECT * FROM automation_runs ${clause} ORDER BY created_at DESC, id DESC LIMIT ?`,
    params,
  );
}

export type AutomationStats = {
  total: number;
  enabled: number;
  runsToday: number;
  failuresLast7Days: number;
  actionsLast30Days: number;
};

export function getAutomationStats(): AutomationStats {
  return {
    total: scalar<number>('SELECT COUNT(*) AS c FROM automations', [], 0),
    enabled: scalar<number>('SELECT COUNT(*) AS c FROM automations WHERE is_enabled = 1', [], 0),
    runsToday: scalar<number>(
      `SELECT COUNT(*) AS c FROM automation_runs WHERE date(created_at) = date('now')`, [], 0,
    ),
    failuresLast7Days: scalar<number>(
      `SELECT COUNT(*) AS c FROM automation_runs
       WHERE status = 'failed' AND created_at > datetime('now', '-7 days')`,
      [], 0,
    ),
    actionsLast30Days: scalar<number>(
      `SELECT COALESCE(SUM(actions_count), 0) AS s FROM automation_runs
       WHERE created_at > datetime('now', '-30 days')`,
      [], 0,
    ),
  };
}

/** When the daily sweep last completed — guards against double-running. */
export function lastDailyRun(): string | null {
  return scalar<string | null>(
    `SELECT MAX(created_at) AS t FROM automation_runs WHERE trigger_key = 'daily' AND status != 'failed'`,
    [], null,
  );
}

export function hasRunToday(triggerKey: string): boolean {
  return scalar<number>(
    `SELECT COUNT(*) AS c FROM automation_runs
     WHERE trigger_key = ? AND date(created_at) = date('now') AND status != 'failed'`,
    [triggerKey], 0,
  ) > 0;
}

export function pruneRuns(olderThanDays = 90): number {
  return run(`DELETE FROM automation_runs WHERE created_at < datetime('now', ?)`, [`-${olderThanDays} days`]).changes;
}
