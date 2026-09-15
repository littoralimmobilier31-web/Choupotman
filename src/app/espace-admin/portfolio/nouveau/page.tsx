import { PageHeader } from '@/components/admin/page-kit';
import { ContentEditor } from '@/components/admin/content-editor';
import { requirePermission } from '@/lib/auth/guard';
import { getCsrfToken } from '@/lib/auth/csrf';
import { emptyValues, portfolioForm } from '@/lib/content-forms';
import { listCategories } from '@/lib/db/repositories/content';
import { clientOptions } from '@/lib/db/repositories/clients';
import { projectOptions } from '@/lib/db/repositories/projects';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Nouvelle réalisation' };

export default async function NewPortfolioPage() {
  await requirePermission('portfolio.create');
  const csrf = (await getCsrfToken()) ?? '';

  const sections = portfolioForm({
    categories: listCategories('portfolio').map((category) => ({
      value: String(category.id),
      label: category.name,
    })),
    clients: clientOptions().map((client) => ({ value: String(client.id), label: client.label })),
    projects: projectOptions().map((project) => ({ value: String(project.id), label: project.label })),
  });

  return (
    <>
      <PageHeader
        title="Nouvelle réalisation"
        description="Le projet reste invisible sur le site tant que son statut est « Brouillon »."
        backHref="/espace-admin/portfolio"
        backLabel="Portfolio"
      />

      <ContentEditor
        csrf={csrf}
        sections={sections}
        values={emptyValues(sections)}
        endpoint="/api/portfolio"
        method="POST"
        listHref="/espace-admin/portfolio"
        redirectTo={(payload) => `/espace-admin/portfolio/${payload.id}`}
        footnote="Les champs laissés vides ne sont pas affichés sur la page publique : aucune section n’est remplie à votre place."
      />
    </>
  );
}
