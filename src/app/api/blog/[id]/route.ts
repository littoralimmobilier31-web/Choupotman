import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { postSchema, patchOf } from '@/lib/validation/admin';
import { deletePost, findPost, updatePost } from '@/lib/db/repositories/content';
import { revalidatePublic } from '@/lib/revalidate';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'blog.view' }, async () => {
    const post = findPost(id);
    if (!post) return notFound('Article introuvable.');
    return Response.json({ ok: true, post });
  })(request);
}

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'blog.update', schema: patchOf(postSchema) },
    async ({ body, log }) => {
      const before = findPost(id);
      if (!before) return notFound('Article introuvable.');

      updatePost(id, {
        title: body.title,
        slug: body.slug || undefined,
        excerpt: body.excerpt,
        content: body.content,
        cover_url: body.cover_url,
        author_name: body.author_name,
        category_id: body.category_id,
        status: body.status,
        locale: body.locale,
        seo_title: body.seo_title,
        seo_description: body.seo_description,
        is_featured: body.is_featured,
        tags: body.tags,
      });

      log({
        action: 'update',
        entityType: 'post',
        entityId: id,
        entityLabel: body.title ?? before.title,
        summary:
          body.status !== undefined && body.status !== before.status
            ? `Article « ${body.title ?? before.title} » : ${before.status} → ${body.status}`
            : `Article modifié : ${body.title ?? before.title}`,
      });

      revalidatePublic('blog');
      return ok({ id, post: findPost(id) });
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'blog.delete' }, async ({ request: req, log }) => {
    const post = findPost(id);
    if (!post) return notFound('Article introuvable.');

    /**
     * A published article has an address that may be linked or indexed.
     * Archiving takes it off the site and keeps the text; `?force=1` erases it.
     */
    const force = new URL(req.url).searchParams.get('force') === '1';
    if (!force && post.status !== 'archived') {
      updatePost(id, { status: 'archived' });
      log({
        action: 'update',
        entityType: 'post',
        entityId: id,
        entityLabel: post.title,
        summary: `Article archivé : ${post.title}`,
      });
      revalidatePublic('blog');
      return ok({
        archived: true,
        reason: 'L’article a été retiré du site public. Utilisez la suppression définitive pour l’effacer.',
      });
    }

    deletePost(id);
    log({
      action: 'delete',
      entityType: 'post',
      entityId: id,
      entityLabel: post.title,
      summary: `Article supprimé : ${post.title}`,
    });

    revalidatePublic('blog');
    return ok({ deleted: true });
  })(request);
}
