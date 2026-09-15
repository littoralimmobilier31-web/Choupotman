#!/usr/bin/env tsx
/**
 * Removes the fixtures the end-to-end suites create.
 *
 *   npm run test:clean
 *   npm run test:clean -- --dry
 *
 * This goes straight to SQL, on purpose. The suites themselves clean up through
 * the API, which is right — it exercises the same path a person would use — but
 * the API deliberately *refuses* to delete some of what the tests produce:
 *
 *   - an issued invoice is cancelled, never deleted;
 *   - a sent message is kept, because the outbox has to say what the client
 *     actually received;
 *   - a signed contract is cancelled rather than erased.
 *
 * Those refusals are the guarantees the suites verify, so the suites cannot undo
 * them without contradicting themselves. Left alone, the rows accumulate run
 * after run and eventually show up in a demonstration. A fixture cleaner that
 * bypasses the rules is the honest tool for that, and it lives under
 * `scripts/test/` so it is never mistaken for an application feature.
 *
 * Only rows labelled `TEST ` — the word, then a space — are touched. That
 * trailing space matters: `LIKE 'TEST%'` also matches the seed's legitimate
 * "Testing" production stage, and deleting those would quietly damage the
 * demonstration data this is meant to leave alone. Demonstration rows
 * (`is_demo`) are never touched; use `npm run db:reset -- --demo` for those.
 */
import { all, run, closeDb, transaction } from '../../src/lib/db/client';

/**
 * The label every suite uses for its fixtures. The space after TEST is load
 * bearing — see the note above.
 */
const PATTERN = 'TEST %';

/** Accounts are named without the space, so they carry their own pattern. */
const USER_PATTERN = 'test\\_%';

/** table → the column carrying the human label. */
const FIXTURES: [table: string, column: string][] = [
  ['payments', 'reference'],
  ['invoices', 'title'],
  ['quotes', 'title'],
  ['contracts', 'title'],
  ['contract_templates', 'name'],
  ['expenses', 'label'],
  ['subscriptions', 'service_name'],
  ['tasks', 'title'],
  ['project_stages', 'name'],
  ['revisions', 'title'],
  ['projects', 'title'],
  ['clients', 'name'],
  ['leads', 'name'],
  ['portfolio_projects', 'title'],
  ['case_studies', 'title'],
  ['blog_posts', 'title'],
  ['services', 'name'],
  ['testimonials', 'author_name'],
  ['faqs', 'question'],
  ['profile_entries', 'title'],
  ['moodboards', 'title'],
  ['calendar_events', 'title'],
  ['messages', 'subject'],
  ['message_templates', 'name'],
  ['folder_templates', 'name'],
  ['file_folders', 'name'],
  ['files', 'original_name'],
  ['briefs', 'title'],
  ['users', 'username'],
  ['roles', 'name'],
];

function main(): void {
  const dry = process.argv.includes('--dry');
  let total = 0;

  // One transaction: a half-cleaned database is worse than an uncleaned one,
  // because the next run then fails on whichever half survived.
  transaction(() => {
    for (const [table, column] of FIXTURES) {
      // `users` names its fixtures without the space, so it matches differently.
      const clause =
        table === 'users' ? `${column} LIKE ? ESCAPE '\\'` : `${column} LIKE ?`;
      const pattern = table === 'users' ? USER_PATTERN : PATTERN;

      let rows: { id: number; label: string }[];
      try {
        rows = all<{ id: number; label: string }>(
          `SELECT id, ${column} AS label FROM ${table} WHERE ${clause}`,
          [pattern],
        );
      } catch {
        // A table that does not exist in this schema version is simply skipped.
        continue;
      }

      if (rows.length === 0) continue;
      total += rows.length;

      console.log(`${table} — ${rows.length} ligne(s)`);
      for (const row of rows.slice(0, 5)) console.log(`    #${row.id} ${row.label}`);
      if (rows.length > 5) console.log(`    … et ${rows.length - 5} de plus`);

      if (!dry) run(`DELETE FROM ${table} WHERE ${clause}`, [pattern]);
    }

    if (!dry) {
      // The search index is denormalised, so orphans survive a cascade.
      run(
        `DELETE FROM search_index
         WHERE title LIKE ? OR subtitle LIKE ? OR body LIKE ?`,
        [PATTERN, PATTERN, PATTERN],
      );
      // Capture tokens and moodboard items belong to boards that are gone.
      run('DELETE FROM moodboard_items WHERE moodboard_id NOT IN (SELECT id FROM moodboards)');
      run(
        'DELETE FROM moodboard_capture_tokens WHERE moodboard_id NOT IN (SELECT id FROM moodboards)',
      );
      // Journal entries about fixtures are noise in a demonstration.
      run('DELETE FROM activity_logs WHERE entity_label LIKE ? OR summary LIKE ?', [PATTERN, '%TEST — %']);
    }
  });

  if (total === 0) {
    console.log('Aucune donnée de test à supprimer.');
    return;
  }

  console.log(
    dry
      ? `\n${total} ligne(s) seraient supprimées. Relancez sans --dry pour le faire.`
      : `\n${total} ligne(s) de test supprimées.`,
  );
}

try {
  main();
} finally {
  closeDb();
}
