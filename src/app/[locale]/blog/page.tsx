import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Newspaper } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/misc';
import { PostCard } from '@/components/public/cards';
import { BlogSearch } from '@/components/public/blog-search';
import { getDictionary } from '@/lib/i18n';
import { isLocale, locales, path, type Locale } from '@/lib/i18n/config';
import { absoluteUrl, getSiteProfile, localeAlternates } from '@/lib/site';
import { listCategories, listPosts, listTags } from '@/lib/db/repositories/content';
import { cn } from '@/lib/utils';

export const revalidate = 300;

type SearchParams = Promise<{ q?: string; categorie?: string; tag?: string }>;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale: raw } = await params;
  if (!isLocale(raw)) return {};
  const dict = getDictionary(raw);
  return {
    title: dict.blog.title,
    description: dict.blog.subtitle,
    alternates: {
      canonical: absoluteUrl(path(raw, 'blog')),
      languages: localeAlternates('/blog', locales),
    },
  };
}

export default async function BlogPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: SearchParams;
}) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;

  const dict = getDictionary(locale);
  const profile = getSiteProfile();
  const query = await searchParams;

  const categories = listCategories('post');
  const categoryId = query.categorie ? categories.find((c) => c.slug === query.categorie)?.id : undefined;

  const posts = listPosts({
    status: 'published',
    locale,
    search: query.q?.trim() || undefined,
    categoryId,
    tag: query.tag || undefined,
    limit: 40,
  });

  const tags = listTags();
  const [lead, ...rest] = posts;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Blog',
    name: dict.blog.title,
    description: dict.blog.subtitle,
    url: absoluteUrl(path(locale, 'blog')),
    author: { '@type': 'Person', name: profile.ownerName },
    blogPost: posts.slice(0, 20).map((post) => ({
      '@type': 'BlogPosting',
      headline: post.title,
      url: absoluteUrl(path(locale, 'blog', post.slug)),
      datePublished: post.published_at ?? undefined,
      description: post.excerpt ?? undefined,
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <section className="relative overflow-hidden border-b border-line">
        <div className="absolute inset-0 -z-10 surface-mesh opacity-60" aria-hidden />
        <div className="container-page py-16 sm:py-20">
          <Badge tone="brand" className="mb-4">
            Blog
          </Badge>
          <h1 className="text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{dict.blog.title}</h1>
          <p className="mt-4 max-w-2xl text-[0.9375rem] leading-relaxed text-fg-muted">{dict.blog.subtitle}</p>
        </div>
      </section>

      <div className="container-page py-10 sm:py-14">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_15rem] lg:gap-14">
          <div className="min-w-0">
            <BlogSearch dict={dict} initialQuery={query.q ?? ''} />

            {posts.length === 0 ? (
              <EmptyState className="mt-8" icon={<Newspaper className="size-5" />} title={dict.blog.empty} />
            ) : (
              <div className="mt-8 space-y-5">
                {lead && <PostCard post={lead} locale={locale} dict={dict} horizontal />}
                {rest.length > 0 && (
                  <div className="grid gap-5 sm:grid-cols-2">
                    {rest.map((post) => (
                      <PostCard key={post.id} post={post} locale={locale} dict={dict} />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <aside className="space-y-8 lg:sticky lg:top-24 lg:self-start">
            {categories.length > 0 && (
              <nav aria-label={dict.blog.categories}>
                <h2 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-subtle">
                  {dict.blog.categories}
                </h2>
                <ul className="mt-3 space-y-1">
                  <li>
                    <Link
                      href={path(locale, 'blog')}
                      className={cn(
                        'block rounded-lg px-3 py-2 text-[0.8125rem] transition-colors',
                        !query.categorie
                          ? 'bg-accent-soft font-medium text-accent'
                          : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
                      )}
                    >
                      {dict.common.all}
                    </Link>
                  </li>
                  {categories.map((category) => (
                    <li key={category.id}>
                      <Link
                        href={`${path(locale, 'blog')}?categorie=${category.slug}`}
                        className={cn(
                          'block rounded-lg px-3 py-2 text-[0.8125rem] transition-colors',
                          query.categorie === category.slug
                            ? 'bg-accent-soft font-medium text-accent'
                            : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
                        )}
                      >
                        {category.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}

            {tags.length > 0 && (
              <nav aria-label={dict.blog.tags}>
                <h2 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-subtle">
                  {dict.blog.tags}
                </h2>
                <ul className="mt-3 flex flex-wrap gap-1.5">
                  {tags.slice(0, 24).map((tag) => (
                    <li key={tag.id}>
                      <Link href={`${path(locale, 'blog')}?tag=${tag.slug}`}>
                        <Badge tone={query.tag === tag.slug ? 'brand' : 'outline'}>{tag.name}</Badge>
                      </Link>
                    </li>
                  ))}
                </ul>
              </nav>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
