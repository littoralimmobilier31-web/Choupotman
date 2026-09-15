import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { PageHeader, DetailGrid, DemoBadge } from '@/components/admin/page-kit';
import { ContractControls } from '@/components/admin/contract-controls';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import { findContract } from '@/lib/db/repositories/finance';
import { formatMoney, formatShortDate } from '@/lib/i18n/format';

export const dynamic = 'force-dynamic';

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

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const contract = findContract(Number((await params).id));
  return { title: contract ? `${contract.number} — ${contract.title}` : 'Contrat' };
}

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('contracts.view');
  const id = Number((await params).id);
  const contract = findContract(id);
  if (!Number.isInteger(id) || !contract) notFound();

  const csrf = (await getCsrfToken()) ?? '';

  return (
    <>
      <PageHeader
        title={contract.title}
        description={`Contrat ${contract.number}`}
        backHref="/espace-admin/contrats"
        backLabel="Contrats"
        badges={
          <>
            <Badge tone={STATUS_TONES[contract.status] ?? 'neutral'}>
              {STATUS_LABELS[contract.status] ?? contract.status}
            </Badge>
            <DemoBadge when={contract.is_demo} />
          </>
        }
      />

      <DetailGrid
        items={[
          {
            label: 'Client',
            value: contract.client_id ? (
              <Link href={`/espace-admin/clients/${contract.client_id}`} className="hover:text-accent">
                {contract.client_name}
              </Link>
            ) : (
              '—'
            ),
          },
          {
            label: 'Projet',
            value: contract.project_id ? (
              <Link href={`/espace-admin/projets/${contract.project_id}`} className="hover:text-accent">
                {contract.project_title}
              </Link>
            ) : (
              '—'
            ),
          },
          { label: 'Montant', value: contract.amount > 0 ? formatMoney(contract.amount, contract.currency) : '—' },
          { label: 'Établi le', value: formatShortDate(contract.issue_date, 'fr') },
          {
            label: 'Début',
            value: contract.start_date ? formatShortDate(contract.start_date, 'fr') : '—',
          },
          {
            label: 'Livraison',
            value: contract.delivery_date ? formatShortDate(contract.delivery_date, 'fr') : '—',
          },
          {
            label: 'Signé le',
            value: contract.signed_at ? formatShortDate(contract.signed_at.slice(0, 10), 'fr') : 'pas encore',
          },
        ]}
      />

      <div className="mt-6">
        <ContractControls
          csrf={csrf}
          contractId={id}
          number={contract.number}
          status={contract.status}
          title={contract.title}
          body={contract.body}
          amount={contract.amount}
          currency={contract.currency}
          canUpdate={can(user, 'contracts.update')}
          canDelete={can(user, 'contracts.delete')}
        />
      </div>

      {contract.status === 'signed' && (
        <Card className="mt-4">
          <CardBody>
            <p className="text-[0.8125rem] leading-relaxed text-fg-muted">
              Ce contrat est signé : son texte et son montant sont figés. Pour formaliser un changement, établissez
              un nouveau contrat faisant référence à celui-ci — c’est ce qui permet de savoir, plus tard, ce qui
              avait été convenu et quand.
            </p>
          </CardBody>
        </Card>
      )}
    </>
  );
}
