'use client';

import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';

export type TabItem = { key: string; label: string; count?: number; href?: string };

/** Controlled pill tabs (client state) or link tabs (router-driven). */
export function Tabs({
  items,
  active,
  onChange,
  className,
}: {
  items: TabItem[];
  active: string;
  onChange?: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('hide-scrollbar -mx-1 flex gap-1 overflow-x-auto px-1', className)} role="tablist">
      {items.map((item) => {
        const isActive = item.key === active;
        const inner = (
          <>
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  'ms-1.5 rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold tabular-nums',
                  isActive ? 'bg-accent-fg/20 text-accent-fg' : 'bg-surface-sunken text-fg-subtle',
                )}
              >
                {item.count}
              </span>
            )}
          </>
        );
        const classes = cn(
          'inline-flex shrink-0 items-center rounded-lg px-3 py-1.5 text-[0.8125rem] font-medium transition-colors',
          isActive ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
        );
        return item.href ? (
          <Link key={item.key} href={item.href} className={classes} role="tab" aria-selected={isActive}>
            {inner}
          </Link>
        ) : (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange?.(item.key)}
            className={classes}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}

/** Underline variant for in-page section navigation (project detail, etc). */
export function SegmentTabs({
  items,
  active,
  onChange,
  className,
}: {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={cn('hide-scrollbar flex gap-5 overflow-x-auto border-b border-line', className)} role="tablist">
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.key)}
            className={cn(
              'relative shrink-0 pb-2.5 text-[0.8125rem] font-medium transition-colors',
              isActive ? 'text-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span className="ms-1.5 text-[0.6875rem] tabular-nums text-fg-subtle">{item.count}</span>
            )}
            {isActive && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-accent" />}
          </button>
        );
      })}
    </div>
  );
}
