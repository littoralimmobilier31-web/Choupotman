import { PageHeader } from '@/components/admin/page-kit';
import { ContentEditor } from '@/components/admin/content-editor';
import { requirePermission } from '@/lib/auth/guard';
import { getCsrfToken } from '@/lib/auth/csrf';
import { caseStudyForm, emptyValues } from '@/lib/content-forms';
import { listPortfolio } from '@/lib/db/repositories/content';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Nouvelle étude de cas' };

export default async function NewCaseStudyPage() {
  await requirePermission('case_studies.create');
  const csrf = (await getCsrfToken()) ?? '';

  const sections = caseStudyForm({
    portfolioEntries: listPortfolio({ status: 'all', limit: 200 }).map((project) => ({
      value: String(project.id),
      label: project.title,
    })),
  });

  return (
    <>
      <PageHeader
        title="Nouvelle étude de cas"
        description="Racontez la mission dans l’ordre : le problème, les objectifs, la stratégie, ce qui a été livré, ce que ça a produit."
        backHref="/espace-admin/etudes-de-cas"
        backLabel="Études de cas"
      />

      <ContentEditor
        csrf={csrf}
        sections={sections}
        values={emptyValues(sections)}
        endpoint="/api/etudes-de-cas"
        method="POST"
        listHref="/espace-admin/etudes-de-cas"
        redirectTo={(payload) => `/espace-admin/etudes-de-cas/${payload.id}`}
        footnote="Les résultats chiffrés sont affichés tels quels : n’indiquez que des chiffres que vous pouvez justifier."
      />
    </>
  );
}
