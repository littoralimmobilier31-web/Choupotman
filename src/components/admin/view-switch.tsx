'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

/**
 * URL-driven view switcher (kanban / list / calendar …).
 *
 * The choice lives in the query string like every other admin filter, so a view
 * is bookmarkable and the server decides what to render.
 */
export function ViewSwitch({
  paramKey,
  options,
  defaultValue,
  className,
}: {
  paramKey: string;
  options: { value: string; label: string }[];
  defaultValue: string;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = searchParams.get(paramKey) ?? defaultValue;

  const select = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (value === defaultValue) params.delete(paramKey);
    else params.set(paramKey, value);
    // Switching view must not carry over a selected row from the other one.
    params.delete('tache');
    params.delete('page');
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <div
      role="group"
      aria-label="Affichage"
      className={cn('inline-flex rounded-lg border border-line bg-surface p-0.5', className)}
    >
      {options.map((option) => {
        const active = option.value === current;
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => select(option.value)}
            aria-pressed={active}
            className={cn(
              'rounded-md px-2.5 py-1 text-[0.75rem] font-medium transition-colors',
              active ? 'bg-accent text-accent-fg' : 'text-fg-muted hover:text-fg',
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
