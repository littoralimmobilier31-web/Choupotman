'use client';

import * as React from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import { Input, Select } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * URL-driven filter bar shared by every admin list.
 *
 * State lives in the query string, so a filtered view is bookmarkable, survives
 * the back button, and the filtering itself happens on the server. The text field
 * is debounced to one navigation after typing stops.
 */

export type FilterSelect = {
  /** Query-string key. */
  key: string;
  label: string;
  options: { value: string; label: string; count?: number }[];
  /** Label for the "no filter" option. */
  allLabel?: string;
};

export function ListFilters({
  searchKey = 'q',
  searchPlaceholder = 'Rechercher…',
  selects = [],
  resultCount,
  resultLabel = 'résultat(s)',
  children,
  className,
}: {
  searchKey?: string;
  searchPlaceholder?: string;
  selects?: FilterSelect[];
  resultCount?: number;
  resultLabel?: string;
  /** Extra controls (e.g. a view switcher) rendered at the end of the bar. */
  children?: React.ReactNode;
  className?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentSearch = searchParams.get(searchKey) ?? '';
  const [search, setSearch] = React.useState(currentSearch);
  const [expanded, setExpanded] = React.useState(false);

  // Keep the input in sync when the URL changes from elsewhere (e.g. a reset).
  React.useEffect(() => setSearch(currentSearch), [currentSearch]);

  const push = React.useCallback(
    (updates: Record<string, string>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === '' ) params.delete(key);
        else params.set(key, value);
      }
      // Any filter change resets pagination.
      params.delete('page');
      const qs = params.toString();
      router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  React.useEffect(() => {
    if (search === currentSearch) return;
    const timer = setTimeout(() => push({ [searchKey]: search.trim() }), 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const activeFilters = selects
    .map((select) => ({ select, value: searchParams.get(select.key) ?? '' }))
    .filter((entry) => entry.value !== '');
  const hasFilters = activeFilters.length > 0 || currentSearch !== '';

  const reset = () => {
    setSearch('');
    router.push(pathname, { scroll: false });
  };

  return (
    <div className={cn('rounded-[var(--radius-card)] border border-line bg-surface-raised p-3', className)}>
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-48 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="ps-9"
          />
          {search !== '' && (
            <button
              type="button"
              onClick={() => { setSearch(''); push({ [searchKey]: '' }); }}
              aria-label="Effacer la recherche"
              className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-fg-subtle hover:text-fg"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        {selects.length > 0 && (
          <Button
            variant="secondary"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            className="sm:hidden"
          >
            <SlidersHorizontal className="size-4" />
            Filtres
            {activeFilters.length > 0 && (
              <span className="rounded-full bg-accent px-1.5 text-[0.625rem] font-bold text-accent-fg">
                {activeFilters.length}
              </span>
            )}
          </Button>
        )}

        <div className="hidden flex-wrap items-center gap-2 sm:flex">
          {selects.map((select) => (
            <Select
              key={select.key}
              value={searchParams.get(select.key) ?? ''}
              onChange={(e) => push({ [select.key]: e.target.value })}
              aria-label={select.label}
              className="w-auto min-w-36"
            >
              <option value="">{select.allLabel ?? select.label}</option>
              {select.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                  {option.count !== undefined ? ` (${option.count})` : ''}
                </option>
              ))}
            </Select>
          ))}
        </div>

        {children}

        {resultCount !== undefined && (
          <p className="ms-auto shrink-0 text-[0.75rem] tabular-nums text-fg-subtle">
            {resultCount} {resultLabel}
          </p>
        )}
      </div>

      {expanded && selects.length > 0 && (
        <div className="mt-2.5 grid gap-2 border-t border-line pt-2.5 sm:hidden">
          {selects.map((select) => (
            <Select
              key={select.key}
              value={searchParams.get(select.key) ?? ''}
              onChange={(e) => push({ [select.key]: e.target.value })}
              aria-label={select.label}
            >
              <option value="">{select.allLabel ?? select.label}</option>
              {select.options.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          ))}
        </div>
      )}

      {hasFilters && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
          {currentSearch !== '' && (
            <Chip label={`« ${currentSearch} »`} onClear={() => { setSearch(''); push({ [searchKey]: '' }); }} />
          )}
          {activeFilters.map(({ select, value }) => (
            <Chip
              key={select.key}
              label={select.options.find((o) => o.value === value)?.label ?? value}
              onClear={() => push({ [select.key]: '' })}
            />
          ))}
          <button
            type="button"
            onClick={reset}
            className="text-[0.6875rem] font-semibold text-accent hover:underline"
          >
            Réinitialiser
          </button>
        </div>
      )}
    </div>
  );
}

function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-1 text-[0.6875rem] font-medium text-accent">
      {label}
      <button type="button" onClick={onClear} aria-label={`Retirer ${label}`} className="hover:opacity-70">
        <X className="size-3" />
      </button>
    </span>
  );
}

/** Server-driven pagination control. */
export function Pagination({
  page,
  pageSize,
  total,
}: {
  page: number;
  pageSize: number;
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const pages = Math.max(1, Math.ceil(total / pageSize));

  if (pages <= 1) return null;

  const goto = (next: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (next <= 1) params.delete('page');
    else params.set('page', String(next));
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);

  return (
    <nav className="mt-4 flex flex-wrap items-center justify-between gap-3" aria-label="Pagination">
      <p className="text-[0.75rem] tabular-nums text-fg-subtle">
        {from}–{to} sur {total}
      </p>
      <div className="flex items-center gap-1.5">
        <Button variant="secondary" size="sm" onClick={() => goto(page - 1)} disabled={page <= 1}>
          Précédent
        </Button>
        <span className="px-2 text-[0.75rem] tabular-nums text-fg-muted">
          {page} / {pages}
        </span>
        <Button variant="secondary" size="sm" onClick={() => goto(page + 1)} disabled={page >= pages}>
          Suivant
        </Button>
      </div>
    </nav>
  );
}
