#!/usr/bin/env tsx
/**
 * Runs the daily automation sweep from the command line.
 *
 *   npm run daily
 *   npm run daily -- --force
 *
 * This is what a scheduled job should call. Going through the HTTP route instead
 * would need a session and a CSRF token — a scheduler has neither, and giving one
 * a long-lived credential just to call a cron job is the wrong trade. Calling the
 * engine directly keeps the schedule out of the authentication surface entirely.
 *
 *   0 7 * * *  cd /srv/choupotman && /usr/bin/npm run daily >> data/automation.log 2>&1
 *
 * Safe to run more than once a day: every notification the sweep can create
 * carries a dedupe key derived from the underlying fact plus the date, so a
 * second pass inserts nothing. Without `--force` it also short-circuits when it
 * has already completed today.
 */
import { runDaily } from '../src/lib/automation/engine';
import { closeDb } from '../src/lib/db/client';

function main(): void {
  const force = process.argv.includes('--force');
  const startedAt = Date.now();

  try {
    const report = runDaily({ force });

    if (report.outcomes.length === 0) {
      console.log(`· ${new Date().toISOString()} — déjà exécuté aujourd’hui, rien à faire.`);
      console.log('  Utilisez --force pour relancer malgré tout.');
      return;
    }

    console.log(`· ${report.ranAt} — ${report.outcomes.length} règle(s) évaluée(s)`);

    for (const outcome of report.outcomes) {
      const mark = outcome.status === 'failed' ? '✗' : outcome.status === 'success' ? '✓' : '–';
      const detail = outcome.error ?? outcome.actions.join(' · ') ?? '';
      console.log(`  ${mark} ${outcome.automation}${detail ? ` — ${detail}` : ''}`);
    }

    console.log(
      `  ${report.totalActions} action(s) au total en ${Math.round((Date.now() - startedAt) / 1000)} s`,
    );

    // A failed rule should surface in the scheduler's own failure reporting
    // rather than being buried in a log nobody reads.
    if (report.outcomes.some((outcome) => outcome.status === 'failed')) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error('✗ Le balayage quotidien a échoué.');
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  } finally {
    closeDb();
  }
}

main();
