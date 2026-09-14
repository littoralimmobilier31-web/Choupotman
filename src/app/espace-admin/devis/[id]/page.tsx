import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Copy, Download, Receipt } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PageHeader, DemoBadge } from '@/components/admin/page-kit';
import { DocumentForm, type DocumentValues } from '@/components/admin/document-form';
import { DocumentActions } from '@/components/admin/document-actions';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import { documentOptions } from '@/lib/db/document-options';
import { findQuote, invoiceForQuote, listQuoteItems, quoteStatusLabel } from '@/lib/db/repositories/finance';
import { formatShortDate } from '@/lib/i18n/format';

export const dynamic = 'force-dynamic';

const STATUS_TONES: Record<string, 'neutral' | 'info' | 'success' | 'danger' | 'warning' | 'outline'> = {
  draft: 'neutral', sent: 'info', accepted: 'success', refused: 'danger',
  expired: 'warning', archived: 'outline',
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const quote = findQuote(Number.parseInt(id, 10));
  return { title: quote?.number ?? 'Devis' };
}

export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('quotes.view');
  const { id: raw } = await params;
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) notFound();

  const quote = findQuote(id);
  if (!quote) notFound();

  const csrf = (await getCsrfToken()) ?? '';
  const options = documentOptions();
  const items = listQuoteItems(id);
  const invoice = invoiceForQuote(id);

  const initial: DocumentValues = {
    client_id: quote.client_id ? String(quote.client_id) : '',
    project_id: quote.project_id ? String(quote.project_id) : '',
    title: quote.title ?? '',
    currency: quote.currency,
    status: quote.status,
    issue_date: quote.issue_date ?? '',
    end_date: quote.valid_until ?? '',
    discount_type: quote.discount_type,
    discount_value: String(quote.discount_value),
    tax_rate: String(quote.tax_rate),
    payment_terms: quote.payment_terms ?? '',
    delivery_terms: quote.delivery_terms ?? '',
    conditions: quote.conditions ?? '',
    notes: quote.notes ?? '',
    locale: quote.locale,
    kind: 'standard',
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
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title={quote.number}
        description={quote.title ?? undefined}
        backHref="/espace-admin/devis"
        backLabel="Devis"
        badges={
          <>
            <Badge tone={STATUS_TONES[quote.status] ?? 'neutral'}>{quoteStatusLabel(quote.status)}</Badge>
            <DemoBadge when={quote.is_demo} />
          </>
        }
        actions={
          <>
            <Link
              href={`/api/devis/${id}/pdf`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5 text-[0.75rem] font-medium text-fg-muted transition-colors hover:text-fg"
            >
              <Download className="size-3.5" />
              PDF
            </Link>
            <DocumentActions
              csrf={csrf}
              kind="quote"
              documentId={id}
              status={quote.status}
              canCreateInvoice={can(user, 'invoices.create') && invoice === null}
              canDuplicate={can(user, 'quotes.create')}
              canUpdate={can(user, 'quotes.update')}
            />
          </>
        }
      />

      {invoice && (
        <p className="mb-5 flex flex-wrap items-center gap-2 rounded-lg bg-success-soft px-3 py-2.5 text-[0.8125rem] text-success">
          <Receipt className="size-4 shrink-0" />
          Ce devis a été transformé en facture {invoice.number}.
          <Link href={`/espace-admin/factures/${invoice.id}`} className="font-semibold underline">
            Voir la facture
          </Link>
        </p>
      )}

      {quote.sent_at && (
        <p className="mb-5 flex items-center gap-2 text-[0.75rem] text-fg-subtle">
          <Copy className="size-3.5" />
          Envoyé le {formatShortDate(quote.sent_at, 'fr')}
          {quote.accepted_at && ` · accepté le ${formatShortDate(quote.accepted_at, 'fr')}`}
        </p>
      )}

      <DocumentForm
        kind="quote"
        csrf={csrf}
        documentId={id}
        initial={initial}
        clients={options.clients}
        projects={options.projects}
        services={options.services}
        canDelete={can(user, 'quotes.delete')}
        // A quote stays editable after sending: renegotiation is normal and the
        // PDF is regenerated. Only invoices lock their amounts.
        amountsLocked={quote.status === 'archived'}
      />
    </div>
  );
}
