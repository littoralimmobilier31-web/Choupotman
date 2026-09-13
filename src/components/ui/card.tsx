import * as React from 'react';
import { cn } from '@/lib/utils';

export function Card({
  className,
  as: Tag = 'div',
  interactive = false,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { as?: React.ElementType; interactive?: boolean }) {
  return (
    <Tag
      className={cn(
        'rounded-[var(--radius-card)] border border-line bg-surface-raised shadow-soft',
        interactive &&
          'transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-raised',
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-wrap items-start justify-between gap-3 p-5 pb-0', className)} {...props} />;
}

export function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-[0.9375rem] font-semibold text-fg', className)} {...props} />;
}

export function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('mt-1 text-[0.8125rem] leading-relaxed text-fg-muted', className)} {...props} />;
}

export function CardBody({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('p-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('flex flex-wrap items-center gap-3 border-t border-line px-5 py-3.5', className)}
      {...props}
    />
  );
}
