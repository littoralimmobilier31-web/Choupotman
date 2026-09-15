import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { PageHeader, DemoBadge } from '@/components/admin/page-kit';
import { ContentEditor } from '@/components/admin/content-editor';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import { postForm, valuesFrom } from '@/lib/content-forms';
import { findPost, listCategories } from '@/lib/db/repositories/content';

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
  const post = findPost(Number((await params).id));
  return { title: post ? post.title : 'Article' };
}

export default async function EditPostPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('blog.view');
  const id = Number((await params).id);
  const post = findPost(id);
  if (!Number.isInteger(id) || !post) notFound();

  const csrf = (await getCsrfToken()) ?? '';

  const sections = postForm({
    categories: listCategories('blog').map((category) => ({
      value: String(category.id),
      label: category.name,
    })),
  });

  const values = valuesFrom(sections, post as unknown as Record<string, unknown>, {
    tags: post.tags.map((tag) => tag.name),
  });

  return (
    <>
      <PageHeader
        title={post.title}
        description={[
          post.reading_minutes ? `${post.reading_minutes} min de lecture` : null,
          post.published_at ? `publié le ${post.published_at.slice(0, 10)}` : 'jamais publié',
          `${post.view_count} vue${post.view_count === 1 ? '' : 's'}`,
        ]
          .filter(Boolean)
          .join(' · ')}
        backHref="/espace-admin/blog"
        backLabel="Blog"
        badges={
          <>
            <Badge tone={STATUS_TONES[post.status] ?? 'neutral'}>
              {STATUS_LABELS[post.status] ?? post.status}
            </Badge>
            <DemoBadge when={post.is_demo} />
          </>
        }
      />

      <ContentEditor
        csrf={csrf}
        sections={sections}
        values={values}
        endpoint={`/api/blog/${id}`}
        method="PATCH"
        deleteEndpoint={`/api/blog/${id}`}
        forceDeleteEndpoint={`/api/blog/${id}?force=1`}
        listHref="/espace-admin/blog"
        publicHref={post.status === 'published' ? `/blog/${post.slug}` : undefined}
        canDelete={can(user, 'blog.delete')}
        deleteWarning="L’article, ses mots-clés et ses traductions seront effacés. Cette action est irréversible."
      />
    </>
  );
}
