import Link from 'next/link';
import { BookOpen, ExternalLink, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { TableWrap, Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table';
import { PageHeader, SummaryStrip, ListEmpty, DemoBadge } from '@/components/admin/page-kit';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { listCaseStudies } from '@/lib/db/repositories/content';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Études de cas' };

const STATUS_TONES: Record<string, 'success' | 'neutral' | 'outline'> = {
  published: 'success',
  draft: 'neutral',
  archived: 'outline',
};

const STATUS_LABELS: Record<string, string> = {
  published: 'Publiée',
  draft: 'Brouillon',
  archived: 'Archivée',
};

export default async function CaseStudiesPage() {
  const user = await requirePermission('case_studies.view');
  const studies = listCaseStudies({ status: 'all', limit: 200 });

  const count = (status: string) => studies.filter((study) => study.status === status).length;

  return (
    <>
      <PageHeader
        title="Études de cas"
        description="Le récit détaillé d’une mission : le problème, la démarche, le résultat. Plus long qu’une fiche portfolio, et destiné à convaincre."
        actions={
          <>
            <Link
              href="/etudes-de-cas"
              target="_blank"
              rel="noreferrer"
              className={buttonClass('secondary', 'sm')}
            >
              <ExternalLink className="size-3.5" />
              Voir la page publique
            </Link>
            {can(user, 'case_studies.create') && (
              <Link href="/espace-admin/etudes-de-cas/nouveau" className={buttonClass('primary', 'sm')}>
                <Plus className="size-4" />
                Nouvelle étude
              </Link>
            )}
          </>
        }
      />

      <SummaryStrip
        items={[
          { label: 'Publiées', value: count('published') },
          { label: 'Brouillons', value: count('draft') },
          { label: 'Archivées', value: count('archived') },
          { label: 'Total', value: studies.length },
        ]}
      />

      <div className="mt-5">
        {studies.length === 0 ? (
          <ListEmpty
            icon={<BookOpen className="size-5" />}
            title="Aucune étude de cas"
            description="Une étude de cas reprend un projet du portfolio et raconte comment il a été mené. C’est le contenu qui convertit le mieux."
            actionHref={can(user, 'case_studies.create') ? '/espace-admin/etudes-de-cas/nouveau' : undefined}
            actionLabel="Nouvelle étude"
          />
        ) : (
          <TableWrap>
            <Table>
              <Thead>
                <tr>
                  <Th>Étude</Th>
                  <Th alignment="center">Statut</Th>
                  <Th alignment="center">Chiffres</Th>
                  <Th alignment="center">Lecture</Th>
                  <Th alignment="end">Publication</Th>
                </tr>
              </Thead>
              <Tbody>
                {studies.map((study) => (
                  <Tr key={study.id}>
                    <Td>
                      <Link href={`/espace-admin/etudes-de-cas/${study.id}`} className="group block min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-medium text-fg group-hover:text-accent">{study.title}</span>
                          <DemoBadge when={study.is_demo} />
                        </span>
                        {study.subtitle && (
                          <span className="line-clamp-1 text-[0.6875rem] text-fg-subtle">{study.subtitle}</span>
                        )}
                      </Link>
                    </Td>
                    <Td alignment="center">
                      <Badge tone={STATUS_TONES[study.status] ?? 'neutral'}>
                        {STATUS_LABELS[study.status] ?? study.status}
                      </Badge>
                    </Td>
                    <Td alignment="center" className="tabular-nums text-[0.75rem] text-fg-muted">
                      {study.metricList.length > 0 ? study.metricList.length : '—'}
                    </Td>
                    <Td alignment="center" className="whitespace-nowrap text-[0.75rem] text-fg-muted">
                      {study.reading_minutes ? `${study.reading_minutes} min` : '—'}
                    </Td>
                    <Td alignment="end" className="whitespace-nowrap text-[0.75rem] text-fg-muted">
                      {study.published_at ? study.published_at.slice(0, 10) : <span className="text-fg-subtle">—</span>}
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
