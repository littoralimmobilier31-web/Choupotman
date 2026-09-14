import Link from 'next/link';
import { notFound } from 'next/navigation';
import { AlertTriangle, Download, FileText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, MiniStat, DemoBadge } from '@/components/admin/page-kit';
import { DocumentForm, type DocumentValues } from '@/components/admin/document-form';
import { DocumentActions } from '@/components/admin/document-actions';
import { PaymentPanel } from '@/components/admin/payment-panel';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import { documentOptions } from '@/lib/db/document-options';
import {
  findInvoice, findQuote, invoiceStatusLabel, listInvoiceItems, listPayments,
} from '@/lib/db/repositories/finance';
import { formatMoney, formatShortDate } from '@/lib/i18n/format';

export const dynamic = 'force-dynamic';

const STATUS_TONES: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'outline'> = {
  draft: 'neutral', sent: 'info', partially_paid: 'warning', paid: 'success',
  overdue: 'danger', cancelled: 'outline',
};

const KIND_LABELS: Record<string, string> = {
  standard: 'Standard', deposit: 'Acompte', revision_extra: 'Révision supplémentaire', final: 'Solde',
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const invoice = findInvoice(Number.parseInt(id, 10));
  return { title: invoice?.number ?? 'Facture' };
}

export default async function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('invoices.view');
  const { id: raw } = await params;
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const invoice = findInvoice(id);
  if (!invoice) notFound();

  const csrf = (await getCsrfToken()) ?? '';
  const options = documentOptions();
  const items = listInvoiceItems(id);
  const payments = listPayments({ invoiceId: id, limit: 100 });
  const quote = invoice.quote_id ? findQuote(invoice.quote_id) : null;

  // Amounts are locked once the invoice leaves draft: the API refuses the edit
  // (409) and the form must not pretend otherwise.
  const amountsLocked = invoice.status !== 'draft';

  const initial: DocumentValues = {
    client_id: invoice.client_id ? String(invoice.client_id) : '',
    project_id: invoice.project_id ? String(invoice.project_id) : '',
    title: invoice.title ?? '',
    currency: invoice.currency,
    status: invoice.status,
    issue_date: invoice.issue_date ?? '',
    end_date: invoice.due_date ?? '',
    discount_type: invoice.discount_type,
    discount_value: String(invoice.discount_value),
    tax_rate: String(invoice.tax_rate),
    payment_terms: invoice.payment_terms ?? '',
    delivery_terms: '',
    conditions: '',
    notes: invoice.notes ?? '',
    locale: invoice.locale,
    kind: invoice.kind,
    items: items.map((item) => ({
      uid: `i${item.id}`,
      service_id: item.service_id ? String(item.service_id) : '',
      label: item.label,
      description: item.description ?? '',
      quantity: String(item.quantity),
      unit: item.unit ?? 'forfait',
      unit_price: String(item.unit_price),
      discount: String(item.discount),
    })),
  };

  return (
    <>
      <PageHeader
        title={invoice.number}
        description={invoice.title ?? undefined}
        backHref="/espace-admin/factures"
        backLabel="Factures"
        badges={
          <>
            <Badge tone={STATUS_TONES[invoice.status] ?? 'neutral'}>{invoiceStatusLabel(invoice.status)}</Badge>
            {invoice.kind !== 'standard' && <Badge tone="outline">{KIND_LABELS[invoice.kind] ?? invoice.kind}</Badge>}
            <DemoBadge when={invoice.is_demo} />
          </>
        }
        actions={
          <>
            <Link
              href={`/api/factures/${id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[0.75rem] font-medium text-fg-muted transition-colors hover:text-fg"
            >
              <Download className="size-3.5" />
              PDF
            </Link>
            <DocumentActions
              csrf={csrf}
              kind="invoice"
              documentId={id}
              status={invoice.status}
              canUpdate={can(user, 'invoices.update')}
            />
          </>
        }
      />

      {invoice.days_overdue > 0 && (
        <p className="mb-5 flex items-center gap-2 rounded-lg bg-danger-soft px-3 py-2.5 text-[0.8125rem] font-medium text-danger">
          <AlertTriangle className="size-4 shrink-0" />
          Échue depuis {invoice.days_overdue} jour(s) — reste dû{' '}
          {formatMoney(invoice.balance_due, invoice.currency)}
        </p>
      )}

      {quote && (
        <p className="mb-5 flex flex-wrap items-center gap-2 text-[0.75rem] text-fg-subtle">
          <FileText className="size-3.5" />
          Émise depuis le devis
          <Link href={`/espace-admin/devis/${quote.id}`} className="font-semibold text-accent hover:underline">
            {quote.number}
          </Link>
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0">
          <DocumentForm
            kind="invoice"
            csrf={csrf}
            documentId={id}
            initial={initial}
            clients={options.clients}
            projects={options.projects}
            services={options.services}
            canDelete={can(user, 'invoices.delete')}
            amountsLocked={amountsLocked}
          />
        </div>

        <aside className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Encaissement</CardTitle>
            </CardHeader>
            <CardBody className="space-y-4 pt-3">
              <div className="grid grid-cols-2 gap-4">
                <MiniStat label="Total" value={formatMoney(invoice.total, invoice.currency)} />
                <MiniStat
                  label="Reste dû"
                  value={formatMoney(invoice.balance_due, invoice.currency)}
                  tone={invoice.balance_due === 0 ? 'success' : invoice.days_overdue > 0 ? 'danger' : 'warning'}
                />
                <MiniStat label="Encaissé" value={formatMoney(invoice.amount_paid, invoice.currency)} tone="success" />
                <MiniStat
                  label="Échéance"
                  value={invoice.due_date ? formatShortDate(invoice.due_date, 'fr') : '—'}
                  tone={invoice.days_overdue > 0 ? 'danger' : 'default'}
                />
              </div>

              <PaymentPanel
                csrf={csrf}
                invoiceId={id}
                clientId={invoice.client_id}
                projectId={invoice.project_id}
                currency={invoice.currency}
                balanceDue={invoice.balance_due}
                payments={payments}
                canCreate={can(user, 'payments.create') && invoice.status !== 'cancelled' && invoice.status !== 'draft'}
                canDelete={can(user, 'payments.delete')}
              />

              {invoice.status === 'draft' && (
                <p className="text-[0.6875rem] leading-relaxed text-fg-subtle">
                  Émettez la facture pour pouvoir enregistrer un règlement.
                </p>
              )}
            </CardBody>
          </Card>
        </aside>
      </div>
    </>
  );
}
