'use client';

import * as React from 'react';
import { ChartFrame, type LegendEntry } from './chart-frame';
import { resolveFormat, type NumberFormatSpec } from './format';
import { MARK, seriesVar } from './palette';
import { cn } from '@/lib/utils';

export type DonutSlice = { key: string; label: string; value: number; slot: number };

/**
 * Donut for part-to-whole with few categories. A 2px surface gap separates
 * touching arcs; the centre carries the total as the one direct label.
 */
export function DonutChart({
  slices,
  title,
  subtitle,
  centerLabel,
  format,
  size = 176,
}: {
  slices: DonutSlice[];
  title?: string;
  subtitle?: string;
  centerLabel?: string;
  format?: NumberFormatSpec;
  size?: number;
}) {
  const fmt = React.useMemo(() => resolveFormat(format), [format]);
  const [hover, setHover] = React.useState<string | null>(null);
  const total = slices.reduce((acc, s) => acc + Math.max(0, s.value), 0);
  const radius = size / 2;
  const thickness = Math.max(14, size * 0.15);
  const r = radius - thickness / 2;
  const circumference = 2 * Math.PI * r;
  // Gap expressed in stroke units so it renders as a true 2px surface gap.
  const gap = total > 0 && slices.filter((s) => s.value > 0).length > 1 ? MARK.surfaceGap : 0;

  let offset = 0;
  const arcs = slices
    .filter((s) => s.value > 0)
    .map((slice) => {
      const fraction = slice.value / (total || 1);
      const length = Math.max(0, fraction * circumference - gap);
      const arc = { ...slice, length, offset, fraction };
      offset += fraction * circumference;
      return arc;
    });

  const legend: LegendEntry[] = slices.map((s) => ({ key: s.key, label: s.label, slot: s.slot }));

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      legend={legend}
      minHeight={size + 8}
      table={{
        columns: ['Catégorie', 'Valeur', 'Part'],
        rows: slices.map((s) => [
          s.label,
          fmt(s.value),
          `${total ? Math.round((s.value / total) * 100) : 0} %`,
        ]),
      }}
    >
      <div className="flex flex-wrap items-center gap-6">
        <div className="relative shrink-0" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={title ?? 'répartition'}>
            <circle cx={radius} cy={radius} r={r} fill="none" stroke="var(--surface-sunken)" strokeWidth={thickness} />
            <g transform={`rotate(-90 ${radius} ${radius})`}>
              {arcs.map((arc) => (
                <circle
                  key={arc.key}
                  cx={radius}
                  cy={radius}
                  r={r}
                  fill="none"
                  stroke={seriesVar(arc.slot)}
                  strokeWidth={hover === arc.key ? thickness + 3 : thickness}
                  strokeDasharray={`${arc.length} ${circumference - arc.length}`}
                  strokeDashoffset={-arc.offset}
                  strokeLinecap="butt"
                  className="cursor-default transition-[stroke-width] duration-150"
                  onMouseEnter={() => setHover(arc.key)}
                  onMouseLeave={() => setHover(null)}
                />
              ))}
            </g>
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            {/* Proportional figures — tabular-nums would look loose at this size */}
            <span className="text-xl font-semibold text-fg">
              {hover ? fmt(slices.find((s) => s.key === hover)?.value ?? 0) : fmt(total)}
            </span>
            <span className="mt-0.5 max-w-[6rem] text-[0.625rem] leading-tight text-fg-muted">
              {hover ? slices.find((s) => s.key === hover)?.label : centerLabel}
            </span>
          </div>
        </div>

        <ul className="min-w-0 flex-1 space-y-1.5">
          {slices.map((slice) => (
            <li
              key={slice.key}
              onMouseEnter={() => setHover(slice.key)}
              onMouseLeave={() => setHover(null)}
              className={cn(
                'flex items-center gap-2.5 rounded-md px-1.5 py-1 text-[0.75rem] transition-colors',
                hover === slice.key && 'bg-surface-hover',
              )}
            >
              <span className="size-2.5 shrink-0 rounded-sm" style={{ background: seriesVar(slice.slot) }} aria-hidden />
              <span className="min-w-0 flex-1 truncate text-fg-muted">{slice.label}</span>
              <span className="shrink-0 font-semibold tabular-nums text-fg">{fmt(slice.value)}</span>
              <span className="w-10 shrink-0 text-end tabular-nums text-fg-subtle">
                {total ? Math.round((slice.value / total) * 100) : 0}%
              </span>
            </li>
          ))}
        </ul>
      </div>
    </ChartFrame>
  );
}
