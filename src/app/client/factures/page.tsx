import Link from 'next/link';
import { AlertTriangle, Download, FileText, Receipt } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { Progress } from '@/components/ui/misc';
import { StatTile } from '@/components/charts';
import { requireClientUser } from '@/lib/auth/guard';
import { portalInvoices, portalQuotes, portalSummary } from '@/lib/db/portal';
import { invoiceStatusLabel, quoteStatusLabel } from '@/lib/db/repositories/finance';
import { getSetting } from '@/lib/db/repositories/settings';
import { formatMoney, formatShortDate } from '@/lib/i18n/format';
import { money } from '@/lib/money';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Factures' };

const INVOICE_TONES: Record<string, 'info' | 'warning' | 'success' | 'danger' | 'outline'> = {
  sent: 'info', partially_paid: 'warning', paid: 'success', overdue: 'danger', cancelled: 'outline',
};

const QUOTE_TONES: Record<string, 'info' | 'success' | 'danger' | 'warning'> = {
  sent: 'info', accepted: 'success', refused: 'danger', expired: 'warning',
};

export default async function ClientInvoicesPage() {
  const clientUser = await requireClientUser();
  const clientId = clientUser.client_id;

  const invoices = portalInvoices(clientId).filter((invoice) => invoice.status !== 'cancelled');
  const quotes = portalQuotes(clientId);
  const summary = portalSummary(clientId);
  const today = new Date().toISOString().slice(0, 10);

  const paid = money(invoices.reduce((acc, invoice) => acc + invoice.amount_paid, 0));
  const bankDetails = getSetting('finance.bank_details', '');

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[1.375rem] font-semibold tracking-tight text-fg">Factures et devis</h1>
        <p className="mt-1.5 text-[0.8125rem] text-fg-muted">
          Tous vos documents financiers, téléchargeables en PDF.
        </p>
      </header>

      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <StatTile label="Total réglé" value={formatMoney(paid, summary.currency)} />
        <StatTile
          label="Solde à régler"
          value={formatMoney(summary.outstanding, summary.currency)}
          tone={summary.outstanding > 0 ? 'warning' : 'default'}
        />
        <StatTile
          label="Factures échues"
          value={summary.overdueCount}
          tone={summary.overdueCount > 0 ? 'danger' : 'default'}
        />
      </div>

      {summary.outstanding > 0 && bankDetails && (
        <Card className="mb-6">
          <CardBody>
            <p className="text-[0.8125rem] font-semibold text-fg">Coordonnées de règlement</p>
            <p className="mt-1.5 whitespace-pre-line text-[0.8125rem] leading-relaxed text-fg-muted">
              {bankDetails}
            </p>
          </CardBody>
        </Card>
      )}

      {/* ── Invoices ───────────────────────────────────────────────────── */}
      <section className="mb-8">
        <h2 className="mb-3 text-[0.9375rem] font-semibold text-fg">Factures</h2>

        {invoices.length === 0 ? (
          <Card>
            <CardBody className="py-10 text-center">
              <Receipt className="mx-auto mb-3 size-6 text-fg-subtle" />
              <p className="text-[0.875rem] font-medium text-fg">Aucune facture</p>
              <p className="mt-1.5 text-[0.8125rem] text-fg-muted">
                Vos factures apparaîtront ici dès leur émission.
              </p>
            </CardBody>
          </Card>
        ) : (
          <ul className="space-y-2.5">
            {invoices.map((invoice) => {
              const overdue = invoice.balance_due > 0 && invoice.due_date !== null && invoice.due_date < today;
              return (
                <li
                  key={invoice.id}
                  className="rounded-[var(--radius-card)] border border-line bg-surface-raised p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-[0.875rem] font-semibold text-fg">
                          {invoice.number}
                        </span>
                        <Badge tone={overdue ? 'danger' : (INVOICE_TONES[invoice.status] ?? 'neutral')}>
                          {overdue ? 'En retard' : invoiceStatusLabel(invoice.status)}
                        </Badge>
                      </p>
                      <p className="mt-1 text-[0.75rem] text-fg-muted">
                        {invoice.project_title ?? invoice.title ?? 'Prestation'}
                      </p>
                      <p className="mt-0.5 text-[0.6875rem] text-fg-subtle">
                        {invoice.issue_date && `Émise le ${formatShortDate(invoice.issue_date, 'fr')}`}
                        {invoice.due_date && ` · échéance ${formatShortDate(invoice.due_date, 'fr')}`}
                      </p>
                    </div>

                    <div className="text-end">
                      <p className="text-[1.0625rem] font-semibold tabular-nums text-fg">
                        {formatMoney(invoice.total, invoice.currency)}
                      </p>
                      {invoice.balance_due > 0 ? (
                        <p
                          className={
                            overdue
                              ? 'text-[0.75rem] font-semibold tabular-nums text-danger'
                              : 'text-[0.75rem] tabular-nums text-warning'
                          }
                        >
                          {formatMoney(invoice.balance_due, invoice.currency)} restant
                        </p>
                      ) : (
                        <p className="text-[0.75rem] font-medium text-success">Réglée</p>
                      )}
                    </div>
                  </div>

                  {invoice.amount_paid > 0 && invoice.balance_due > 0 && (
                    <div className="mt-3">
                      <Progress value={invoice.amount_paid} total={invoice.total} tone="accent" />
                      <p className="mt-1 text-[0.625rem] tabular-nums text-fg-subtle">
                        {formatMoney(invoice.amount_paid, invoice.currency)} déjà réglés
                      </p>
                    </div>
                  )}

                  {overdue && (
                    <p className="mt-3 flex items-center gap-1.5 text-[0.6875rem] text-danger">
                      <AlertTriangle className="size-3.5" />
                      Cette facture a dépassé son échéance.
                    </p>
                  )}

                  <div className="mt-3 border-t border-line pt-2.5">
                    <Link
                      href={`/api/client/factures/${invoice.id}/pdf`}
                      className="inline-flex items-center gap-1.5 text-[0.75rem] font-medium text-accent hover:underline"
                    >
                      <Download className="size-3.5" />
                      Télécharger le PDF
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ── Quotes ─────────────────────────────────────────────────────── */}
      {quotes.length > 0 && (
        <section>
          <h2 className="mb-3 text-[0.9375rem] font-semibold text-fg">Devis</h2>
          <ul className="space-y-2.5">
            {quotes.map((quote) => (
              <li
                key={quote.id}
                className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface-raised p-4"
              >
                <FileText className="size-4 shrink-0 text-fg-subtle" />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-[0.8125rem] font-medium text-fg">{quote.number}</span>
                    <Badge tone={QUOTE_TONES[quote.status] ?? 'neutral'}>
                      {quoteStatusLabel(quote.status)}
                    </Badge>
                  </p>
                  <p className="text-[0.6875rem] text-fg-subtle">
                    {quote.project_title ?? quote.title ?? 'Proposition'}
                    {quote.valid_until && ` · valable jusqu’au ${formatShortDate(quote.valid_until, 'fr')}`}
                  </p>
                </div>
                <span className="shrink-0 text-[0.875rem] font-semibold tabular-nums text-fg">
                  {formatMoney(quote.total, quote.currency)}
                </span>
                <Link
                  href={`/api/client/devis/${quote.id}/pdf`}
                  className="inline-flex shrink-0 items-center gap-1.5 text-[0.75rem] font-medium text-accent hover:underline"
                >
                  <Download className="size-3.5" />
                  PDF
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
