// Server-only by construction: this module imports Node built-ins / native
// bindings, which the bundler refuses in a client component. The `server-only`
// guard is deliberately NOT used here so the CLI scripts in scripts/ can
// import it directly (that package throws outside the Next bundler).
import { buildDocument, type BuildDocumentInput, type DocumentLine } from './document';
import * as financeRepo from '@/lib/db/repositories/finance';
import { findClient } from '@/lib/db/repositories/clients';
import { findProject } from '@/lib/db/repositories/projects';
import { getSettingsMap } from '@/lib/db/repositories/settings';
import { formatMoney, formatShortDate } from '@/lib/i18n/format';
import type { Locale } from '@/lib/i18n/config';
import type { InvoiceRow, QuoteRow } from '@/lib/db/types';

/**
 * Turns a quote / invoice / contract row into a PDF.
 *
 * Every figure comes from the stored document, never recomputed: a PDF issued
 * today and re-downloaded next year must show the same numbers even if prices or
 * the VAT rate have changed since.
 */

function issuerParty() {
  const settings = getSettingsMap();
  const value = (key: string) => {
    const raw = settings[key];
    return raw && raw.trim() !== '' ? raw.trim() : null;
  };

  const name = value('legal.company_name') ?? value('site.owner_name') ?? 'Boubaker Choupotman';
  const lines = [
    value('contact.address'),
    [value('contact.email'), value('contact.phone')].filter(Boolean).join(' · ') || null,
    [
      value('legal.tax_id') ? `NIF : ${value('legal.tax_id')}` : null,
      value('legal.registration') ? `RC : ${value('legal.registration')}` : null,
    ]
      .filter(Boolean)
      .join(' · ') || null,
  ].filter((line): line is string => Boolean(line));

  return { name, lines, settings };
}

function recipientParty(clientId: number | null, fallbackName = 'Client') {
  const client = clientId ? findClient(clientId) : null;
  if (!client) return { name: fallbackName, lines: [] as string[] };

  return {
    name: client.company ? `${client.company}` : client.name,
    lines: [
      client.company ? client.name : null,
      client.address,
      [client.city, client.country].filter(Boolean).join(', ') || null,
      [client.email, client.phone].filter(Boolean).join(' · ') || null,
      client.tax_id ? `NIF : ${client.tax_id}` : null,
    ].filter((line): line is string => Boolean(line)),
  };
}

function toLines(
  items: { label: string; description: string | null; quantity: number; unit: string; unit_price: number; discount: number; line_total: number }[],
  currency: string,
  locale: Locale,
): DocumentLine[] {
  return items.map((item) => ({
    label: item.label,
    description: item.description,
    quantity: item.quantity,
    unit: item.unit,
    unitPrice: formatMoney(item.unit_price, currency, locale),
    discount: item.discount,
    total: formatMoney(item.line_total, currency, locale),
  }));
}

function taxLabel(settings: Record<string, string>): string {
  const label = settings['finance.tax_label'];
  return label && label.trim() !== '' ? label.trim() : 'TVA';
}

function documentTotals(
  doc: QuoteRow | InvoiceRow,
  settings: Record<string, string>,
  locale: Locale,
): BuildDocumentInput['totals'] {
  const totals: BuildDocumentInput['totals'] = [
    { label: 'Sous-total', value: formatMoney(doc.subtotal, doc.currency, locale) },
  ];

  if (doc.discount_total > 0) {
    const suffix = doc.discount_type === 'percent' ? ` (${doc.discount_value} %)` : '';
    totals.push({ label: `Remise${suffix}`, value: `- ${formatMoney(doc.discount_total, doc.currency, locale)}` });
  }

  if (doc.tax_rate > 0) {
    totals.push({
      label: `${taxLabel(settings)} ${doc.tax_rate} %`,
      value: formatMoney(doc.tax_total, doc.currency, locale),
    });
  }

  totals.push({ label: 'Total', value: formatMoney(doc.total, doc.currency, locale), strong: true });

  // Invoices additionally show what has been paid and what remains.
  if ('amount_paid' in doc && doc.amount_paid > 0) {
    totals.push({ label: 'Déjà payé', value: `- ${formatMoney(doc.amount_paid, doc.currency, locale)}` });
    totals.push({
      label: 'Reste à payer',
      value: formatMoney(doc.balance_due, doc.currency, locale),
      strong: true,
    });
  }

  return totals;
}

export async function renderQuotePdf(quoteId: number): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const quote = financeRepo.findQuote(quoteId);
  if (!quote) return null;

  const items = financeRepo.listQuoteItems(quoteId);
  const { name, lines, settings } = issuerParty();
  const locale = (quote.locale as Locale) ?? 'fr';
  const project = quote.project_id ? findProject(quote.project_id) : null;

  const bytes = await buildDocument({
    kind: 'Devis',
    number: quote.number,
    statusLabel: financeRepo.quoteStatusLabel(quote.status),
    title: quote.title,
    issuer: { name, lines },
    recipient: recipientParty(quote.client_id, quote.client_name ?? 'Client'),
    meta: [
      { label: 'Date', value: formatShortDate(quote.issue_date, locale) },
      ...(quote.valid_until ? [{ label: 'Valable jusqu’au', value: formatShortDate(quote.valid_until, locale) }] : []),
      ...(project ? [{ label: 'Projet', value: project.reference }] : []),
    ],
    lines: toLines(items, quote.currency, locale),
    totals: documentTotals(quote, settings, locale),
    blocks: [
      { heading: 'Délai de réalisation', body: quote.delivery_terms ?? '' },
      { heading: 'Conditions de paiement', body: quote.payment_terms ?? '' },
      { heading: 'Conditions générales', body: quote.conditions ?? '' },
      { heading: 'Notes', body: quote.notes ?? '' },
      { heading: 'Coordonnées bancaires', body: settings['finance.bank_details'] ?? '' },
    ],
    footer: settings['finance.legal_footer'] ?? `${name} · Devis ${quote.number}`,
    watermark: quote.status === 'draft' ? 'BROUILLON' : null,
  });

  return { bytes, filename: `${quote.number}.pdf` };
}

export async function renderInvoicePdf(invoiceId: number): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const invoice = financeRepo.findInvoice(invoiceId);
  if (!invoice) return null;

  const items = financeRepo.listInvoiceItems(invoiceId);
  const payments = financeRepo.listPayments({ invoiceId });
  const { name, lines, settings } = issuerParty();
  const locale = (invoice.locale as Locale) ?? 'fr';
  const project = invoice.project_id ? findProject(invoice.project_id) : null;

  const paymentLog =
    payments.length > 0
      ? payments
          .map(
            (payment) =>
              `${formatShortDate(payment.paid_at, locale)} — ${formatMoney(payment.amount, payment.currency, locale)} (${financeRepo.paymentMethodLabel(payment.method)}${payment.reference ? `, réf. ${payment.reference}` : ''})`,
          )
          .join('\n')
      : '';

  const bytes = await buildDocument({
    kind: 'Facture',
    number: invoice.number,
    statusLabel: financeRepo.invoiceStatusLabel(invoice.status),
    title: invoice.title,
    issuer: { name, lines },
    recipient: recipientParty(invoice.client_id, invoice.client_name ?? 'Client'),
    meta: [
      { label: 'Date', value: formatShortDate(invoice.issue_date, locale) },
      ...(invoice.due_date ? [{ label: 'Échéance', value: formatShortDate(invoice.due_date, locale) }] : []),
      ...(project ? [{ label: 'Projet', value: project.reference }] : []),
      ...(invoice.quote_id
        ? [{ label: 'Devis lié', value: financeRepo.findQuote(invoice.quote_id)?.number ?? '—' }]
        : []),
    ],
    lines: toLines(items, invoice.currency, locale),
    totals: documentTotals(invoice, settings, locale),
    blocks: [
      { heading: 'Conditions de paiement', body: invoice.payment_terms ?? '' },
      { heading: 'Paiements enregistrés', body: paymentLog },
      { heading: 'Notes', body: invoice.notes ?? '' },
      { heading: 'Coordonnées bancaires', body: settings['finance.bank_details'] ?? '' },
    ],
    footer: settings['finance.legal_footer'] ?? `${name} · Facture ${invoice.number}`,
    watermark:
      invoice.status === 'draft' ? 'BROUILLON' : invoice.status === 'cancelled' ? 'ANNULEE' : null,
  });

  return { bytes, filename: `${invoice.number}.pdf` };
}

export async function renderContractPdf(contractId: number): Promise<{ bytes: Uint8Array; filename: string } | null> {
  const contract = financeRepo.findContract(contractId);
  if (!contract) return null;

  const { name, lines, settings } = issuerParty();
  const locale = (contract.locale as Locale) ?? 'fr';

  const bytes = await buildDocument({
    kind: 'Contrat',
    number: contract.number,
    statusLabel: contract.status === 'signed' ? 'Signé' : contract.status === 'sent' ? 'Envoyé' : 'Brouillon',
    title: contract.title,
    issuer: { name, lines },
    recipient: recipientParty(contract.client_id, contract.client_name ?? 'Client'),
    meta: [
      { label: 'Date', value: formatShortDate(contract.issue_date, locale) },
      ...(contract.start_date ? [{ label: 'Début', value: formatShortDate(contract.start_date, locale) }] : []),
      ...(contract.delivery_date
        ? [{ label: 'Livraison', value: formatShortDate(contract.delivery_date, locale) }]
        : []),
      ...(contract.amount > 0
        ? [{ label: 'Montant', value: formatMoney(contract.amount, contract.currency, locale) }]
        : []),
    ],
    // A contract is prose, not a table: the whole body is one block.
    lines: [],
    totals: [],
    blocks: [{ heading: '', body: contract.body }],
    footer: settings['finance.legal_footer'] ?? `${name} · Contrat ${contract.number}`,
    watermark: contract.status === 'draft' ? 'BROUILLON' : null,
  });

  return { bytes, filename: `${contract.number}.pdf` };
}
