/**
 * Renders one quote, invoice and contract to disk so the PDF pipeline can be
 * inspected without going through the browser.
 *
 *   npx tsx scripts/test/pdf.ts [outDir]
 */
import { config as loadEnv } from 'dotenv';
loadEnv({ path: '.env.local', quiet: true });
loadEnv({ quiet: true });

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { closeDb } from '../../src/lib/db/client';
import { listQuotes, listInvoices, listContracts, defaultContractTemplate, createContract } from '../../src/lib/db/repositories/finance';
import { renderContractPdf, renderInvoicePdf, renderQuotePdf } from '../../src/lib/pdf/finance';
import { renderTemplate } from '../../src/lib/db/repositories/comms';
import { findClient } from '../../src/lib/db/repositories/clients';
import { findProject } from '../../src/lib/db/repositories/projects';

async function main(): Promise<void> {
  const outDir = process.argv[2] ?? './data/tmp/pdf';
  mkdirSync(outDir, { recursive: true });
  let failures = 0;

  const check = (label: string, bytes: Uint8Array | undefined, filename?: string) => {
    if (!bytes || bytes.byteLength < 800) {
      console.log(`  ✗ ${label}: sortie vide ou trop petite`);
      failures += 1;
      return;
    }
    // A PDF must start with "%PDF-" and end with "%%EOF".
    const head = Buffer.from(bytes.slice(0, 5)).toString('latin1');
    const tail = Buffer.from(bytes.slice(-1024)).toString('latin1');
    if (head !== '%PDF-') {
      console.log(`  ✗ ${label}: en-tête PDF absent (${head})`);
      failures += 1;
      return;
    }
    if (!tail.includes('%%EOF')) {
      console.log(`  ✗ ${label}: marqueur %%EOF absent`);
      failures += 1;
      return;
    }
    const path = join(outDir, filename ?? `${label}.pdf`);
    writeFileSync(path, bytes);
    console.log(`  ✓ ${label}: ${(bytes.byteLength / 1024).toFixed(1)} Ko → ${path}`);
  };

  console.log('▸ Génération des PDF');

  const quote = listQuotes({ limit: 1 })[0];
  if (quote) {
    const result = await renderQuotePdf(quote.id);
    check(`devis-${quote.number}`, result?.bytes, result?.filename);
  } else {
    console.log('  – aucun devis en base');
  }

  const invoice = listInvoices({ limit: 1 })[0];
  if (invoice) {
    const result = await renderInvoicePdf(invoice.id);
    check(`facture-${invoice.number}`, result?.bytes, result?.filename);
  } else {
    console.log('  – aucune facture en base');
  }

  // Contracts are not seeded, so generate one from the default template to
  // exercise the variable substitution and the prose layout.
  let contract = listContracts({ limit: 1 })[0];
  if (!contract) {
    const template = defaultContractTemplate();
    const project = findProject(1);
    const client = project?.client_id ? findClient(project.client_id) : null;
    if (template && project) {
      const body = renderTemplate(template.body, {
        owner_name: 'Boubaker Choupotman',
        owner_email: 'contact@choupotman.com',
        owner_phone: '—',
        owner_address: '—',
        client_name: client?.name ?? 'Client',
        client_company: client?.company ?? '',
        client_address: client?.address ?? '',
        client_email: client?.email ?? '',
        project_name: project.title,
        project_price: `${project.budget} ${project.currency}`,
        services: '- Développement\n- Intégration',
        payment_terms: 'Acompte de 40 % au démarrage, solde à la livraison.',
        start_date: project.start_date ?? '—',
        delivery_date: project.delivery_date ?? '—',
        revisions_included: String(project.revisions_included),
        issue_date: new Date().toISOString().slice(0, 10),
      });
      const id = createContract({
        templateId: template.id,
        clientId: project.client_id,
        projectId: project.id,
        title: `Contrat — ${project.title}`,
        body,
        amount: project.budget,
        currency: project.currency,
        isDemo: true,
      });
      contract = listContracts({ limit: 1 }).find((c) => c.id === id) ?? contract;

      // Verify no placeholder survived substitution.
      const leftovers = body.match(/\{\{[a-z_]+\}\}/g);
      if (leftovers) {
        console.log(`  ✗ variables non substituées dans le contrat : ${leftovers.join(', ')}`);
        failures += 1;
      } else {
        console.log('  ✓ toutes les variables du contrat ont été substituées');
      }
    }
  }

  if (contract) {
    const result = await renderContractPdf(contract.id);
    check(`contrat-${contract.number}`, result?.bytes, result?.filename);
  } else {
    console.log('  – aucun contrat généré');
  }

  console.log(failures === 0 ? '\n  Tous les PDF sont valides.' : `\n  ${failures} échec(s).`);
  closeDb();
  if (failures > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error('✖ Échec de la génération PDF:', error);
  process.exitCode = 1;
  closeDb();
});
