import Link from 'next/link';
import { FileText, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { TableWrap, Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table';
import { PageHeader, SummaryStrip, ListEmpty, DemoBadge } from '@/components/admin/page-kit';
import { ListFilters } from '@/components/admin/list-filters';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { QUOTE_STATUSES, countQuotes, listQuotes, quoteStatusLabel } from '@/lib/db/repositories/finance';
import { clientOptions } from '@/lib/db/repositories/clients';
import { formatMoney, formatShortDate } from '@/lib/i18n/format';
import type { QuoteStatus } from '@/lib/db/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Devis' };

const STATUS_TONES: Record<string, 'neutral' | 'info' | 'success' | 'danger' | 'warning' | 'outline'> = {
  draft: 'neutral', sent: 'info', accepted: 'success', refused: 'danger',
  expired: 'warning', archived: 'outline',
};

export default async function QuotesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string; client?: string }>;
}) {
  const user = await requirePermission('quotes.view');
  const query = await searchParams;
  const today = new Date().toISOString().slice(0, 10);

  const quotes = listQuotes({
    search: query.q?.trim() || undefined,
    status: (query.statut as QuoteStatus | 'all') || undefined,
    clientId: Number.parseInt(query.client ?? '', 10) || undefined,
    limit: 200,
  });

  const clients = clientOptions();

  return (
    <>
      <PageHeader
        title="Devis"
        description="Propositions commerciales. Un devis accepté peut être transformé en facture en un clic, sans ressaisie."
        actions={
          can(user, 'quotes.create') && (
            <Link href="/espace-admin/devis/nouveau" className={buttonClass('primary', 'sm')}>
              <Plus className="size-4" />
              Nouveau devis
            </Link>
          )
        }
      />

      <SummaryStrip
        items={[
          { label: 'Brouillons', value: countQuotes('draft'), href: '/espace-admin/devis?statut=draft' },
          { label: 'Envoyés', value: countQuotes('sent'), href: '/espace-admin/devis?statut=sent' },
          { label: 'Acceptés', value: countQuotes('accepted'), href: '/espace-admin/devis?statut=accepted' },
          { label: 'Refusés', value: countQuotes('refused'), href: '/espace-admin/devis?statut=refused' },
          { label: 'Total', value: countQuotes(), href: '/espace-admin/devis?statut=all' },
        ]}
      />

      <ListFilters
        searchPlaceholder="Numéro, objet, client…"
        resultCount={quotes.length}
        selects={[
          {
            key: 'statut',
            label: 'Statut',
            allLabel: 'Tous les statuts',
            options: QUOTE_STATUSES.map((status) => ({ value: status.key, label: status.label })),
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
        {quotes.length === 0 ? (
          <ListEmpty
            icon={<FileText className="size-5" />}
            title="Aucun devis"
            description="Créez un devis à partir du catalogue de services : le total, la remise et la TVA sont calculés automatiquement."
            actionHref={can(user, 'quotes.create') ? '/espace-admin/devis/nouveau' : undefined}
            actionLabel="Nouveau devis"
          />
        ) : (
          <TableWrap>
            <Table>
              <Thead>
                <tr>
                  <Th>Numéro</Th>
                  <Th>Client</Th>
                  <Th>Objet</Th>
                  <Th alignment="center">Statut</Th>
                  <Th>Émis le</Th>
                  <Th>Validité</Th>
                  <Th alignment="end">Total</Th>
                </tr>
              </Thead>
              <Tbody>
                {quotes.map((quote) => {
                  // A quote past its validity date that nobody has actioned is
                  // effectively dead: flag it rather than letting it look live.
                  const stale =
                    quote.valid_until !== null &&
                    quote.valid_until < today &&
                    (quote.status === 'sent' || quote.status === 'draft');
                  return (
                    <Tr key={quote.id}>
                      <Td>
                        <Link
                          href={`/espace-admin/devis/${quote.id}`}
                          className="flex items-center gap-2 font-mono text-[0.8125rem] font-medium text-fg hover:text-accent"
                        >
                          {quote.number}
                          <DemoBadge when={quote.is_demo} />
                        </Link>
                        <span className="text-[0.6875rem] text-fg-subtle">
                          {quote.item_count} ligne{quote.item_count > 1 ? 's' : ''}
                        </span>
                      </Td>
                      <Td className="text-[0.8125rem] text-fg-muted">
                        {quote.client_id ? (
                          <Link href={`/espace-admin/clients/${quote.client_id}`} className="hover:text-accent">
                            {quote.client_company ?? quote.client_name}
                          </Link>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </Td>
                      <Td className="text-[0.8125rem] text-fg-muted">
                        {quote.title ?? '—'}
                        {quote.project_title && (
                          <Link
                            href={`/espace-admin/projets/${quote.project_id}`}
                            className="block text-[0.6875rem] hover:text-accent"
                          >
                            {quote.project_title}
                          </Link>
                        )}
                      </Td>
                      <Td alignment="center">
                        <Badge tone={STATUS_TONES[quote.status] ?? 'neutral'}>
                          {quoteStatusLabel(quote.status)}
                        </Badge>
                      </Td>
                      <Td className="whitespace-nowrap text-[0.75rem] text-fg-muted">
                        {quote.issue_date ? formatShortDate(quote.issue_date, 'fr') : '—'}
                      </Td>
                      <Td className="whitespace-nowrap text-[0.75rem]">
                        {quote.valid_until ? (
                          <span className={stale ? 'font-semibold text-warning' : 'text-fg-muted'}>
                            {formatShortDate(quote.valid_until, 'fr')}
                            {stale && <span className="block text-[0.625rem]">échue</span>}
                          </span>
                        ) : (
                          <span className="text-fg-subtle">—</span>
                        )}
                      </Td>
                      <Td alignment="end" className="whitespace-nowrap font-medium tabular-nums">
                        {formatMoney(quote.total, quote.currency)}
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </TableWrap>
        )}
      </div>
    </>
  );
}
