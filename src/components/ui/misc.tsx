import * as React from 'react';
import { cn, initials, percent } from '@/lib/utils';

export function Avatar({
  name,
  src,
  size = 36,
  className,
}: {
  name?: string | null;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const dim = { width: size, height: size };
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={name ?? ''}
        style={dim}
        className={cn('shrink-0 rounded-full border border-line object-cover', className)}
      />
    );
  }
  return (
    <span
      style={{ ...dim, fontSize: Math.max(10, size * 0.38) }}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center rounded-full bg-accent-soft font-semibold text-accent',
        className,
      )}
      aria-hidden
    >
      {initials(name)}
    </span>
  );
}

export function Progress({
  value,
  total = 100,
  tone = 'accent',
  className,
  showLabel = false,
  label,
}: {
  value: number;
  total?: number;
  tone?: 'accent' | 'success' | 'warning' | 'danger';
  className?: string;
  showLabel?: boolean;
  label?: string;
}) {
  const pct = percent(value, total);
  const bg = {
    accent: 'bg-accent',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
  }[tone];
  return (
    <div className={cn('min-w-0', className)}>
      {(showLabel || label) && (
        <div className="mb-1.5 flex items-center justify-between text-[0.75rem] text-fg-muted">
          <span>{label}</span>
          {showLabel && <span className="font-semibold tabular-nums text-fg">{pct}%</span>}
        </div>
      )}
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-surface-sunken"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label ?? 'progression'}
      >
        <div className={cn('h-full rounded-full transition-[width] duration-500', bg)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center rounded-[var(--radius-card)] border border-dashed border-line px-6 py-14 text-center',
        className,
      )}
    >
      {icon && (
        <span className="mb-4 flex size-11 items-center justify-center rounded-full bg-surface-sunken text-fg-subtle">
          {icon}
        </span>
      )}
      <p className="text-sm font-semibold text-fg">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-[0.8125rem] leading-relaxed text-fg-muted">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton rounded-lg', className)} aria-hidden />;
}

export function Divider({ className, label }: { className?: string; label?: string }) {
  if (label) {
    return (
      <div className={cn('flex items-center gap-3', className)}>
        <span className="h-px flex-1 bg-line" />
        <span className="text-[0.6875rem] font-semibold uppercase tracking-wider text-fg-subtle">{label}</span>
        <span className="h-px flex-1 bg-line" />
      </div>
    );
  }
  return <hr className={cn('border-line', className)} />;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = 'start',
  className,
  action,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: 'start' | 'center';
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        align === 'center' && 'sm:flex-col sm:items-center',
        className,
      )}
    >
      <div className={cn('max-w-2xl', align === 'center' && 'text-center')}>
        {eyebrow && (
          <p className="mb-2.5 text-[0.75rem] font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</p>
        )}
        <h2 className="text-2xl font-semibold text-fg sm:text-3xl">{title}</h2>
        {description && <p className="mt-3 text-[0.9375rem] leading-relaxed text-fg-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

/** Small key/value row used on detail pages and PDFs. */
export function DataRow({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-baseline justify-between gap-2 py-2', className)}>
      <dt className="text-[0.8125rem] text-fg-muted">{label}</dt>
      <dd className="text-[0.8125rem] font-medium text-fg">{children}</dd>
    </div>
  );
}
