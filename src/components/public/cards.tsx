import Link from 'next/link';
import { ArrowUpRight, Calendar, ImageOff, Clock, Tag } from 'lucide-react';
import { cn, truncate } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { path, type Locale } from '@/lib/i18n/config';
import { formatShortDate, formatMoney } from '@/lib/i18n/format';
import type { Dictionary } from '@/lib/i18n/types';
import type { PortfolioProject, Service, CaseStudy, BlogPost } from '@/lib/db/repositories/content';

/** Cards shared by the home page and the listing pages. */

function CoverImage({
  src,
  alt,
  className,
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
}) {
  if (!src) {
    return (
      <div
        className={cn(
          'flex items-center justify-center bg-surface-sunken surface-mesh text-fg-subtle',
          className,
        )}
        aria-hidden
      >
        <ImageOff className="size-6 opacity-40" />
      </div>
    );
  }
  return (

    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={cn('size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]', className)}
    />
  );
}

export function ProjectCard({
  project,
  locale,
  dict,
  featured = false,
}: {
  project: PortfolioProject;
  locale: Locale;
  dict: Dictionary;
  featured?: boolean;
}) {
  const href = path(locale, 'projects', project.slug);
  return (
    <article
      className={cn(
        'group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface-raised shadow-soft',
        'transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-raised',
        featured && 'sm:col-span-2',
      )}
    >
      <Link href={href} className="absolute inset-0 z-10" aria-label={project.title}>
        <span className="sr-only">{project.title}</span>
      </Link>

      <div className={cn('relative overflow-hidden bg-surface-sunken', featured ? 'aspect-[16/8]' : 'aspect-[16/10]')}>
        <CoverImage src={project.cover_url} alt={project.title} className="absolute inset-0" />
        {project.is_demo === 1 && (
          <Badge tone="warning" className="absolute top-3 end-3 z-20">
            {dict.projects.demoBadge}
          </Badge>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="mb-2.5 flex flex-wrap items-center gap-2 text-[0.6875rem] text-fg-subtle">
          {project.category_name && <span className="font-semibold text-accent">{project.category_name}</span>}
          {project.year && (
            <>
              <span aria-hidden>·</span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="size-3" />
                {project.year}
              </span>
            </>
          )}
        </div>

        <h3 className="text-[1.0625rem] font-semibold leading-snug text-fg">{project.title}</h3>

        {(project.summary || project.subtitle) && (
          <p className="mt-2 flex-1 text-[0.8125rem] leading-relaxed text-fg-muted">
            {truncate(project.summary ?? project.subtitle, featured ? 200 : 130)}
          </p>
        )}

        {project.technologyList.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {project.technologyList.slice(0, 4).map((tech) => (
              <li key={tech}>
                <Badge tone="outline">{tech}</Badge>
              </li>
            ))}
            {project.technologyList.length > 4 && (
              <li>
                <Badge tone="neutral">+{project.technologyList.length - 4}</Badge>
              </li>
            )}
          </ul>
        )}

        <span className="mt-4 inline-flex items-center gap-1 text-[0.75rem] font-semibold text-accent">
          {dict.common.readMore}
          <ArrowUpRight className="size-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 rtl:-scale-x-100" />
        </span>
      </div>
    </article>
  );
}

export function ServiceCard({
  service,
  locale,
  dict,
  compact = false,
}: {
  service: Service;
  locale: Locale;
  dict: Dictionary;
  compact?: boolean;
}) {
  return (
    <article
      id={service.slug}
      className="group flex scroll-mt-24 flex-col rounded-[var(--radius-card)] border border-line bg-surface-raised p-5 shadow-soft transition-[border-color,box-shadow] duration-300 hover:border-line-strong hover:shadow-soft"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-[0.9375rem] font-semibold leading-snug text-fg">{service.name}</h3>
        {service.is_featured === 1 && <Badge tone="brand">★</Badge>}
      </div>

      {service.short_description && (
        <p className="mt-2 text-[0.8125rem] leading-relaxed text-fg-muted">{service.short_description}</p>
      )}

      {!compact && service.bullets.length > 0 && (
        <>
          <p className="mt-4 text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-subtle">
            {dict.services.includes}
          </p>
          <ul className="mt-2 space-y-1.5">
            {service.bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2 text-[0.8125rem] text-fg-muted">
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-accent" aria-hidden />
                {bullet}
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="mt-auto flex flex-wrap items-end justify-between gap-3 pt-5">
        <div>
          <p className="text-[0.625rem] font-semibold uppercase tracking-wider text-fg-subtle">
            {service.starting_price ? dict.services.startingFrom : ''}
          </p>
          <p className="text-[0.875rem] font-semibold text-fg">
            {service.starting_price
              ? formatMoney(service.starting_price, service.currency, locale)
              : dict.services.onQuote}
          </p>
          {service.price_note && <p className="mt-0.5 text-[0.6875rem] text-fg-subtle">{service.price_note}</p>}
        </div>
        <Link
          href={`${path(locale, 'request')}?service=${encodeURIComponent(service.slug)}`}
          className="inline-flex items-center gap-1 text-[0.75rem] font-semibold text-accent transition-colors hover:underline"
        >
          {dict.services.requestThis}
          <ArrowUpRight className="size-3.5 rtl:-scale-x-100" />
        </Link>
      </div>
    </article>
  );
}

export function CaseStudyCard({
  study,
  locale,
  dict,
}: {
  study: CaseStudy;
  locale: Locale;
  dict: Dictionary;
}) {
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface-raised shadow-soft transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-raised">
      <Link href={path(locale, 'caseStudies', study.slug)} className="absolute inset-0 z-10">
        <span className="sr-only">{study.title}</span>
      </Link>

      <div className="relative aspect-[16/9] overflow-hidden bg-surface-sunken">
        <CoverImage src={study.cover_url} alt={study.title} className="absolute inset-0" />
        {study.is_demo === 1 && (
          <Badge tone="warning" className="absolute top-3 end-3 z-20">
            {dict.projects.demoBadge}
          </Badge>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-[1.0625rem] font-semibold leading-snug text-fg">{study.title}</h3>
        {study.subtitle && <p className="mt-1.5 text-[0.8125rem] text-fg-subtle">{study.subtitle}</p>}
        {study.problem && (
          <p className="mt-3 flex-1 text-[0.8125rem] leading-relaxed text-fg-muted">{truncate(study.problem, 150)}</p>
        )}

        {study.metricList.length > 0 && (
          <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-line pt-4">
            {study.metricList.slice(0, 3).map((metric) => (
              <div key={metric.label} className="min-w-0">
                <dd className="text-[1.0625rem] font-semibold text-fg">{metric.value}</dd>
                <dt className="truncate text-[0.625rem] text-fg-subtle">{metric.label}</dt>
              </div>
            ))}
          </dl>
        )}

        <div className="mt-4 flex items-center gap-3 text-[0.75rem] text-fg-subtle">
          {study.reading_minutes && (
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3" />
              {study.reading_minutes} {dict.caseStudy.readingTime}
            </span>
          )}
          <span className="ms-auto inline-flex items-center gap-1 font-semibold text-accent">
            {dict.projects.caseStudy}
            <ArrowUpRight className="size-3.5 rtl:-scale-x-100" />
          </span>
        </div>
      </div>
    </article>
  );
}

export function PostCard({
  post,
  locale,
  dict,
  horizontal = false,
}: {
  post: BlogPost;
  locale: Locale;
  dict: Dictionary;
  horizontal?: boolean;
}) {
  return (
    <article
      className={cn(
        'group relative flex overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface-raised shadow-soft',
        'transition-[border-color,box-shadow,transform] duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-raised',
        horizontal ? 'flex-col sm:flex-row' : 'flex-col',
      )}
    >
      <Link href={path(locale, 'blog', post.slug)} className="absolute inset-0 z-10">
        <span className="sr-only">{post.title}</span>
      </Link>

      <div
        className={cn(
          'relative overflow-hidden bg-surface-sunken',
          horizontal ? 'aspect-[16/10] sm:aspect-auto sm:w-52 sm:shrink-0' : 'aspect-[16/9]',
        )}
      >
        <CoverImage src={post.cover_url} alt={post.title} className="absolute inset-0" />
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="mb-2 flex flex-wrap items-center gap-2 text-[0.6875rem] text-fg-subtle">
          {post.category_name && <span className="font-semibold text-accent">{post.category_name}</span>}
          {post.published_at && (
            <>
              <span aria-hidden>·</span>
              <time dateTime={post.published_at}>{formatShortDate(post.published_at, locale)}</time>
            </>
          )}
          {post.reading_minutes && (
            <>
              <span aria-hidden>·</span>
              <span>
                {post.reading_minutes} {dict.blog.readingTime}
              </span>
            </>
          )}
        </div>

        <h3 className="text-[1.0625rem] font-semibold leading-snug text-fg">{post.title}</h3>
        {post.excerpt && (
          <p className="mt-2 flex-1 text-[0.8125rem] leading-relaxed text-fg-muted">{truncate(post.excerpt, 150)}</p>
        )}

        {post.tags.length > 0 && (
          <ul className="mt-4 flex flex-wrap items-center gap-1.5">
            <Tag className="size-3 text-fg-subtle" aria-hidden />
            {post.tags.slice(0, 3).map((tag) => (
              <li key={tag.id} className="text-[0.6875rem] text-fg-subtle">
                {tag.name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </article>
  );
}

export function TestimonialCard({
  quote,
  author,
  role,
  company,
  rating,
  isDemo,
  demoLabel,
}: {
  quote: string;
  author: string;
  role?: string | null;
  company?: string | null;
  rating?: number | null;
  isDemo?: boolean;
  demoLabel?: string;
}) {
  return (
    <figure className="flex h-full flex-col rounded-[var(--radius-card)] border border-line bg-surface-raised p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        {rating ? (
          <div className="flex gap-0.5" aria-label={`${rating}/5`}>
            {Array.from({ length: 5 }, (_, i) => (
              <span key={i} className={cn('text-[0.875rem]', i < rating ? 'text-warning' : 'text-line-strong')}>
                ★
              </span>
            ))}
          </div>
        ) : (
          <span />
        )}
        {isDemo && demoLabel && <Badge tone="warning">{demoLabel}</Badge>}
      </div>

      <blockquote className="mt-3 flex-1 text-[0.875rem] leading-relaxed text-fg">
        <p>“{quote}”</p>
      </blockquote>

      <figcaption className="mt-4 border-t border-line pt-4">
        <p className="text-[0.8125rem] font-semibold text-fg">{author}</p>
        {(role || company) && (
          <p className="mt-0.5 text-[0.75rem] text-fg-subtle">{[role, company].filter(Boolean).join(' · ')}</p>
        )}
      </figcaption>
    </figure>
  );
}
