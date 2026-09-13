/**
 * Database reset utilities.
 *
 *   npm run db:reset -- --demo    remove demonstration rows only (safe)
 *   npm run db:reset -- --all     delete the database file and rebuild it
 *
 * `--all` is destructive and refuses to run when APP_ENV=production.
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local', quiet: true });
loadEnv({ quiet: true });

import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { closeDb, getDb, migrate } from '../src/lib/db/client';
import { purgeDemo, runSeed } from '../src/lib/db/seed';
import { config } from '../src/lib/config';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const demoOnly = args.includes('--demo');
  const all = args.includes('--all');

  if (!demoOnly && !all) {
    console.log('Usage:');
    console.log('  npm run db:reset -- --demo   Remove demonstration data only');
    console.log('  npm run db:reset -- --all    Delete and rebuild the database');
    return;
  }

  if (demoOnly) {
    console.log('▸ Removing demonstration data…');
    const removed = purgeDemo();
    const total = Object.values(removed).reduce((a, b) => a + b, 0);
    for (const [table, count] of Object.entries(removed)) {
      if (count > 0) console.log(`    ${table}: ${count}`);
    }
    console.log(`  ${total} row(s) removed. Real data untouched.`);
    closeDb();
    return;
  }

  if (config.isProd) {
    console.error('✖ Refusing to wipe the database while APP_ENV=production.');
    process.exitCode = 1;
    return;
  }

  const dbPath = resolve(process.cwd(), config.db.path);
  console.log(`▸ Deleting ${dbPath} …`);
  closeDb();
  for (const suffix of ['', '-wal', '-shm']) {
    const file = `${dbPath}${suffix}`;
    if (existsSync(file)) rmSync(file);
  }

  console.log('▸ Rebuilding…');
  migrate(getDb(), { verbose: true });
  const report = await runSeed({ demo: true });
  console.log(`  Database rebuilt. Admin: ${report.adminUsername}. Index: ${report.indexed} entries.`);
  closeDb();
}

main().catch((error) => {
  console.error('✖ Reset failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
  closeDb();
});
