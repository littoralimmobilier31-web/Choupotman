import Link from 'next/link';
import { ExternalLink, Newspaper, Plus, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';
import { TableWrap, Table, Thead, Th, Tbody, Tr, Td } from '@/components/ui/table';
import { PageHeader, SummaryStrip, ListEmpty, DemoBadge } from '@/components/admin/page-kit';
import { ListFilters } from '@/components/admin/list-filters';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { countPosts, listCategories, listPosts, listTags } from '@/lib/db/repositories/content';
import { formatShortDate } from '@/lib/i18n/format';
import type { PublishStatus } from '@/lib/db/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Blog' };

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

const LOCALE_LABELS: Record<string, string> = { fr: 'FR', ar: 'AR', en: 'EN' };

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string; categorie?: string; tag?: string }>;
}) {
  const user = await requirePermission('blog.view');
  const query = await searchParams;

  const filter = {
    search: query.q?.trim() || undefined,
    status: (query.statut as PublishStatus | 'all') || 'all',
    categoryId: Number.parseInt(query.categorie ?? '', 10) || undefined,
    tag: query.tag || undefined,
  };

  const posts = listPosts({ ...filter, limit: 200 });
  const categories = listCategories('blog');
  const tags = listTags();

  return (
    <>
      <PageHeader
        title="Blog"
        description="Articles, tutoriels et notes techniques. Un article publié alimente aussi le plan du site et le flux RSS."
        actions={
          <>
            <Link href="/blog" target="_blank" rel="noreferrer" className={buttonClass('secondary', 'sm')}>
              <ExternalLink className="size-3.5" />
              Voir le blog
            </Link>
            {can(user, 'blog.create') && (
              <Link href="/espace-admin/blog/nouveau" className={buttonClass('primary', 'sm')}>
                <Plus className="size-4" />
                Nouvel article
              </Link>
            )}
          </>
        }
      />

      <SummaryStrip
        items={[
          { label: 'Publiés', value: countPosts({ status: 'published' }), href: '/espace-admin/blog?statut=published' },
          { label: 'Brouillons', value: countPosts({ status: 'draft' }), href: '/espace-admin/blog?statut=draft' },
          { label: 'Archivés', value: countPosts({ status: 'archived' }), href: '/espace-admin/blog?statut=archived' },
          { label: 'Total', value: countPosts({ status: 'all' }), href: '/espace-admin/blog' },
        ]}
      />

      <ListFilters
        searchPlaceholder="Titre, chapeau, contenu…"
        resultCount={posts.length}
        selects={[
          {
            key: 'statut',
            label: 'Statut',
            allLabel: 'Tous les statuts',
            options: [
              { value: 'published', label: 'Publiés' },
              { value: 'draft', label: 'Brouillons' },
              { value: 'archived', label: 'Archivés' },
            ],
          },
          ...(categories.length > 0
            ? [
                {
                  key: 'categorie',
                  label: 'Catégorie',
                  allLabel: 'Toutes les catégories',
                  options: categories.map((category) => ({ value: String(category.id), label: category.name })),
                },
              ]
            : []),
          ...(tags.length > 0
            ? [
                {
                  key: 'tag',
                  label: 'Mot-clé',
                  allLabel: 'Tous les mots-clés',
                  options: tags.map((tag) => ({ value: tag.slug, label: tag.name })),
                },
              ]
            : []),
        ]}
      />

      <div className="mt-5">
        {posts.length === 0 ? (
          <ListEmpty
            icon={<Newspaper className="size-5" />}
            title="Aucun article"
            description="Écrire régulièrement sur ce que vous faites est le moyen le plus fiable d’être trouvé sur les moteurs de recherche."
            actionHref={can(user, 'blog.create') ? '/espace-admin/blog/nouveau' : undefined}
            actionLabel="Nouvel article"
          />
        ) : (
          <TableWrap>
            <Table>
              <Thead>
                <tr>
                  <Th>Article</Th>
                  <Th>Catégorie</Th>
                  <Th alignment="center">Statut</Th>
                  <Th alignment="center">Langue</Th>
                  <Th>Publication</Th>
                  <Th alignment="end">Vues</Th>
                </tr>
              </Thead>
              <Tbody>
                {posts.map((post) => (
                  <Tr key={post.id}>
                    <Td>
                      <Link href={`/espace-admin/blog/${post.id}`} className="group block min-w-0">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-medium text-fg group-hover:text-accent">{post.title}</span>
                          {post.is_featured === 1 && (
                            <Star className="size-3.5 shrink-0 fill-warning text-warning" aria-label="Mis en avant" />
                          )}
                          <DemoBadge when={post.is_demo} />
                        </span>
                        <span className="flex flex-wrap items-center gap-1.5 text-[0.6875rem] text-fg-subtle">
                          {post.reading_minutes ? <span>{post.reading_minutes} min</span> : null}
                          {post.tags.length > 0 && <span>{post.tags.map((tag) => tag.name).join(' · ')}</span>}
                        </span>
                      </Link>
                    </Td>
                    <Td className="text-[0.8125rem] text-fg-muted">
                      {post.category_name ?? <span className="text-fg-subtle">—</span>}
                    </Td>
                    <Td alignment="center">
                      <Badge tone={STATUS_TONES[post.status] ?? 'neutral'}>
                        {STATUS_LABELS[post.status] ?? post.status}
                      </Badge>
                    </Td>
                    <Td alignment="center" className="text-[0.6875rem] font-medium text-fg-muted">
                      {LOCALE_LABELS[post.locale] ?? post.locale.toUpperCase()}
                    </Td>
                    <Td className="whitespace-nowrap text-[0.75rem] text-fg-muted">
                      {post.published_at ? (
                        formatShortDate(post.published_at.slice(0, 10), 'fr')
                      ) : (
                        <span className="text-fg-subtle">—</span>
                      )}
                    </Td>
                    <Td alignment="end" className="tabular-nums text-[0.75rem] text-fg-muted">
                      {post.view_count}
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
