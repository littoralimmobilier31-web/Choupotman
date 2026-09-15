import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { PageHeader, DemoBadge } from '@/components/admin/page-kit';
import { ContentEditor } from '@/components/admin/content-editor';
import { MediaGallery } from '@/components/admin/media-gallery';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import { portfolioForm, valuesFrom } from '@/lib/content-forms';
import { findPortfolio, listCategories, listPortfolioMedia } from '@/lib/db/repositories/content';
import { clientOptions } from '@/lib/db/repositories/clients';
import { projectOptions } from '@/lib/db/repositories/projects';

export const dynamic = 'force-dynamic';

const STATUS_TONES: Record<string, 'success' | 'neutral' | 'outline'> = {
  published: 'success',
  draft: 'neutral',
  archived: 'outline',
};

const STATUS_LABELS: Record<string, string> = {
  published: 'Publié',
  draft: 'Brouillon',
  archived: 'Archivé',
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const project = findPortfolio(Number((await params).id));
  return { title: project ? project.title : 'Réalisation' };
}

export default async function EditPortfolioPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('portfolio.view');
  const id = Number((await params).id);
  const project = findPortfolio(id);
  if (!Number.isInteger(id) || !project) notFound();

  const csrf = (await getCsrfToken()) ?? '';

  const sections = portfolioForm({
    categories: listCategories('portfolio').map((category) => ({
      value: String(category.id),
      label: category.name,
    })),
    clients: clientOptions().map((client) => ({ value: String(client.id), label: client.label })),
    projects: projectOptions().map((project) => ({ value: String(project.id), label: project.label })),
  });

  /**
   * The JSON columns are hydrated into `technologyList`, `linkList`… by the
   * repository, so the form is fed from those rather than from the raw text.
   */
  const values = valuesFrom(sections, project as unknown as Record<string, unknown>, {
    technologies: project.technologyList,
    services_done: project.serviceList,
    links: project.linkList,
    videos: project.videoList,
    metrics: project.metricList,
  });

  return (
    <>
      <PageHeader
        title={project.title}
        description={`Créé le ${project.created_at.slice(0, 10)} · ${project.view_count} vue${project.view_count === 1 ? '' : 's'} sur le site`}
        backHref="/espace-admin/portfolio"
        backLabel="Portfolio"
        badges={
          <>
            <Badge tone={STATUS_TONES[project.status] ?? 'neutral'}>
              {STATUS_LABELS[project.status] ?? project.status}
            </Badge>
            <DemoBadge when={project.is_demo} />
          </>
        }
      />

      <ContentEditor
        csrf={csrf}
        sections={sections}
        values={values}
        endpoint={`/api/portfolio/${id}`}
        method="PATCH"
        deleteEndpoint={`/api/portfolio/${id}`}
        forceDeleteEndpoint={`/api/portfolio/${id}?force=1`}
        listHref="/espace-admin/portfolio"
        publicHref={project.status === 'published' ? `/projets/${project.slug}` : undefined}
        canDelete={can(user, 'portfolio.delete')}
        deleteWarning="La réalisation, ses médias et ses traductions seront effacés. Cette action est irréversible."
      />

      <div className="mt-6">
        <MediaGallery
          csrf={csrf}
          endpoint={`/api/portfolio/${id}/medias`}
          items={listPortfolioMedia(id)}
          canEdit={can(user, 'portfolio.update')}
        />
      </div>
    </>
  );
}
