'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Search, X, SlidersHorizontal } from 'lucide-react';
import { Input, Select } from '@/components/ui/field';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { Dictionary } from '@/lib/i18n/types';

/**
 * Portfolio filters.
 *
 * State lives in the URL so a filtered view is shareable and survives the back
 * button; the server does the actual filtering. The text search is debounced to
 * avoid a navigation per keystroke.
 */
export function ProjectFilters({
  dict,
  facets,
  current,
  resultCount,
}: {
  dict: Dictionary;
  facets: { categories: { slug: string; name: string }[]; technologies: string[]; years: number[] };
  current: { q: string; categorie: string; techno: string; annee: string };
  resultCount: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = React.useState(current.q);
  const [showFilters, setShowFilters] = React.useState(false);

  const push = React.useCallback(
    (next: Partial<typeof current>) => {
      const params = new URLSearchParams();
      const merged = { ...current, ...next };
      for (const [key, value] of Object.entries(merged)) {
        if (value && value.trim() !== '') params.set(key, value);
      }
      const queryString = params.toString();
      router.push(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    },
    [current, pathname, router],
  );

  // Debounce the text field: one navigation after the user stops typing.
  React.useEffect(() => {
    if (search === current.q) return;
    const timer = setTimeout(() => push({ q: search }), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const hasFilters =
    current.q !== '' || current.categorie !== '' || current.techno !== '' || current.annee !== '';

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface-raised p-4 shadow-soft">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={dict.projects.search}
            aria-label={dict.projects.search}
            className="ps-9"
          />
          {search !== '' && (
            <button
              type="button"
              onClick={() => { setSearch(''); push({ q: '' }); }}
              className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-fg-subtle hover:text-fg"
              aria-label={dict.common.cancel}
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>

        <Button
          variant="secondary"
          onClick={() => setShowFilters((v) => !v)}
          aria-expanded={showFilters}
          className="sm:hidden"
        >
          <SlidersHorizontal className="size-4" />
          {dict.projects.filters}
        </Button>

        <div className={cn('hidden flex-wrap items-center gap-2.5 sm:flex')}>
          <FilterSelects dict={dict} facets={facets} current={current} onChange={push} />
        </div>

        <p className="ms-auto shrink-0 text-[0.75rem] tabular-nums text-fg-subtle">
          {resultCount} {dict.projects.resultCount}
        </p>
      </div>

      {showFilters && (
        <div className="mt-3 grid gap-2.5 border-t border-line pt-3 sm:hidden">
          <FilterSelects dict={dict} facets={facets} current={current} onChange={push} stacked />
        </div>
      )}

      {hasFilters && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          {current.q && <Chip label={`"${current.q}"`} onClear={() => { setSearch(''); push({ q: '' }); }} />}
          {current.categorie && (
            <Chip
              label={facets.categories.find((c) => c.slug === current.categorie)?.name ?? current.categorie}
              onClear={() => push({ categorie: '' })}
            />
          )}
          {current.techno && <Chip label={current.techno} onClear={() => push({ techno: '' })} />}
          {current.annee && <Chip label={current.annee} onClear={() => push({ annee: '' })} />}
          <button
            type="button"
            onClick={() => { setSearch(''); router.push(pathname, { scroll: false }); }}
            className="text-[0.6875rem] font-semibold text-accent hover:underline"
          >
            {dict.projects.resetFilters}
          </button>
        </div>
      )}
    </div>
  );
}

function FilterSelects({
  dict,
  facets,
  current,
  onChange,
  stacked = false,
}: {
  dict: Dictionary;
  facets: { categories: { slug: string; name: string }[]; technologies: string[]; years: number[] };
  current: { q: string; categorie: string; techno: string; annee: string };
  onChange: (next: Partial<{ q: string; categorie: string; techno: string; annee: string }>) => void;
  stacked?: boolean;
}) {
  const width = stacked ? 'w-full' : 'w-auto min-w-36';
  return (
    <>
      {facets.categories.length > 0 && (
        <Select
          value={current.categorie}
          onChange={(e) => onChange({ categorie: e.target.value })}
          aria-label={dict.projects.allCategories}
          className={width}
        >
          <option value="">{dict.projects.allCategories}</option>
          {facets.categories.map((category) => (
            <option key={category.slug} value={category.slug}>
              {category.name}
            </option>
          ))}
        </Select>
      )}

      {facets.technologies.length > 0 && (
        <Select
          value={current.techno}
          onChange={(e) => onChange({ techno: e.target.value })}
          aria-label={dict.projects.allTechnologies}
          className={width}
        >
          <option value="">{dict.projects.allTechnologies}</option>
          {facets.technologies.map((tech) => (
            <option key={tech} value={tech}>
              {tech}
            </option>
          ))}
        </Select>
      )}

      {facets.years.length > 0 && (
        <Select
          value={current.annee}
          onChange={(e) => onChange({ annee: e.target.value })}
          aria-label={dict.projects.allYears}
          className={stacked ? 'w-full' : 'w-auto min-w-28'}
        >
          <option value="">{dict.projects.allYears}</option>
          {facets.years.map((year) => (
            <option key={year} value={String(year)}>
              {year}
            </option>
          ))}
        </Select>
      )}
    </>
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
