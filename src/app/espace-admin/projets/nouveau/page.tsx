import { PageHeader } from '@/components/admin/page-kit';
import { ProjectForm } from '@/components/admin/project-form';
import { requirePermission } from '@/lib/auth/guard';
import { getCsrfToken } from '@/lib/auth/csrf';
import { clientOptions } from '@/lib/db/repositories/clients';
import { listCategories } from '@/lib/db/repositories/content';
import { getSettingNumber, getSetting } from '@/lib/db/repositories/settings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Nouveau projet' };

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ client?: string; titre?: string }>;
}) {
  await requirePermission('projects.create');
  const csrf = await getCsrfToken();
  const query = await searchParams;

  const clients = clientOptions();
  const categories = listCategories('project');

  // Pre-fill from the query string so "New project" from a client page arrives
  // with that client already selected.
  const preselected = query.client ? clients.find((c) => String(c.id) === query.client) : undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Nouveau projet"
        description="Les étapes de production, les tâches de départ et les dossiers sont créés automatiquement."
        backHref="/espace-admin/projets"
        backLabel="Projets"
      />
      <ProjectForm
        csrf={csrf ?? ''}
        clients={clients}
        categories={categories.map((c) => ({ id: c.id, name: c.name }))}
        initial={{
          client_id: preselected ? String(preselected.id) : '',
          currency: preselected?.currency ?? getSetting('finance.currency', 'DZD'),
          title: query.titre ?? '',
          revisions_included: String(getSettingNumber('finance.default_revisions', 3)),
          revision_extra_cost: String(getSettingNumber('finance.revision_extra_cost', 0)),
        }}
      />
    </div>
  );
}
