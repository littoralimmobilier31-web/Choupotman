'use client';

import * as React from 'react';
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { seriesVar } from './palette';

/** 12-point sparkline: de-emphasised trail, accent on the current period. */
export function Sparkline({
  values,
  width = 88,
  height = 26,
  slot = 0,
  className,
}: {
  values: number[];
  width?: number;
  height?: number;
  slot?: number;
  className?: string;
}) {
  if (values.length < 2) return null;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const stepX = width / (values.length - 1);
  const points = values.map((v, i) => [i * stepX, height - 2 - ((v - min) / span) * (height - 4)] as const);
  const d = points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const last = points[points.length - 1];

  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn('overflow-visible', className)} aria-hidden>
      <path d={d} fill="none" stroke="var(--line-strong)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {last && (
        <>
          <path
            d={`M${points[points.length - 2]?.[0].toFixed(1)},${points[points.length - 2]?.[1].toFixed(1)} L${last[0].toFixed(1)},${last[1].toFixed(1)}`}
            fill="none"
            stroke={seriesVar(slot)}
            strokeWidth={2}
            strokeLinecap="round"
          />
          <circle cx={last[0]} cy={last[1]} r={2.5} fill={seriesVar(slot)} stroke="var(--surface-raised)" strokeWidth={2} />
        </>
      )}
    </svg>
  );
}

/**
 * Stat tile contract: label (sentence case) · value · optional delta vs a named
 * period · optional sparkline. `upIsGood` flips the delta colour for metrics
 * where growth is bad (overdue invoices, expenses).
 */
export function StatTile({
  label,
  value,
  delta,
  deltaPeriod,
  upIsGood = true,
  trend,
  icon,
  href,
  hint,
  slot = 0,
  className,
}: {
  label: string;
  value: string | number;
  delta?: number | null;
  deltaPeriod?: string;
  upIsGood?: boolean;
  trend?: number[];
  icon?: React.ReactNode;
  href?: string;
  hint?: string;
  slot?: number;
  className?: string;
}) {
  const hasDelta = typeof delta === 'number' && Number.isFinite(delta);
  const direction = hasDelta ? (delta! > 0.05 ? 'up' : delta! < -0.05 ? 'down' : 'flat') : 'flat';
  const good = direction === 'flat' ? null : (direction === 'up') === upIsGood;
  const Wrapper = (href ? 'a' : 'div') as React.ElementType;

  return (
    <Wrapper
      href={href}
      className={cn(
        'flex min-w-0 flex-col rounded-[var(--radius-card)] border border-line bg-surface-raised p-4',
        href && 'transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-soft',
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[0.75rem] leading-snug text-fg-muted">{label}</p>
        {icon && <span className="shrink-0 text-fg-subtle">{icon}</span>}
      </div>

      <div className="mt-2 flex items-end justify-between gap-3">
        {/* Proportional figures: tabular-nums makes display sizes look loose */}
        <p className="text-[1.625rem] font-semibold leading-none text-fg">{value}</p>
        {trend && trend.length > 1 && <Sparkline values={trend} slot={slot} className="mb-0.5" />}
      </div>

      {(hasDelta || hint) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.6875rem]">
          {hasDelta && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 font-semibold',
                good === null ? 'text-fg-subtle' : good ? 'text-success' : 'text-danger',
              )}
            >
              {direction === 'up' ? (
                <ArrowUpRight className="size-3" />
              ) : direction === 'down' ? (
                <ArrowDownRight className="size-3" />
              ) : (
                <Minus className="size-3" />
              )}
              {Math.abs(delta!).toFixed(Math.abs(delta!) < 10 ? 1 : 0).replace('.', ',')} %
            </span>
          )}
          {deltaPeriod && <span className="text-fg-subtle">{deltaPeriod}</span>}
          {hint && <span className="text-fg-subtle">{hint}</span>}
        </div>
      )}
    </Wrapper>
  );
}

/** Hero figure — exactly one per view, >= 48px, same sans as everything else. */
export function HeroFigure({
  label,
  value,
  sub,
  className,
}: {
  label: string;
  value: string;
  sub?: string;
  className?: string;
}) {
  return (
    <div className={cn('min-w-0', className)}>
      <p className="text-[0.75rem] font-medium uppercase tracking-wider text-fg-subtle">{label}</p>
      <p className="mt-1.5 text-[3rem] font-semibold leading-none tracking-tight text-fg">{value}</p>
      {sub && <p className="mt-2 text-[0.8125rem] text-fg-muted">{sub}</p>}
    </div>
  );
}

/** Meter — fill carries severity, track is a lighter step of the same ramp. */
export function Meter({
  value,
  max,
  label,
  valueLabel,
  thresholds = { warning: 0.75, danger: 1 },
  className,
}: {
  value: number;
  max: number;
  label?: string;
  valueLabel?: string;
  thresholds?: { warning: number; danger: number };
  className?: string;
}) {
  const ratio = max > 0 ? value / max : 0;
  const tone = ratio >= thresholds.danger ? 'danger' : ratio >= thresholds.warning ? 'warning' : 'accent';
  const fill = { accent: 'var(--accent)', warning: 'var(--color-warning)', danger: 'var(--color-danger)' }[tone];
  const track = {
    accent: 'color-mix(in oklch, var(--accent) 18%, var(--surface-sunken))',
    warning: 'color-mix(in oklch, var(--color-warning) 20%, var(--surface-sunken))',
    danger: 'color-mix(in oklch, var(--color-danger) 18%, var(--surface-sunken))',
  }[tone];

  return (
    <div className={cn('min-w-0', className)}>
      {(label || valueLabel) && (
        <div className="mb-1.5 flex items-baseline justify-between gap-2 text-[0.75rem]">
          <span className="truncate text-fg-muted">{label}</span>
          <span className="shrink-0 font-semibold tabular-nums text-fg">{valueLabel}</span>
        </div>
      )}
      <div
        className="h-2 w-full overflow-hidden rounded-full"
        style={{ background: track }}
        role="meter"
        aria-valuenow={value}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-label={label}
      >
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%`, background: fill }}
        />
      </div>
    </div>
  );
}
