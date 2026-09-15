import { PageHeader } from '@/components/admin/page-kit';
import { ContentEditor } from '@/components/admin/content-editor';
import { requirePermission } from '@/lib/auth/guard';
import { getCsrfToken } from '@/lib/auth/csrf';
import { emptyValues, postForm } from '@/lib/content-forms';
import { listCategories } from '@/lib/db/repositories/content';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Nouvel article' };

export default async function NewPostPage() {
  await requirePermission('blog.create');
  const csrf = (await getCsrfToken()) ?? '';

  const sections = postForm({
    categories: listCategories('blog').map((category) => ({
      value: String(category.id),
      label: category.name,
    })),
  });

  return (
    <>
      <PageHeader
        title="Nouvel article"
        description="Un article reste en brouillon jusqu’à ce que vous passiez son statut à « Publié »."
        backHref="/espace-admin/blog"
        backLabel="Blog"
      />

      <ContentEditor
        csrf={csrf}
        sections={sections}
        values={emptyValues(sections)}
        endpoint="/api/blog"
        method="POST"
        listHref="/espace-admin/blog"
        redirectTo={(payload) => `/espace-admin/blog/${payload.id}`}
      />
    </>
  );
}
