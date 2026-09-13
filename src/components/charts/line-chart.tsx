'use client';

import * as React from 'react';
import { ChartFrame, ChartTooltip, Gridlines, compact, niceMax, type LegendEntry } from './chart-frame';
import { resolveFormat, type NumberFormatSpec } from './format';
import { MARK, seriesVar } from './palette';

export type LineSeries = {
  key: string;
  label: string;
  /** Fixed palette slot — stable per entity so filtering never repaints. */
  slot: number;
  values: number[];
  /** Draw the area wash under the line (single-series revenue curves). */
  area?: boolean;
};

/**
 * Line / area chart with a crosshair + tooltip hover layer.
 * One y-axis only — a second measure of a different scale belongs in its own
 * chart, never on a twin axis.
 */
export function LineChart({
  labels,
  series,
  title,
  subtitle,
  height = 260,
  format,
  unit = '',
  showEndLabels = true,
}: {
  labels: string[];
  series: LineSeries[];
  title?: string;
  subtitle?: string;
  height?: number;
  /** Serializable formatting spec — a function cannot cross the server boundary. */
  format?: NumberFormatSpec;
  unit?: string;
  showEndLabels?: boolean;
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

  const padding = { top: 16, right: showEndLabels && series.length <= 4 ? 52 : 16, bottom: 28, left: 44 };
  const plotW = width - padding.left - padding.right;
  const plotH = height - padding.top - padding.bottom;

  const allValues = series.flatMap((s) => s.values);
  const max = niceMax(Math.max(1, ...allValues));
  const stepX = labels.length > 1 ? plotW / (labels.length - 1) : 0;

  const xAt = (i: number) => padding.left + stepX * i;
  const yAt = (v: number) => padding.top + plotH - (Math.max(0, v) / max) * plotH;

  const linePath = (values: number[]) =>
    values.map((v, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(2)},${yAt(v).toFixed(2)}`).join(' ');

  const areaPath = (values: number[]) =>
    `${linePath(values)} L${xAt(values.length - 1).toFixed(2)},${(padding.top + plotH).toFixed(2)} L${xAt(0).toFixed(2)},${(padding.top + plotH).toFixed(2)} Z`;

  // Show at most ~7 x-axis labels so text never collides on narrow screens.
  const labelStride = Math.max(1, Math.ceil(labels.length / Math.max(2, Math.floor(plotW / 68))));

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * width - padding.left;
    const idx = stepX ? Math.round(x / stepX) : 0;
    setHover(idx >= 0 && idx < labels.length ? idx : null);
  };

  const legend: LegendEntry[] = series.map((s) => ({ key: s.key, label: s.label, slot: s.slot }));

  return (
    <ChartFrame
      title={title}
      subtitle={subtitle}
      legend={legend}
      minHeight={height}
      table={{
        columns: ['Période', ...series.map((s) => s.label)],
        rows: labels.map((label, i) => [label, ...series.map((s) => fmt(s.values[i] ?? 0))]),
      }}
    >
      <div ref={wrapRef} className="relative w-full">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          width="100%"
          height={height}
          role="img"
          aria-label={title ?? 'graphique'}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
          className="overflow-visible"
        >
          <Gridlines count={4} width={width} height={height} padding={padding} />

          {/* y-axis ticks carry the values that aren't directly labelled */}
          {Array.from({ length: 5 }, (_, i) => {
            const value = (max / 4) * (4 - i);
            return (
              <text
                key={i}
                x={padding.left - 8}
                y={padding.top + (plotH / 4) * i + 4}
                textAnchor="end"
                className="fill-[var(--fg-subtle)] text-[0.625rem] tabular-nums"
              >
                {compact(value)}
              </text>
            );
          })}

          {labels.map((label, i) =>
            i % labelStride === 0 || i === labels.length - 1 ? (
              <text
                key={`${label}-${i}`}
                x={xAt(i)}
                y={height - 8}
                textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}
                className="fill-[var(--fg-subtle)] text-[0.625rem]"
              >
                {label}
              </text>
            ) : null,
          )}

          {/* crosshair */}
          {hover !== null && (
            <line
              x1={xAt(hover)}
              x2={xAt(hover)}
              y1={padding.top}
              y2={padding.top + plotH}
              stroke="var(--line-strong)"
              strokeWidth={1}
            />
          )}

          {series.map((s) => (
            <g key={s.key}>
              {s.area && (
                <path d={areaPath(s.values)} fill={seriesVar(s.slot)} fillOpacity={MARK.areaOpacity} />
              )}
              <path
                d={linePath(s.values)}
                fill="none"
                stroke={seriesVar(s.slot)}
                strokeWidth={MARK.lineWidth}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* end marker with a 2px surface ring so it stays legible on overlap */}
              {s.values.length > 0 && (
                <circle
                  cx={xAt(s.values.length - 1)}
                  cy={yAt(s.values[s.values.length - 1] ?? 0)}
                  r={MARK.markerRadius}
                  fill={seriesVar(s.slot)}
                  stroke="var(--surface-raised)"
                  strokeWidth={MARK.surfaceRing}
                />
              )}
              {hover !== null && (
                <circle
                  cx={xAt(hover)}
                  cy={yAt(s.values[hover] ?? 0)}
                  r={MARK.markerRadius}
                  fill={seriesVar(s.slot)}
                  stroke="var(--surface-raised)"
                  strokeWidth={MARK.surfaceRing}
                />
              )}
            </g>
          ))}

          {/* Selective direct labels: only the endpoint, and only when <= 4 series */}
          {showEndLabels &&
            series.length <= 4 &&
            series.map((s) => {
              const last = s.values[s.values.length - 1] ?? 0;
              return (
                <text
                  key={`end-${s.key}`}
                  x={xAt(s.values.length - 1) + 9}
                  y={yAt(last) + 3.5}
                  className="fill-[var(--fg)] text-[0.625rem] font-semibold"
                >
                  {fmt(last)}
                </text>
              );
            })}
        </svg>

        {hover !== null && (
          <ChartTooltip
            visible
            x={(xAt(hover) / width) * (wrapRef.current?.clientWidth ?? width)}
            y={((yAt(Math.max(...series.map((s) => s.values[hover] ?? 0))) ) / height) * height}
            title={labels[hover] ?? ''}
            rows={series.map((s) => ({
              label: s.label,
              value: `${fmt(s.values[hover] ?? 0)}${unit ? ` ${unit}` : ''}`,
              slot: s.slot,
            }))}
          />
        )}
      </div>
    </ChartFrame>
  );
}
