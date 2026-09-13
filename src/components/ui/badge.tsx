import * as React from 'react';
import { cn } from '@/lib/utils';

export type BadgeTone =
  | 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'outline';

const tones: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunken text-fg-muted border-line',
  brand: 'bg-accent-soft text-accent border-transparent',
  success: 'bg-success-soft text-success border-transparent',
  warning: 'bg-warning-soft text-warning border-transparent',
  danger: 'bg-danger-soft text-danger border-transparent',
  info: 'bg-info-soft text-info border-transparent',
  outline: 'bg-transparent text-fg-muted border-line-strong',
};

export function Badge({
  className,
  tone = 'neutral',
  dot = false,
  children,
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; dot?: boolean }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[0.6875rem] font-semibold tracking-wide whitespace-nowrap',
        tones[tone],
        className,
      )}
      {...props}
    >
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
