import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { PostCard } from '@/components/public/cards';
import { getDictionary } from '@/lib/i18n';
import { isLocale, locales, path, type Locale } from '@/lib/i18n/config';
import { formatShortDate } from '@/lib/i18n/format';
import { absoluteUrl, getSiteProfile, localeAlternates } from '@/lib/site';
import { findPostBySlug, listPosts, relatedPosts } from '@/lib/db/repositories/content';

export const revalidate = 300;

export function generateStaticParams() {
  const posts = listPosts({ status: 'published', limit: 300 });
  return locales.flatMap((locale) => posts.map((post) => ({ locale, slug: post.slug })));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw)) return {};
  const post = findPostBySlug(slug, raw);
  if (!post) return { title: 'Article introuvable' };

  return {
    title: post.seo_title ?? post.title,
    description: post.seo_description ?? post.excerpt ?? undefined,
    alternates: {
      canonical: absoluteUrl(path(raw, 'blog', slug)),
      languages: localeAlternates(`/blog/${slug}`, locales),
    },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.excerpt ?? undefined,
      publishedTime: post.published_at ?? undefined,
      modifiedTime: post.updated_at,
      images: post.cover_url ? [{ url: post.cover_url, alt: post.title }] : undefined,
      tags: post.tags.map((tag) => tag.name),
    },
  };
}

export default async function PostPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale: raw, slug } = await params;
  if (!isLocale(raw)) notFound();
  const locale: Locale = raw;

  const post = findPostBySlug(slug, locale);
  if (!post || post.status !== 'published') notFound();

  const dict = getDictionary(locale);
  const profile = getSiteProfile();
  const related = relatedPosts(post, 3);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    description: post.excerpt ?? undefined,
    image: post.cover_url ?? undefined,
    datePublished: post.published_at ?? post.created_at,
    dateModified: post.updated_at,
    author: { '@type': 'Person', name: post.author_name ?? profile.ownerName },
    publisher: { '@type': 'Person', name: profile.ownerName },
    mainEntityOfPage: { '@type': 'WebPage', '@id': absoluteUrl(path(locale, 'blog', slug)) },
    keywords: post.tags.map((tag) => tag.name).join(', ') || undefined,
    wordCount: post.content ? post.content.replace(/<[^>]*>/g, ' ').split(/\s+/).filter(Boolean).length : undefined,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      <article>
        <header className="container-prose pt-12 sm:pt-16">
          <Link
            href={path(locale, 'blog')}
            className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium text-fg-muted transition-colors hover:text-fg"
          >
            <ArrowLeft className="size-3.5 rtl:-scale-x-100" />
            {dict.blog.allPosts}
          </Link>

          <div className="mt-6 flex flex-wrap items-center gap-2.5">
            {post.category_name && <Badge tone="brand">{post.category_name}</Badge>}
            {post.is_demo === 1 && <Badge tone="warning">{dict.projects.demoBadge}</Badge>}
          </div>

          <h1 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-fg sm:text-[2.5rem]">
            {post.title}
          </h1>

          {post.excerpt && <p className="mt-4 text-[1.0625rem] leading-relaxed text-fg-muted">{post.excerpt}</p>}

          <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line pt-5 text-[0.75rem] text-fg-subtle">
            <span className="inline-flex items-center gap-1.5">
              <User className="size-3.5" />
              {post.author_name ?? profile.ownerName}
            </span>
            {post.published_at && (
              <span>
                {dict.blog.publishedOn} <time dateTime={post.published_at}>{formatShortDate(post.published_at, locale)}</time>
              </span>
            )}
            {post.reading_minutes && (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="size-3.5" />
                {post.reading_minutes} {dict.blog.readingTime}
              </span>
            )}
          </div>
        </header>

        {post.cover_url && (
          <div className="container-page pt-8">
            { }
            <img
              src={post.cover_url}
              alt={post.title}
              className="w-full rounded-[var(--radius-card)] border border-line object-cover shadow-raised"
            />
          </div>
        )}

        {post.content && (
          <div className="container-prose py-12">
            {/* Authored by the site owner in the admin CMS — the only writer is an
                authenticated Super Admin, never a site visitor. */}
            <div className="rich-text" dangerouslySetInnerHTML={{ __html: post.content }} />
          </div>
        )}

        {post.tags.length > 0 && (
          <div className="container-prose pb-10">
            <h2 className="text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-subtle">
              {dict.blog.tags}
            </h2>
            <ul className="mt-3 flex flex-wrap gap-1.5">
              {post.tags.map((tag) => (
                <li key={tag.id}>
                  <Link href={`${path(locale, 'blog')}?tag=${tag.slug}`}>
                    <Badge tone="outline">{tag.name}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        {related.length > 0 && (
          <section className="border-t border-line bg-surface-sunken/30 py-14">
            <div className="container-page">
              <h2 className="text-[1.125rem] font-semibold text-fg">{dict.blog.related}</h2>
              <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {related.map((item) => (
                  <PostCard key={item.id} post={item} locale={locale} dict={dict} />
                ))}
              </div>
            </div>
          </section>
        )}
      </article>
    </>
  );
}
