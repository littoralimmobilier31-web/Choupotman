import { createHandler, list, ok } from '@/lib/api/handler';
import { postSchema } from '@/lib/validation/admin';
import { countPosts, createPost, listPosts } from '@/lib/db/repositories/content';
import { revalidatePublic } from '@/lib/revalidate';
import type { PublishStatus } from '@/lib/db/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createHandler({ permission: 'blog.view' }, async ({ request }) => {
  const url = new URL(request.url);
  const page = Math.max(1, Number(url.searchParams.get('page') ?? 1) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get('taille') ?? 30) || 30));

  const filter = {
    status: (url.searchParams.get('statut') as PublishStatus | 'all') ?? 'all',
    categoryId: Number(url.searchParams.get('categorie')) || undefined,
    tag: url.searchParams.get('tag') ?? undefined,
    search: url.searchParams.get('q') ?? undefined,
  };

  return list(listPosts({ ...filter, limit: pageSize, offset: (page - 1) * pageSize }), {
    total: countPosts(filter),
    page,
    pageSize,
  });
});

export const POST = createHandler(
  { permission: 'blog.create', schema: postSchema },
  async ({ body, user, log }) => {
    const id = createPost({
      title: body.title,
      slug: body.slug || undefined,
      excerpt: body.excerpt ?? null,
      content: body.content ?? null,
      cover_url: body.cover_url ?? null,
      // The signed-in account owns the article; `author_name` is only the byline.
      author_id: user.id,
      author_name: body.author_name ?? null,
      category_id: body.category_id ?? null,
      status: body.status,
      locale: body.locale,
      seo_title: body.seo_title ?? null,
      seo_description: body.seo_description ?? null,
      is_featured: body.is_featured,
      tags: body.tags,
    });

    log({
      action: 'create',
      entityType: 'post',
      entityId: id,
      entityLabel: body.title,
      summary: `Article créé : ${body.title}`,
    });

    revalidatePublic('blog');
    return ok({ id }, 201);
  },
);
