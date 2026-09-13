import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Tables are the densest part of the admin, so they get their own wrapper
 * that owns horizontal overflow — the page body must never scroll sideways.
 */
export function TableWrap({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div className={cn('w-full overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface-raised', className)}>
      {children}
    </div>
  );
}

export function Table({ className, ...props }: React.TableHTMLAttributes<HTMLTableElement>) {
  return <table className={cn('w-full border-collapse text-sm', className)} {...props} />;
}

export function Thead({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('border-b border-line bg-surface-sunken/60', className)} {...props} />;
}

/** `alignment` rather than `align`: the native HTML attribute is deprecated and
 *  its typing does not allow logical values, which RTL needs. */
type Alignment = 'start' | 'end' | 'center';

const alignClass: Record<Alignment, string> = {
  start: 'text-start',
  end: 'text-end',
  center: 'text-center',
};

export function Th({
  className,
  alignment = 'start',
  ...props
}: Omit<React.ThHTMLAttributes<HTMLTableCellElement>, 'align'> & { alignment?: Alignment }) {
  return (
    <th
      className={cn(
        'px-4 py-2.5 text-[0.6875rem] font-semibold uppercase tracking-wider whitespace-nowrap text-fg-subtle',
        alignClass[alignment],
        className,
      )}
      {...props}
    />
  );
}

export function Tbody({ className, ...props }: React.HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={cn('divide-y divide-line', className)} {...props} />;
}

export function Tr({ className, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('transition-colors hover:bg-surface-hover/60', className)} {...props} />;
}

export function Td({
  className,
  alignment = 'start',
  ...props
}: Omit<React.TdHTMLAttributes<HTMLTableCellElement>, 'align'> & { alignment?: Alignment }) {
  return (
    <td
      className={cn('px-4 py-3 align-middle text-[0.8125rem] text-fg', alignClass[alignment], className)}
      {...props}
    />
  );
}

export function TableEmpty({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-12 text-center text-[0.8125rem] text-fg-muted">
        {children}
      </td>
    </tr>
  );
}
