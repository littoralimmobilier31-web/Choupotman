'use client';

import * as React from 'react';
import { Table2, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { seriesVar } from './palette';

export type LegendEntry = { key: string; label: string; slot: number };

/**
 * Shared chrome for every chart: heading, legend (always shown for >= 2 series,
 * never for exactly one — the title already names it), and a table view so the
 * underlying values are never gated behind colour or hover.
 */
export function ChartFrame({
  title,
  subtitle,
  legend = [],
  table,
  action,
  className,
  children,
  minHeight = 220,
}: {
  title?: string;
  subtitle?: string;
  legend?: LegendEntry[];
  table?: { columns: string[]; rows: (string | number)[][] };
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
  minHeight?: number;
}) {
  const [view, setView] = React.useState<'chart' | 'table'>('chart');

  return (
    <figure className={cn('m-0 flex min-w-0 flex-col', className)}>
      {(title || action || table) && (
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <figcaption className="text-[0.875rem] font-semibold text-fg">{title}</figcaption>}
            {subtitle && <p className="mt-0.5 text-[0.75rem] text-fg-muted">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            {action}
            {table && (
              <button
                type="button"
                onClick={() => setView((v) => (v === 'chart' ? 'table' : 'chart'))}
                className="inline-flex items-center gap-1.5 rounded-md border border-line px-2 py-1 text-[0.6875rem] font-medium text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
                aria-pressed={view === 'table'}
              >
                {view === 'chart' ? <Table2 className="size-3" /> : <BarChart3 className="size-3" />}
                {view === 'chart' ? 'Données' : 'Graphique'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* A legend restates identity for two or more series. One series gets none. */}
      {legend.length >= 2 && view === 'chart' && (
        <ul className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5">
          {legend.map((entry) => (
            <li key={entry.key} className="inline-flex items-center gap-1.5 text-[0.75rem] text-fg-muted">
              <span
                className="size-2.5 shrink-0 rounded-sm"
                style={{ background: seriesVar(entry.slot) }}
                aria-hidden
              />
              {entry.label}
            </li>
          ))}
        </ul>
      )}

      {view === 'chart' ? (
        <div className="min-w-0 flex-1" style={{ minHeight }}>
          {children}
        </div>
      ) : (
        table && (
          <div className="max-h-[18rem] overflow-auto rounded-lg border border-line">
            <table className="w-full border-collapse text-[0.75rem]">
              <thead className="sticky top-0 bg-surface-sunken">
                <tr>
                  {table.columns.map((c, i) => (
                    <th
                      key={c}
                      className={cn(
                        'px-3 py-2 font-semibold text-fg-subtle',
                        i === 0 ? 'text-start' : 'text-end',
                      )}
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {table.rows.map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td
                        key={ci}
                        className={cn(
                          'px-3 py-1.5 text-fg',
                          ci === 0 ? 'text-start' : 'text-end tabular-nums',
                        )}
                      >
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </figure>
  );
}

/** Floating tooltip shared by every chart's hover layer. */
export function ChartTooltip({
  x,
  y,
  title,
  rows,
  visible,
}: {
  x: number;
  y: number;
  title: string;
  rows: { label: string; value: string; slot?: number }[];
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <div
      className="pointer-events-none absolute z-20 min-w-32 -translate-x-1/2 -translate-y-full rounded-lg border border-line bg-surface-raised px-2.5 py-2 shadow-raised"
      style={{ left: x, top: y - 10 }}
      role="tooltip"
    >
      <p className="mb-1 text-[0.6875rem] font-semibold text-fg">{title}</p>
      {rows.map((row) => (
        <p key={row.label} className="flex items-center gap-2 text-[0.6875rem] text-fg-muted">
          {row.slot !== undefined && (
            <span className="size-2 shrink-0 rounded-sm" style={{ background: seriesVar(row.slot) }} aria-hidden />
          )}
          <span className="flex-1 truncate">{row.label}</span>
          <span className="font-semibold tabular-nums text-fg">{row.value}</span>
        </p>
      ))}
    </div>
  );
}

/** Recessive hairline grid — solid, never dashed, one step off the surface. */
export function Gridlines({
  count = 4,
  width,
  height,
  padding,
}: {
  count?: number;
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
}) {
  const plotH = height - padding.top - padding.bottom;
  return (
    <g aria-hidden>
      {Array.from({ length: count + 1 }, (_, i) => {
        const y = padding.top + (plotH / count) * i;
        return (
          <line
            key={i}
            x1={padding.left}
            x2={width - padding.right}
            y1={y}
            y2={y}
            stroke="var(--line)"
            strokeWidth={1}
            shapeRendering="crispEdges"
          />
        );
      })}
    </g>
  );
}

/** Rounds an axis maximum up to a clean tick value (1 / 2 / 2.5 / 5 × 10^n). */
export function niceMax(value: number, ticks = 4): number {
  if (value <= 0) return ticks;
  const rough = value / ticks;
  const mag = 10 ** Math.floor(Math.log10(rough));
  const norm = rough / mag;
  const step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return step * mag * ticks;
}

/** Compact axis/tile formatting: 1 284 / 12,9 k / 4,2 M. */
export { compactNumber as compact } from './format';
