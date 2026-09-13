import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge, type BadgeTone } from '@/components/ui/badge';
import { buttonClass } from '@/components/ui/button';

/**
 * Layout primitives shared by every admin page, so 30-odd screens stay visually
 * and structurally identical without repeating markup.
 */

export function PageHeader({
  title,
  description,
  backHref,
  backLabel,
  badges,
  actions,
  breadcrumb,
  className,
}: {
  title: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
  badges?: React.ReactNode;
  actions?: React.ReactNode;
  breadcrumb?: { label: string; href?: string }[];
  className?: string;
}) {
  return (
    <header className={cn('mb-6', className)}>
      {backHref && (
        <Link
          href={backHref}
          className="mb-3 inline-flex items-center gap-1.5 text-[0.75rem] font-medium text-fg-muted transition-colors hover:text-fg"
        >
          <ArrowLeft className="size-3.5 rtl:-scale-x-100" />
          {backLabel ?? 'Retour'}
        </Link>
      )}

      {breadcrumb && breadcrumb.length > 0 && (
        <nav aria-label="Fil d’Ariane" className="mb-2">
          <ol className="flex flex-wrap items-center gap-1 text-[0.75rem] text-fg-subtle">
            {breadcrumb.map((crumb, index) => (
              <li key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                {index > 0 && <ChevronRight className="size-3 rtl:-scale-x-100" aria-hidden />}
                {crumb.href ? (
                  <Link href={crumb.href} className="transition-colors hover:text-fg">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-fg-muted">{crumb.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-[1.375rem] font-semibold tracking-tight text-fg sm:text-[1.625rem]">{title}</h1>
            {badges}
          </div>
          {description && (
            <p className="mt-1.5 max-w-2xl text-[0.8125rem] leading-relaxed text-fg-muted">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

/** Compact KPI strip above a list, e.g. counts per status. */
export function SummaryStrip({
  items,
  className,
}: {
  items: { label: string; value: string | number; tone?: BadgeTone; href?: string }[];
  className?: string;
}) {
  return (
    <ul className={cn('mb-5 flex flex-wrap gap-2', className)}>
      {items.map((item) => {
        const content = (
          <>
            <span className="text-fg-subtle">{item.label}</span>
            <span className="font-semibold tabular-nums text-fg">{item.value}</span>
          </>
        );
        const classes =
          'inline-flex items-center gap-2 rounded-lg border border-line bg-surface-raised px-3 py-1.5 text-[0.75rem] transition-colors';
        return (
          <li key={item.label}>
            {item.href ? (
              <Link href={item.href} className={cn(classes, 'hover:border-line-strong')}>
                {content}
              </Link>
            ) : (
              <span className={classes}>{content}</span>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** Section wrapper used inside detail pages. */
export function Section({
  title,
  description,
  action,
  children,
  className,
  id,
}: {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} className={cn('scroll-mt-20', className)}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-[0.9375rem] font-semibold text-fg">{title}</h2>}
            {description && <p className="mt-0.5 text-[0.75rem] text-fg-muted">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/** Key/value grid used on every detail page. */
export function DetailGrid({
  items,
  columns = 2,
  className,
}: {
  items: { label: string; value: React.ReactNode }[];
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  const cols = { 2: 'sm:grid-cols-2', 3: 'sm:grid-cols-2 lg:grid-cols-3', 4: 'sm:grid-cols-2 lg:grid-cols-4' }[columns];
  return (
    <dl className={cn('grid gap-x-6 gap-y-4', cols, className)}>
      {items.map((item, index) => (
        <div key={`${item.label}-${index}`} className="min-w-0">
          <dt className="text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-subtle">{item.label}</dt>
          <dd className="mt-1 break-words text-[0.8125rem] text-fg">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Status pill with a consistent tone map across the whole admin. */
export function StatusBadge({
  status,
  labels,
  tones,
}: {
  status: string;
  labels: Record<string, string> | ((s: string) => string);
  tones: Record<string, string>;
}) {
  const label = typeof labels === 'function' ? labels(status) : (labels[status] ?? status);
  const tone = (tones[status] ?? 'neutral') as BadgeTone;
  return <Badge tone={tone}>{label}</Badge>;
}

/** Empty-list state with a call to action. */
export function ListEmpty({
  icon,
  title,
  description,
  actionHref,
  actionLabel,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-line px-6 py-16 text-center">
      {icon && (
        <span className="mb-4 flex size-11 items-center justify-center rounded-full bg-surface-sunken text-fg-subtle">
          {icon}
        </span>
      )}
      <p className="text-[0.875rem] font-semibold text-fg">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-[0.8125rem] leading-relaxed text-fg-muted">{description}</p>}
      {actionHref && actionLabel && (
        <Link href={actionHref} className={buttonClass('primary', 'sm', 'mt-5')}>
          {actionLabel}
        </Link>
      )}
    </div>
  );
}

/** Small inline metric, used inside detail sidebars. */
export function MiniStat({
  label,
  value,
  tone = 'default',
  hint,
}: {
  label: string;
  value: string | number;
  tone?: 'default' | 'success' | 'warning' | 'danger';
  hint?: string;
}) {
  const color = {
    default: 'text-fg',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
  }[tone];
  return (
    <div className="min-w-0">
      <p className="text-[0.625rem] font-semibold uppercase tracking-wider text-fg-subtle">{label}</p>
      <p className={cn('mt-0.5 text-[1.0625rem] font-semibold leading-none', color)}>{value}</p>
      {hint && <p className="mt-1 text-[0.625rem] text-fg-subtle">{hint}</p>}
    </div>
  );
}

/** Demo-data marker, so seeded rows are never mistaken for real ones. */
export function DemoBadge({ when }: { when: boolean | number | null | undefined }) {
  if (!when) return null;
  return <Badge tone="warning">DÉMO</Badge>;
}
