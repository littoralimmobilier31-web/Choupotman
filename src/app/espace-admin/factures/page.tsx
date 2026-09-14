import Link from 'next/link';
import { AlertTriangle, Plus, Receipt } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { Progress } from '@/components/ui/misc';
import { TableWrap, Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table';
import { PageHeader, ListEmpty, DemoBadge } from '@/components/admin/page-kit';
import { ListFilters } from '@/components/admin/list-filters';
import { StatTile } from '@/components/charts';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import {
  INVOICE_STATUSES, countInvoices, defaultCurrency, invoiceStatusLabel, listInvoices,
} from '@/lib/db/repositories/finance';
import { clientOptions } from '@/lib/db/repositories/clients';
import { formatMoney, formatShortDate } from '@/lib/i18n/format';
import { money } from '@/lib/money';
import type { InvoiceStatus } from '@/lib/db/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Factures' };

const STATUS_TONES: Record<string, 'neutral' | 'info' | 'warning' | 'success' | 'danger' | 'outline'> = {
  draft: 'neutral', sent: 'info', partially_paid: 'warning', paid: 'success',
  overdue: 'danger', cancelled: 'outline',
};

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string; client?: string }>;
}) {
  const user = await requirePermission('invoices.view');
  const query = await searchParams;
  const currency = defaultCurrency();

  const invoices = listInvoices({
    search: query.q?.trim() || undefined,
    status: (query.statut as InvoiceStatus | 'all' | 'unpaid') || undefined,
    clientId: Number.parseInt(query.client ?? '', 10) || undefined,
    limit: 200,
  });

  const clients = clientOptions();

  // Cash position across every issued invoice, not just the filtered view: the
  // KPI row answers "where do I stand", which a filter must not distort.
  const all = listInvoices({ status: 'all', limit: 1000 });
  const issued = all.filter((invoice) => invoice.status !== 'draft' && invoice.status !== 'cancelled');
  const invoiced = money(issued.reduce((acc, invoice) => acc + invoice.total, 0));
  const collected = money(issued.reduce((acc, invoice) => acc + invoice.amount_paid, 0));
  const outstanding = money(issued.reduce((acc, invoice) => acc + invoice.balance_due, 0));
  const overdue = money(
    issued
      .filter((invoice) => invoice.status === 'overdue')
      .reduce((acc, invoice) => acc + invoice.balance_due, 0),
  );

  return (
    <>
      <PageHeader
        title="Factures"
        description="Numérotation continue, paiements partiels, relances automatiques. Une facture émise n’est jamais supprimée : elle est annulée."
        actions={
          can(user, 'invoices.create') && (
            <Link href="/espace-admin/factures/nouveau" className={buttonClass('primary', 'sm')}>
              <Plus className="size-4" />
              Nouvelle facture
            </Link>
          )
        }
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Facturé" value={formatMoney(invoiced, currency)} hint={`${issued.length} facture(s) émise(s)`} />
        <StatTile
          label="Encaissé"
          value={formatMoney(collected, currency)}
          hint={invoiced > 0 ? `${Math.round((collected / invoiced) * 100)} % du facturé` : undefined}
        />
        <StatTile
          label="Reste à encaisser"
          value={formatMoney(outstanding, currency)}
          tone={outstanding > 0 ? 'warning' : 'default'}
        />
        <StatTile
          label="En retard"
          value={formatMoney(overdue, currency)}
          tone={overdue > 0 ? 'danger' : 'default'}
          hint={`${countInvoices('overdue')} facture(s)`}
        />
      </div>

      <ListFilters
        searchPlaceholder="Numéro, objet, client…"
        resultCount={invoices.length}
        selects={[
          {
            key: 'statut',
            label: 'Statut',
            allLabel: 'Tous les statuts',
            options: [
              { value: 'unpaid', label: 'Impayées' },
              ...INVOICE_STATUSES.map((status) => ({ value: status.key, label: status.label })),
            ],
          },
          ...(clients.length > 0
            ? [
                {
                  key: 'client',
                  label: 'Client',
                  allLabel: 'Tous les clients',
                  options: clients.map((client) => ({ value: String(client.id), label: client.label })),
                },
              ]
            : []),
        ]}
      />

      <div className="mt-5">
        {invoices.length === 0 ? (
          <ListEmpty
            icon={<Receipt className="size-5" />}
            title="Aucune facture"
            description="Créez une facture, ou transformez un devis accepté en facture sans ressaisir les lignes."
            actionHref={can(user, 'invoices.create') ? '/espace-admin/factures/nouveau' : undefined}
            actionLabel="Nouvelle facture"
          />
        ) : (
          <TableWrap>
            <Table>
              <Thead>
                <tr>
                  <Th>Numéro</Th>
                  <Th>Client</Th>
                  <Th alignment="center">Statut</Th>
                  <Th>Échéance</Th>
                  <Th>Encaissement</Th>
                  <Th alignment="end">Total</Th>
                  <Th alignment="end">Reste dû</Th>
                </tr>
              </Thead>
              <Tbody>
                {invoices.map((invoice) => (
                  <Tr key={invoice.id}>
                    <Td>
                      <Link
                        href={`/espace-admin/factures/${invoice.id}`}
                        className="flex items-center gap-2 font-mono text-[0.8125rem] font-medium text-fg hover:text-accent"
                      >
                        {invoice.number}
                        <DemoBadge when={invoice.is_demo} />
                      </Link>
                      <span className="text-[0.6875rem] text-fg-subtle">{invoice.title ?? '—'}</span>
                    </Td>
                    <Td className="text-[0.8125rem] text-fg-muted">
                      {invoice.client_id ? (
                        <Link href={`/espace-admin/clients/${invoice.client_id}`} className="hover:text-accent">
                          {invoice.client_company ?? invoice.client_name}
                        </Link>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </Td>
                    <Td alignment="center">
                      <Badge tone={STATUS_TONES[invoice.status] ?? 'neutral'}>
                        {invoiceStatusLabel(invoice.status)}
                      </Badge>
                    </Td>
                    <Td className="whitespace-nowrap text-[0.75rem]">
                      {invoice.due_date ? (
                        <span
                          className={
                            invoice.days_overdue > 0
                              ? 'inline-flex items-center gap-1 font-semibold text-danger'
                              : 'text-fg-muted'
                          }
                        >
                          {invoice.days_overdue > 0 && <AlertTriangle className="size-3" />}
                          {formatShortDate(invoice.due_date, 'fr')}
                          {invoice.days_overdue > 0 && (
                            <span className="block text-[0.625rem]">{invoice.days_overdue} j de retard</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </Td>
                    <Td className="min-w-28">
                      {invoice.total > 0 ? (
                        <>
                          <Progress
                            value={invoice.amount_paid}
                            total={invoice.total}
                            tone={invoice.balance_due === 0 ? 'success' : invoice.days_overdue > 0 ? 'danger' : 'accent'}
                          />
                          <span className="mt-1 block text-[0.625rem] tabular-nums text-fg-subtle">
                            {formatMoney(invoice.amount_paid, invoice.currency)}
                            {invoice.payment_count > 0 && ` · ${invoice.payment_count} règlement(s)`}
                          </span>
                        </>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </Td>
                    <Td alignment="end" className="whitespace-nowrap font-medium tabular-nums">
                      {formatMoney(invoice.total, invoice.currency)}
                    </Td>
                    <Td alignment="end" className="whitespace-nowrap tabular-nums">
                      {invoice.balance_due > 0 ? (
                        <span className={invoice.days_overdue > 0 ? 'font-semibold text-danger' : 'text-warning'}>
                          {formatMoney(invoice.balance_due, invoice.currency)}
                        </span>
                      ) : (
                        <span className="text-success">soldée</span>
                      )}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableWrap>
        )}
      </div>
    </>
  );
}
