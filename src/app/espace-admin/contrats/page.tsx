import Link from 'next/link';
import { FileSignature, Plus } from 'lucide-react';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { TableWrap, Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table';
import { PageHeader, SummaryStrip, ListEmpty, Section, DemoBadge } from '@/components/admin/page-kit';
import { ContractTemplateManager } from '@/components/admin/contract-templates';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import { listContractTemplates, listContracts } from '@/lib/db/repositories/finance';
import { templateVariables } from '@/lib/db/repositories/comms';
import { TEMPLATE_VARIABLE_HELP } from '@/lib/mail/templates';
import { formatMoney, formatShortDate } from '@/lib/i18n/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Contrats' };

const STATUS_TONES: Record<string, BadgeTone> = {
  draft: 'neutral',
  sent: 'info',
  signed: 'success',
  cancelled: 'outline',
};

const STATUS_LABELS: Record<string, string> = {
  draft: 'Brouillon',
  sent: 'Envoyé',
  signed: 'Signé',
  cancelled: 'Annulé',
};

export default async function ContractsPage({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string }>;
}) {
  const user = await requirePermission('contracts.view');
  const query = await searchParams;
  const csrf = (await getCsrfToken()) ?? '';

  const contracts = listContracts({ status: query.statut || undefined, limit: 200 });
  const all = listContracts({ limit: 500 });
  const count = (status: string) => all.filter((contract) => contract.status === status).length;

  return (
    <>
      <PageHeader
        title="Contrats"
        description="Engagements de prestation, établis depuis un modèle. Le texte est figé à la création : modifier un modèle ne réécrit aucun contrat existant."
        actions={
          can(user, 'contracts.create') && (
            <Link href="/espace-admin/contrats/nouveau" className={buttonClass('primary', 'sm')}>
              <Plus className="size-4" />
              Nouveau contrat
            </Link>
          )
        }
      />

      <SummaryStrip
        items={[
          { label: 'Signés', value: count('signed'), href: '/espace-admin/contrats?statut=signed' },
          { label: 'Envoyés', value: count('sent'), href: '/espace-admin/contrats?statut=sent' },
          { label: 'Brouillons', value: count('draft'), href: '/espace-admin/contrats?statut=draft' },
          { label: 'Total', value: all.length, href: '/espace-admin/contrats' },
        ]}
      />

      <div className="mt-5 space-y-8">
        {contracts.length === 0 ? (
          <ListEmpty
            icon={<FileSignature className="size-5" />}
            title="Aucun contrat"
            description="Un contrat écrit évite la plupart des désaccords sur le périmètre et les délais. Créez un modèle une fois, puis un contrat en deux minutes par projet."
            actionHref={can(user, 'contracts.create') ? '/espace-admin/contrats/nouveau' : undefined}
            actionLabel="Nouveau contrat"
          />
        ) : (
          <TableWrap>
            <Table>
              <Thead>
                <tr>
                  <Th>Contrat</Th>
                  <Th>Client</Th>
                  <Th>Projet</Th>
                  <Th alignment="center">Statut</Th>
                  <Th>Date</Th>
                  <Th alignment="end">Montant</Th>
                </tr>
              </Thead>
              <Tbody>
                {contracts.map((contract) => (
                  <Tr key={contract.id}>
                    <Td>
                      <Link href={`/espace-admin/contrats/${contract.id}`} className="group block min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="font-mono text-[0.75rem] text-fg-muted">{contract.number}</span>
                          <DemoBadge when={contract.is_demo} />
                        </span>
                        <span className="block truncate font-medium text-fg group-hover:text-accent">
                          {contract.title}
                        </span>
                      </Link>
                    </Td>
                    <Td className="text-[0.8125rem] text-fg-muted">
                      {contract.client_id ? (
                        <Link
                          href={`/espace-admin/clients/${contract.client_id}`}
                          className="transition-colors hover:text-accent"
                        >
                          {contract.client_name}
                        </Link>
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </Td>
                    <Td className="text-[0.8125rem] text-fg-muted">
                      {contract.project_title ?? <span className="text-fg-subtle">—</span>}
                    </Td>
                    <Td alignment="center">
                      <Badge tone={STATUS_TONES[contract.status] ?? 'neutral'}>
                        {STATUS_LABELS[contract.status] ?? contract.status}
                      </Badge>
                    </Td>
                    <Td className="whitespace-nowrap text-[0.75rem] text-fg-muted">
                      {contract.signed_at
                        ? `signé le ${formatShortDate(contract.signed_at.slice(0, 10), 'fr')}`
                        : formatShortDate(contract.issue_date, 'fr')}
                    </Td>
                    <Td alignment="end" className="whitespace-nowrap tabular-nums">
                      {contract.amount > 0 ? formatMoney(contract.amount, contract.currency) : '—'}
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableWrap>
        )}

        {can(user, 'contracts.update') && (
          <Section
            title="Modèles de contrat"
            description="Les variables entre doubles accolades sont remplacées une seule fois, au moment où le contrat est établi."
          >
            <ContractTemplateManager
              csrf={csrf}
              variableHelp={TEMPLATE_VARIABLE_HELP}
              templates={listContractTemplates().map((template) => ({
                id: template.id,
                name: template.name,
                description: template.description,
                body: template.body,
                locale: template.locale,
                is_default: template.is_default,
                variables: templateVariables(template.body),
              }))}
            />
          </Section>
        )}
      </div>
    </>
  );
}
