'use client';

import * as React from 'react';
import { ChartFrame, ChartTooltip, Gridlines, compact, niceMax, type LegendEntry } from './chart-frame';
import { resolveFormat, type NumberFormatSpec } from './format';
import { MARK, seriesVar } from './palette';

export type BarSeries = { key: string; label: string; slot: number; values: number[] };

/**
 * Column chart — grouped or stacked. Marks are capped at 24px so the band's
 * leftover space stays as air, caps are rounded 4px at the data end and square
 * at the baseline, and touching fills are separated by a 2px surface gap.
 */
export function BarChart({
  labels,
  series,
  title,
  subtitle,
  height = 260,
  stacked = false,
  format,
  unit = '',
}: {
  labels: string[];
  series: BarSeries[];
  title?: string;
  subtitle?: string;
  height?: number;
  stacked?: boolean;
  format?: NumberFormatSpec;
  unit?: string;
}) {
  const fmt = React.useMemo(() => resolveFormat(format), [format]);
  const [hover, setHover] = React.useState<number | null>(null);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(640);

  React.useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const padding = { top: 16, right: 12, bottom: 28, left: 44 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const totals = labels.map((_, i) => series.reduce((acc, s) => acc + (s.values[i] ?? 0), 0));
  const max = niceMax(
    stacked ? Math.max(1, ...totals) : Math.max(1, ...series.flatMap((s) => s.values)),
  );

  const band = labels.length ? plotW / labels.length : plotW;
  const groupWidth = Math.min(MARK.barMaxThickness * (stacked ? 1 : series.length), band * 0.62);
  const barWidth = stacked ? groupWidth : groupWidth / Math.max(1, series.length);

  const baseline = padding.top + plotH;
  const hAt = (v: number) => (Math.max(0, v) / max) * plotH;
  const bandCenter = (i: number) => padding.left + band * i + band / 2;

  const labelStride = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(plotW / 64))));
  const legend: LegendEntry[] = series.map((s) => ({ key: s.key, label: s.label, slot: s.slot }));

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      legend={legend}
      minHeight={height}
      table={{
        columns: ['Période', ...series.map((s) => s.label), ...(stacked ? ['Total'] : [])],
        rows: labels.map((label, i) => [
          label,
          ...series.map((s) => fmt(s.values[i] ?? 0)),
          ...(stacked ? [fmt(totals[i] ?? 0)] : []),
        ]),
      }}
    >
      <div ref={wrapRef} className="relative w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          role="img"
          aria-label={title ?? 'graphique'}
          onMouseLeave={() => setHover(null)}
        >
          <Gridlines count={4} width={width} height={height} padding={padding} />

          {Array.from({ length: 5 }, (_, i) => (
            <text
              key={i}
              x={padding.left - 8}
              y={padding.top + (plotH / 4) * i + 4}
              textAnchor="end"
              className="fill-[var(--fg-subtle)] text-[0.625rem] tabular-nums"
            >
              {compact((max / 4) * (4 - i))}
            </text>
          ))}

          {labels.map((label, i) => {
            let stackTop = baseline;
            return (
              <g
                key={`${label}-${i}`}
                onMouseEnter={() => setHover(i)}
                className="cursor-default"
              >
                {/* Generous invisible hit target — bigger than the mark itself */}
                <rect
                  x={padding.left + band * i}
                  y={padding.top}
                  width={band}
                  height={plotH}
                  fill={hover === i ? 'var(--surface-hover)' : 'transparent'}
                  opacity={hover === i ? 0.7 : 1}
                />
                {series.map((s, si) => {
                  const value = s.values[i] ?? 0;
                  const rawH = hAt(value);
                  if (rawH <= 0) return null;
                  if (stacked) {
                    // 2px surface gap between touching segments
                    const gap = si === 0 ? 0 : MARK.surfaceGap;
                    const h = Math.max(1, rawH - gap);
                    const y = stackTop - h;
                    stackTop = y - gap;
                    const isTop = si === series.length - 1;
                    return (
                      <rect
                        key={s.key}
                        x={bandCenter(i) - barWidth / 2}
                        y={y}
                        width={barWidth}
                        height={h}
                        rx={isTop ? MARK.barRadius : 0}
                        fill={seriesVar(s.slot)}
                      />
                    );
                  }
                  const groupStart = bandCenter(i) - groupWidth / 2;
                  // adjacent bars get the same 2px surface gap
                  const w = Math.max(2, barWidth - MARK.surfaceGap);
                  return (
                    <rect
                      key={s.key}
                      x={groupStart + barWidth * si + MARK.surfaceGap / 2}
                      y={baseline - rawH}
                      width={w}
                      height={rawH}
                      rx={MARK.barRadius}
                      fill={seriesVar(s.slot)}
                    />
                  );
                })}
              </g>
            );
          })}

          {/* square the rounded corners back off at the baseline */}
          <rect
            x={padding.left}
            y={baseline - MARK.barRadius}
            width={plotW}
            height={MARK.barRadius}
            fill="transparent"
          />
          <line
            x1={padding.left}
            x2={width - padding.right}
            y1={baseline}
            y2={baseline}
            stroke="var(--line-strong)"
            strokeWidth={1}
            shapeRendering="crispEdges"
          />

          {labels.map((label, i) =>
            i % labelStride === 0 || i === labels.length - 1 ? (
              <text
                key={`x-${label}-${i}`}
                x={bandCenter(i)}
                y={height - 8}
                textAnchor="middle"
                className="fill-[var(--fg-subtle)] text-[0.625rem]"
              >
                {label}
              </text>
            ) : null,
          )}
        </svg>

        {hover !== null && (
          <ChartTooltip
            visible
            x={(bandCenter(hover) / width) * (wrapRef.current?.clientWidth ?? width)}
            y={baseline - hAt(stacked ? totals[hover] ?? 0 : Math.max(...series.map((s) => s.values[hover] ?? 0)))}
            title={labels[hover] ?? ''}
            rows={[
              ...series.map((s) => ({
                label: s.label,
                value: `${fmt(s.values[hover] ?? 0)}${unit ? ` ${unit}` : ''}`,
                slot: s.slot,
              })),
              ...(stacked && series.length > 1
                ? [{ label: 'Total', value: `${fmt(totals[hover] ?? 0)}${unit ? ` ${unit}` : ''}` }]
                : []),
            ]}
          />
        )}
      </div>
    </ChartFrame>
  );
}

/** Horizontal bars — the right form when category names are long. */
export function HBarChart({
  items,
  title,
  subtitle,
  format,
  maxItems = 8,
}: {
  items: { label: string; value: number; slot?: number }[];
  title?: string;
  subtitle?: string;
  format?: NumberFormatSpec;
  maxItems?: number;
}) {
  const fmt = React.useMemo(() => resolveFormat(format), [format]);
  // Beyond maxItems the tail folds into "Autres" instead of inventing hues.
  const sorted = [...items].sort((a, b) => b.value - a.value);
  const head = sorted.slice(0, maxItems);
  const tail = sorted.slice(maxItems);
  const rows =
    tail.length > 0
      ? [...head, { label: 'Autres', value: tail.reduce((a, b) => a + b.value, 0), slot: 5 }]
      : head;
  const max = Math.max(1, ...rows.map((r) => r.value));

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      minHeight={rows.length * 34}
      table={{ columns: ['Élément', 'Valeur'], rows: rows.map((r) => [r.label, fmt(r.value)]) }}
    >
      <ul className="flex flex-col gap-2.5">
        {rows.map((row, i) => (
          <li key={row.label} className="group min-w-0">
            <div className="mb-1 flex items-baseline justify-between gap-3">
              <span className="truncate text-[0.75rem] text-fg-muted">{row.label}</span>
              <span className="shrink-0 text-[0.75rem] font-semibold tabular-nums text-fg">
                {fmt(row.value)}
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-surface-sunken">
              <div
                className="h-full rounded-e-[4px] transition-[width] duration-500"
                style={{
                  width: `${Math.max(2, (row.value / max) * 100)}%`,
                  background: seriesVar(row.slot ?? i),
                }}
              />
            </div>
          </li>
        ))}
      </ul>
    </ChartFrame>
  );
}
