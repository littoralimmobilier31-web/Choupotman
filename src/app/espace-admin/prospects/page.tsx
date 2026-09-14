import Link from 'next/link';
import { Target } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { TableWrap, Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table';
import { PageHeader, ListEmpty, DemoBadge } from '@/components/admin/page-kit';
import { ListFilters } from '@/components/admin/list-filters';
import { ViewSwitch } from '@/components/admin/view-switch';
import { LeadPipeline } from '@/components/admin/lead-pipeline';
import { LeadConvertButton } from '@/components/admin/lead-convert';
import { StatTile } from '@/components/charts';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import {
  LEAD_STAGES, getPipeline, getPipelineStats, leadSources, listLeads, stageLabel,
} from '@/lib/db/repositories/leads';
import { getSetting } from '@/lib/db/repositories/settings';
import { formatMoney, formatRelative } from '@/lib/i18n/format';
import type { LeadStage } from '@/lib/db/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Prospects' };

const STAGE_TONES: Record<string, 'neutral' | 'info' | 'brand' | 'warning' | 'success' | 'danger'> = {
  new: 'neutral', contacted: 'info', qualified: 'brand', proposal: 'warning',
  negotiation: 'warning', won: 'success', lost: 'danger',
};

export default async function LeadsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; etape?: string; source?: string; vue?: string }>;
}) {
  const user = await requirePermission('leads.view');
  const query = await searchParams;
  const csrf = (await getCsrfToken()) ?? '';

  const view = query.vue === 'liste' ? 'liste' : 'pipeline';
  const currency = getSetting('finance.currency', 'DZD');
  const stats = getPipelineStats();
  const sources = leadSources();

  const canUpdate = can(user, 'leads.update');
  const canCreate = can(user, 'leads.create');
  const canConvert = can(user, 'clients.create');

  return (
    <>
      <PageHeader
        title="Prospects"
        description="Toutes les demandes entrantes deviennent un prospect. Faites-les avancer d’une étape à l’autre jusqu’à la conversion en client."
      />

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Pipeline ouvert"
          value={stats.open}
          hint={`${formatMoney(stats.potentialValue, currency)} de potentiel`}
        />
        <StatTile label="Qualifiés" value={stats.qualified} hint="qualifié, proposition ou négociation" />
        <StatTile
          label="Taux de conversion"
          value={`${stats.conversionRate} %`}
          hint={`${stats.won} gagné(s) · ${stats.lost} perdu(s)`}
        />
        <StatTile
          label="Gagné"
          value={formatMoney(stats.wonValue, currency)}
          hint={stats.won > 0 ? `panier moyen ${formatMoney(stats.averageDealValue, currency)}` : 'aucun encore'}
        />
      </div>

      <ListFilters
        searchPlaceholder="Nom, société, email, besoin…"
        selects={[
          ...(view === 'liste'
            ? [
                {
                  key: 'etape',
                  label: 'Étape',
                  allLabel: 'Toutes les étapes',
                  options: [
                    { value: 'open', label: 'En cours' },
                    ...LEAD_STAGES.map((stage) => ({ value: stage.key, label: stage.label })),
                  ],
                },
              ]
            : []),
          ...(sources.length > 1
            ? [
                {
                  key: 'source',
                  label: 'Source',
                  allLabel: 'Toutes les sources',
                  options: sources.map((entry) => ({
                    value: entry.source,
                    label: entry.source,
                    count: entry.count,
                  })),
                },
              ]
            : []),
        ]}
      >
        <ViewSwitch
          paramKey="vue"
          options={[
            { value: 'pipeline', label: 'Pipeline' },
            { value: 'liste', label: 'Liste' },
          ]}
          defaultValue="pipeline"
        />
      </ListFilters>

      <div className="mt-5">
        {view === 'pipeline' ? (
          <LeadPipeline
            csrf={csrf}
            currency={currency}
            columns={filterPipeline(getPipeline(), query)}
            canUpdate={canUpdate}
            canCreate={canCreate}
          />
        ) : (
          <LeadTable
            leads={listLeads({
              search: query.q?.trim() || undefined,
              stage: (query.etape as LeadStage | 'all' | 'open') || undefined,
              source: query.source || undefined,
              limit: 300,
            })}
            csrf={csrf}
            canConvert={canConvert}
          />
        )}
      </div>
    </>
  );
}

/**
 * The board shows every stage, so search and source are applied to the cards
 * rather than the columns — the columns themselves must stay visible, otherwise
 * there is nowhere to drop a card.
 */
function filterPipeline(
  columns: ReturnType<typeof getPipeline>,
  query: { q?: string; source?: string },
): ReturnType<typeof getPipeline> {
  const term = query.q?.trim().toLowerCase();
  if (!term && !query.source) return columns;

  return columns.map((column) => {
    const leads = column.leads.filter((lead) => {
      if (query.source && lead.source !== query.source) return false;
      if (!term) return true;
      return [lead.name, lead.company, lead.email, lead.message, lead.service_interest]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(term));
    });
    return {
      ...column,
      leads,
      count: leads.length,
      value: Math.round(leads.reduce((acc, lead) => acc + lead.estimated_value, 0) * 100) / 100,
    };
  });
}

function LeadTable({
  leads,
  csrf,
  canConvert,
}: {
  leads: ReturnType<typeof listLeads>;
  csrf: string;
  canConvert: boolean;
}) {
  if (leads.length === 0) {
    return (
      <ListEmpty
        icon={<Target className="size-5" />}
        title="Aucun prospect"
        description="Les demandes envoyées depuis le site public arrivent ici automatiquement."
      />
    );
  }

  return (
    <TableWrap>
      <Table>
        <Thead>
          <tr>
            <Th>Prospect</Th>
            <Th alignment="center">Étape</Th>
            <Th alignment="center">Score</Th>
            <Th alignment="end">Valeur estimée</Th>
            <Th>Source</Th>
            <Th>Reçu</Th>
            <Th alignment="end">Action</Th>
          </tr>
        </Thead>
        <Tbody>
          {leads.map((lead) => (
            <Tr key={lead.id}>
              <Td>
                <span className="flex items-center gap-2">
                  <span className="font-medium text-fg">{lead.name}</span>
                  <DemoBadge when={lead.is_demo} />
                </span>
                <span className="block text-[0.6875rem] text-fg-subtle">
                  {[lead.company, lead.email, lead.phone].filter(Boolean).join(' · ') || '—'}
                </span>
                {lead.service_interest && (
                  <span className="block text-[0.6875rem] text-fg-muted">{lead.service_interest}</span>
                )}
              </Td>
              <Td alignment="center">
                <Badge tone={STAGE_TONES[lead.stage] ?? 'neutral'}>{stageLabel(lead.stage)}</Badge>
                {lead.stage === 'lost' && lead.lost_reason && (
                  <span className="mt-1 block text-[0.625rem] text-fg-subtle">{lead.lost_reason}</span>
                )}
              </Td>
              <Td alignment="center" className="tabular-nums">
                {lead.score}
              </Td>
              <Td alignment="end" className="tabular-nums">
                {lead.estimated_value > 0 ? formatMoney(lead.estimated_value, lead.currency) : '—'}
              </Td>
              <Td className="text-[0.75rem] text-fg-muted">{lead.source}</Td>
              <Td className="whitespace-nowrap text-[0.75rem] text-fg-muted">
                {formatRelative(lead.created_at, 'fr')}
              </Td>
              <Td alignment="end">
                {lead.client_id !== null ? (
                  <Link
                    href={`/espace-admin/clients/${lead.client_id}`}
                    className="text-[0.75rem] font-semibold text-accent hover:underline"
                  >
                    Voir le client
                  </Link>
                ) : (
                  <LeadConvertButton
                    csrf={csrf}
                    leadId={lead.id}
                    leadName={lead.company ?? lead.name}
                    estimatedValue={lead.estimated_value}
                    currency={lead.currency}
                    enabled={canConvert}
                  />
                )}
              </Td>
            </Tr>
          ))}
        </Tbody>
      </Table>
    </TableWrap>
  );
}
