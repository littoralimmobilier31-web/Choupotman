import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { PageHeader, DemoBadge } from '@/components/admin/page-kit';
import { ContentEditor } from '@/components/admin/content-editor';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import { caseStudyForm, valuesFrom } from '@/lib/content-forms';
import { findCaseStudy, listPortfolio } from '@/lib/db/repositories/content';

export const dynamic = 'force-dynamic';

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

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const study = findCaseStudy(Number((await params).id));
  return { title: study ? study.title : 'Étude de cas' };
}

export default async function EditCaseStudyPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('case_studies.view');
  const id = Number((await params).id);
  const study = findCaseStudy(id);
  if (!Number.isInteger(id) || !study) notFound();

  const csrf = (await getCsrfToken()) ?? '';

  const sections = caseStudyForm({
    portfolioEntries: listPortfolio({ status: 'all', limit: 200 }).map((project) => ({
      value: String(project.id),
      label: project.title,
    })),
  });

  const values = valuesFrom(sections, study as unknown as Record<string, unknown>, {
    metrics: study.metricList,
  });

  return (
    <>
      <PageHeader
        title={study.title}
        description={
          [
            study.reading_minutes ? `${study.reading_minutes} min de lecture` : null,
            study.published_at ? `publiée le ${study.published_at.slice(0, 10)}` : 'jamais publiée',
          ]
            .filter(Boolean)
            .join(' · ')
        }
        backHref="/espace-admin/etudes-de-cas"
        backLabel="Études de cas"
        badges={
          <>
            <Badge tone={STATUS_TONES[study.status] ?? 'neutral'}>
              {STATUS_LABELS[study.status] ?? study.status}
            </Badge>
            <DemoBadge when={study.is_demo} />
          </>
        }
      />

      <ContentEditor
        csrf={csrf}
        sections={sections}
        values={values}
        endpoint={`/api/etudes-de-cas/${id}`}
        method="PATCH"
        deleteEndpoint={`/api/etudes-de-cas/${id}`}
        forceDeleteEndpoint={`/api/etudes-de-cas/${id}?force=1`}
        listHref="/espace-admin/etudes-de-cas"
        publicHref={study.status === 'published' ? `/etudes-de-cas/${study.slug}` : undefined}
        canDelete={can(user, 'case_studies.delete')}
        deleteWarning="L’étude de cas et ses traductions seront effacées. Cette action est irréversible."
      />
    </>
  );
}
