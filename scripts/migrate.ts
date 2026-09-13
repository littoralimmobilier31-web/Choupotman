/**
 * Applies pending SQL migrations.
 *
 *   npm run db:migrate
 *
 * Safe to run repeatedly: already-applied files are skipped.
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local', quiet: true });
loadEnv({ quiet: true });

import { getDb, migrate } from '../src/lib/db/client';

function main(): void {
  console.log('▸ CHOUPOTMAN OS — database migration');
  const db = getDb();
  const { applied, skipped } = migrate(db, { verbose: true });

  if (applied.length === 0) {
    console.log(`  Nothing to do — ${skipped.length} migration(s) already applied.`);
  } else {
    console.log(`  Applied ${applied.length} migration(s), skipped ${skipped.length}.`);
  }

  const tables = db
    .prepare(
      `SELECT name FROM sqlite_master
       WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_migrations'
       ORDER BY name`,
    )
    .all() as { name: string }[];

  console.log(`  ${tables.length} tables present.`);
  db.close();
}

main();
