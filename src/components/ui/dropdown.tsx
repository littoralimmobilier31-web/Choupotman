'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Lightweight popover menu. Closes on outside click, Esc, and route change
 * (via the `key` the caller gives it). No portal needed — it is positioned
 * relative to its trigger.
 */
export function Dropdown({
  trigger,
  children,
  align = 'end',
  className,
  panelClassName,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => React.ReactNode;
  children: React.ReactNode | ((close: () => void) => React.ReactNode);
  align?: 'start' | 'end';
  className?: string;
  panelClassName?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const close = React.useCallback(() => setOpen(false), []);

  return (
    <div ref={ref} className={cn('relative', className)}>
      {trigger({ open, toggle: () => setOpen((v) => !v) })}
      {open && (
        <div
          className={cn(
            'absolute z-50 mt-1.5 min-w-52 animate-scale-in overflow-hidden rounded-lg border border-line bg-surface-raised p-1 shadow-raised',
            align === 'end' ? 'end-0 origin-top-right' : 'start-0 origin-top-left',
            panelClassName,
          )}
          role="menu"
        >
          {typeof children === 'function' ? children(close) : children}
        </div>
      )}
    </div>
  );
}

export function DropdownItem({
  className,
  tone = 'default',
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { tone?: 'default' | 'danger' }) {
  return (
    <button
      type="button"
      role="menuitem"
      className={cn(
        'flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-start text-[0.8125rem] transition-colors',
        tone === 'danger'
          ? 'text-danger hover:bg-danger-soft'
          : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
        className,
      )}
      {...props}
    />
  );
}

export function DropdownLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 pb-1 pt-2 text-[0.625rem] font-semibold uppercase tracking-wider text-fg-subtle">
      {children}
    </p>
  );
}

export function DropdownSeparator() {
  return <hr className="my-1 border-line" />;
}
