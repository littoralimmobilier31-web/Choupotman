import Link from 'next/link';
import { Building2, Mail, Phone, Plus, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { Avatar } from '@/components/ui/misc';
import { TableWrap, Table, Thead, Th, Tbody, Tr, Td, TableEmpty } from '@/components/ui/table';
import { PageHeader, SummaryStrip, ListEmpty, DemoBadge } from '@/components/admin/page-kit';
import { ListFilters } from '@/components/admin/list-filters';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { clientCountries, countClients, listClients } from '@/lib/db/repositories/clients';
import { formatMoney, formatRelative } from '@/lib/i18n/format';
import type { ClientStatus } from '@/lib/db/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Clients' };

const STATUS_LABELS: Record<string, string> = {
  active: 'Actif',
  inactive: 'Inactif',
  archived: 'Archivé',
};

const STATUS_TONES: Record<string, 'success' | 'neutral' | 'outline'> = {
  active: 'success',
  inactive: 'neutral',
  archived: 'outline',
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string; pays?: string; tri?: string }>;
}) {
  const user = await requirePermission('clients.view');
  const query = await searchParams;

  const clients = listClients({
    search: query.q?.trim() || undefined,
    status: (query.statut as ClientStatus | 'all') || undefined,
    country: query.pays || undefined,
    sort: (query.tri as 'name' | 'recent' | 'revenue') || 'name',
    limit: 200,
  });

  const countries = clientCountries();
  const totalRevenue = clients.reduce((acc, client) => acc + client.total_revenue, 0);
  const totalOutstanding = clients.reduce((acc, client) => acc + client.outstanding, 0);

  return (
    <>
      <PageHeader
        title="Clients"
        description="Fiche complète par client : projets, chiffre d’affaires, factures et historique."
        actions={
          can(user, 'clients.create') && (
            <Link href="/espace-admin/clients/nouveau" className={buttonClass('primary', 'sm')}>
              <Plus className="size-4" />
              Nouveau client
            </Link>
          )
        }
      />

      <SummaryStrip
        items={[
          { label: 'Total', value: countClients({ status: 'all' }) },
          { label: 'Actifs', value: countClients({ status: 'active' }) },
          { label: 'CA encaissé', value: formatMoney(totalRevenue, 'DZD') },
          { label: 'En attente', value: formatMoney(totalOutstanding, 'DZD') },
        ]}
      />

      <ListFilters
        searchPlaceholder="Nom, entreprise, email, téléphone…"
        resultCount={clients.length}
        selects={[
          {
            key: 'statut',
            label: 'Statut',
            allLabel: 'Tous les statuts',
            options: [
              { value: 'active', label: 'Actif' },
              { value: 'inactive', label: 'Inactif' },
              { value: 'archived', label: 'Archivé' },
              { value: 'all', label: 'Tous (archives incluses)' },
            ],
          },
          ...(countries.length > 0
            ? [
                {
                  key: 'pays',
                  label: 'Pays',
                  allLabel: 'Tous les pays',
                  options: countries.map((country) => ({ value: country, label: country })),
                },
              ]
            : []),
          {
            key: 'tri',
            label: 'Trier',
            allLabel: 'Tri : nom',
            options: [
              { value: 'recent', label: 'Tri : plus récents' },
              { value: 'revenue', label: 'Tri : chiffre d’affaires' },
            ],
          },
        ]}
      />

      <div className="mt-5">
        {clients.length === 0 ? (
          <ListEmpty
            icon={<Users className="size-5" />}
            title="Aucun client"
            description="Créez votre première fiche client, ou convertissez un prospect depuis le pipeline commercial."
            actionHref={can(user, 'clients.create') ? '/espace-admin/clients/nouveau' : undefined}
            actionLabel="Nouveau client"
          />
        ) : (
          <TableWrap>
            <Table>
              <Thead>
                <tr>
                  <Th>Client</Th>
                  <Th>Contact</Th>
                  <Th alignment="center">Projets</Th>
                  <Th alignment="end">CA encaissé</Th>
                  <Th alignment="end">En attente</Th>
                  <Th>Dernière activité</Th>
                  <Th alignment="center">Statut</Th>
                </tr>
              </Thead>
              <Tbody>
                {clients.length === 0 && <TableEmpty colSpan={7}>Aucun résultat.</TableEmpty>}
                {clients.map((client) => (
                  <Tr key={client.id}>
                    <Td>
                      <Link
                        href={`/espace-admin/clients/${client.id}`}
                        className="group flex items-center gap-3"
                      >
                        <Avatar name={client.name} src={client.avatar_path} size={34} />
                        <span className="min-w-0">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-medium text-fg group-hover:text-accent">
                              {client.name}
                            </span>
                            <DemoBadge when={client.is_demo} />
                          </span>
                          {client.company && (
                            <span className="flex items-center gap-1 truncate text-[0.6875rem] text-fg-subtle">
                              <Building2 className="size-3 shrink-0" />
                              {client.company}
                            </span>
                          )}
                        </span>
                      </Link>
                    </Td>
                    <Td>
                      <div className="space-y-0.5">
                        {client.email && (
                          <a
                            href={`mailto:${client.email}`}
                            className="flex items-center gap-1.5 text-[0.75rem] text-fg-muted transition-colors hover:text-accent"
                          >
                            <Mail className="size-3 shrink-0" />
                            <span className="truncate">{client.email}</span>
                          </a>
                        )}
                        {client.phone && (
                          <a
                            href={`tel:${client.phone.replace(/\s/g, '')}`}
                            className="flex items-center gap-1.5 text-[0.75rem] text-fg-subtle transition-colors hover:text-accent"
                          >
                            <Phone className="size-3 shrink-0" />
                            {client.phone}
                          </a>
                        )}
                        {!client.email && !client.phone && <span className="text-fg-subtle">—</span>}
                      </div>
                    </Td>
                    <Td alignment="center">
                      <span className="tabular-nums">
                        {client.active_project_count > 0 ? (
                          <span className="font-semibold text-accent">{client.active_project_count}</span>
                        ) : (
                          <span className="text-fg-subtle">0</span>
                        )}
                        <span className="text-fg-subtle"> / {client.project_count}</span>
                      </span>
                    </Td>
                    <Td alignment="end" className="tabular-nums font-medium">
                      {client.total_revenue > 0 ? formatMoney(client.total_revenue, client.currency) : '—'}
                    </Td>
                    <Td alignment="end" className="tabular-nums">
                      {client.outstanding > 0 ? (
                        <span className="font-semibold text-warning">
                          {formatMoney(client.outstanding, client.currency)}
                        </span>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </Td>
                    <Td className="whitespace-nowrap text-[0.75rem] text-fg-subtle">
                      {client.last_activity_at ? formatRelative(client.last_activity_at, 'fr') : '—'}
                    </Td>
                    <Td alignment="center">
                      <Badge tone={STATUS_TONES[client.status] ?? 'neutral'}>
                        {STATUS_LABELS[client.status] ?? client.status}
                      </Badge>
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
