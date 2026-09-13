/**
 * Seeds the database.
 *
 *   npm run db:seed              # core + demo data
 *   npm run db:seed -- --no-demo # core only (production)
 *
 * Idempotent: re-running never duplicates rows and never overwrites a setting
 * the owner has edited.
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local', quiet: true });
loadEnv({ quiet: true });

import { closeDb } from '../src/lib/db/client';
import { runSeed } from '../src/lib/db/seed';

async function main(): Promise<void> {
  const withDemo = !process.argv.includes('--no-demo');

  console.log('▸ CHOUPOTMAN OS — seed');
  console.log(`  Demo data: ${withDemo ? 'yes' : 'no'}`);

  const report = await runSeed({ demo: withDemo });

  console.log('\n  Core');
  console.log(`    roles & permissions : synced`);
  console.log(`    admin account       : ${report.adminCreated ? `created (${report.adminUsername})` : `already present (${report.adminUsername})`}`);
  console.log(`    settings            : ${report.settings} new`);
  console.log(`    categories          : ${report.categories}`);
  console.log(`    technologies        : ${report.technologies}`);
  console.log(`    services            : ${report.services} new`);
  console.log(`    templates           : ${report.templates}`);
  console.log(`    automations         : ${report.automations}`);

  if (report.demo) {
    const d = report.demo;
    if (d.clients === 0) {
      console.log('\n  Demo: already present, skipped.');
    } else {
      console.log('\n  Demo data (all rows flagged is_demo = 1)');
      console.log(`    clients ${d.clients} · projects ${d.projects} · stages ${d.stages} · tasks ${d.tasks}`);
      console.log(`    quotes ${d.quotes} · invoices ${d.invoices} · payments ${d.payments}`);
      console.log(`    revisions ${d.revisions} · feedback ${d.feedback} · leads ${d.leads}`);
      console.log(`    expenses ${d.expenses} · subscriptions ${d.subscriptions} · events ${d.events}`);
      console.log(`    portfolio ${d.portfolio} · case studies ${d.caseStudies} · posts ${d.posts}`);
      console.log(`    testimonials ${d.testimonials} · briefs ${d.briefs} · moodboards ${d.moodboards}`);
    }
  }

  console.log(`\n  Search index: ${report.indexed} entries`);

  if (report.adminCreated) {
    console.log('\n  ⚠ First login uses BOOTSTRAP_ADMIN_PASSWORD and will immediately');
    console.log('    require a new password. The value is stored only as a scrypt hash.');
  }

  console.log('\n  Done. Start the app with: npm run dev');
  closeDb();
}

main().catch((error) => {
  console.error('\n✖ Seed failed:', error instanceof Error ? error.message : error);
  process.exitCode = 1;
  closeDb();
});
