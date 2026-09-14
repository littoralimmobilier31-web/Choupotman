import Link from 'next/link';
import { Banknote } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { TableWrap, Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table';
import { PageHeader, ListEmpty, DemoBadge } from '@/components/admin/page-kit';
import { ListFilters } from '@/components/admin/list-filters';
import { StatTile } from '@/components/charts';
import { requirePermission } from '@/lib/auth/guard';
import { PAYMENT_METHODS, defaultCurrency, listPayments, paymentMethodLabel } from '@/lib/db/repositories/finance';
import { clientOptions } from '@/lib/db/repositories/clients';
import { formatMoney, formatShortDate } from '@/lib/i18n/format';
import { money } from '@/lib/money';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Paiements' };

const STATUS_LABELS: Record<string, string> = {
  pending: 'En attente', confirmed: 'Confirmé', refunded: 'Remboursé',
};

const STATUS_TONES: Record<string, 'warning' | 'success' | 'danger'> = {
  pending: 'warning', confirmed: 'success', refunded: 'danger',
};

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; client?: string; methode?: string; du?: string; au?: string }>;
}) {
  await requirePermission('payments.view');
  const query = await searchParams;
  const currency = defaultCurrency();

  // Default window: the current month, which is the question this page answers
  // most often ("what came in this month?").
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const from = query.du || monthStart;
  const to = query.au || undefined;

  const payments = listPayments({
    clientId: Number.parseInt(query.client ?? '', 10) || undefined,
    from,
    to,
    limit: 300,
  }).filter((payment) => {
    if (query.methode && payment.method !== query.methode) return false;
    const term = query.q?.trim().toLowerCase();
    if (!term) return true;
    return [payment.reference, payment.invoice_number, payment.client_name, payment.project_title, payment.notes]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
  });

  const confirmed = payments.filter((payment) => payment.status === 'confirmed');
  const total = money(confirmed.reduce((acc, payment) => acc + payment.amount, 0));
  const refunded = money(
    payments.filter((p) => p.status === 'refunded').reduce((acc, payment) => acc + payment.amount, 0),
  );

  // Share per method, so the owner can see how clients actually pay.
  const byMethod = PAYMENT_METHODS.map((method) => ({
    ...method,
    total: money(
      confirmed.filter((p) => p.method === method.key).reduce((acc, p) => acc + p.amount, 0),
    ),
  })).filter((entry) => entry.total > 0);

  const clients = clientOptions();

  return (
    <>
      <PageHeader
        title="Paiements"
        description="Tous les encaissements enregistrés. Un règlement met automatiquement à jour le solde et le statut de sa facture."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Encaissé sur la période"
          value={formatMoney(total, currency)}
          hint={`${confirmed.length} règlement(s)`}
        />
        <StatTile
          label="Règlement moyen"
          value={confirmed.length > 0 ? formatMoney(money(total / confirmed.length), currency) : '—'}
        />
        <StatTile
          label="Remboursé"
          value={formatMoney(refunded, currency)}
          tone={refunded > 0 ? 'warning' : 'default'}
        />
        <StatTile
          label="Mode dominant"
          value={byMethod.length > 0 ? byMethod.sort((a, b) => b.total - a.total)[0].label : '—'}
          hint={byMethod.length > 1 ? `${byMethod.length} modes utilisés` : undefined}
        />
      </div>

      <ListFilters
        searchPlaceholder="Référence, facture, client…"
        resultCount={payments.length}
        selects={[
          {
            key: 'methode',
            label: 'Mode',
            allLabel: 'Tous les modes',
            options: PAYMENT_METHODS.map((method) => ({ value: method.key, label: method.label })),
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

      <p className="mt-2 text-[0.6875rem] text-fg-subtle">
        Période : depuis le {formatShortDate(from, 'fr')}
        {to ? ` jusqu’au ${formatShortDate(to, 'fr')}` : ' (à aujourd’hui)'}. Ajoutez <code>?du=</code> et{' '}
        <code>?au=</code> dans l’URL pour une autre période.
      </p>

      <div className="mt-5">
        {payments.length === 0 ? (
          <ListEmpty
            icon={<Banknote className="size-5" />}
            title="Aucun paiement sur cette période"
            description="Les règlements s’enregistrent depuis la facture concernée."
          />
        ) : (
          <TableWrap>
            <Table>
              <Thead>
                <tr>
                  <Th>Date</Th>
                  <Th>Client</Th>
                  <Th>Facture</Th>
                  <Th alignment="center">Mode</Th>
                  <Th>Référence</Th>
                  <Th alignment="center">Statut</Th>
                  <Th alignment="end">Montant</Th>
                </tr>
              </Thead>
              <Tbody>
                {payments.map((payment) => (
                  <Tr key={payment.id}>
                    <Td className="whitespace-nowrap text-[0.8125rem] text-fg-muted">
                      {formatShortDate(payment.paid_at, 'fr')}
                    </Td>
                    <Td className="text-[0.8125rem]">
                      {payment.client_id ? (
                        <Link
                          href={`/espace-admin/clients/${payment.client_id}`}
                          className="text-fg-muted transition-colors hover:text-accent"
                        >
                          {payment.client_name}
                        </Link>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                      {payment.project_title && (
                        <span className="block text-[0.6875rem] text-fg-subtle">{payment.project_title}</span>
                      )}
                    </Td>
                    <Td>
                      {payment.invoice_id ? (
                        <Link
                          href={`/espace-admin/factures/${payment.invoice_id}`}
                          className="font-mono text-[0.75rem] text-accent hover:underline"
                        >
                          {payment.invoice_number}
                        </Link>
                      ) : (
                        <span className="text-[0.6875rem] text-fg-subtle">hors facture</span>
                      )}
                    </Td>
                    <Td alignment="center">
                      <Badge tone="outline">{paymentMethodLabel(payment.method)}</Badge>
                    </Td>
                    <Td className="text-[0.75rem] text-fg-muted">
                      <span className="flex items-center gap-2">
                        {payment.reference ?? '—'}
                        <DemoBadge when={payment.is_demo} />
                      </span>
                    </Td>
                    <Td alignment="center">
                      <Badge tone={STATUS_TONES[payment.status] ?? 'neutral'}>
                        {STATUS_LABELS[payment.status] ?? payment.status}
                      </Badge>
                    </Td>
                    <Td alignment="end" className="whitespace-nowrap font-medium tabular-nums">
                      <span className={payment.status === 'refunded' ? 'text-danger' : 'text-fg'}>
                        {payment.status === 'refunded' ? '− ' : ''}
                        {formatMoney(payment.amount, payment.currency)}
                      </span>
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
