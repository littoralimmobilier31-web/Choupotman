'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import * as Icons from 'lucide-react';
import { Search, CornerDownLeft, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NavItem } from '@/lib/admin-nav';

/**
 * Global search palette (Ctrl/⌘ + K).
 *
 * Two result sources, always in this order: navigation entries matched locally
 * (instant, no round-trip) and records matched by the server through the search
 * index. Queries are debounced and aborted on change, so typing fast never
 * produces out-of-order results.
 */

type SearchHit = {
  entity_type: string;
  entity_id: number;
  title: string;
  subtitle: string | null;
  snippet: string | null;
  url: string;
  type_label: string;
};

function Icon({ name, className }: { name: string; className?: string }) {
  const Component = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  const Resolved = Component ?? Icons.Circle;
  return <Resolved className={className} />;
}

const TYPE_ICONS: Record<string, string> = {
  client: 'Users', project: 'FolderKanban', task: 'ListChecks', invoice: 'Receipt',
  quote: 'FileText', contract: 'FileSignature', file: 'File', message: 'Mail',
  post: 'Newspaper', portfolio: 'Image', case_study: 'BookOpen', lead: 'Target',
  service: 'Layers', brief: 'ClipboardList', moodboard: 'Palette',
  expense: 'CreditCard', subscription: 'RefreshCcwDot',
};

export function CommandPalette({ navItems }: { navItems: NavItem[] }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [hits, setHits] = React.useState<SearchHit[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [selected, setSelected] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  // Ctrl/⌘+K toggles, Esc closes.
  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (event.key === 'Escape' && open) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  React.useEffect(() => {
    if (open) {
      setSelected(0);
      // Focus after the dialog has painted.
      requestAnimationFrame(() => inputRef.current?.focus());
    } else {
      setQuery('');
      setHits([]);
    }
  }, [open]);

  // Debounced server search, with abort so stale responses are discarded.
  React.useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/recherche?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error('search failed');
        const payload = (await response.json()) as { results: SearchHit[] };
        setHits(payload.results ?? []);
      } catch {
        // Aborted or failed — navigation results still work.
      } finally {
        setLoading(false);
      }
    }, 220);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [query]);

  const navMatches = React.useMemo(() => {
    const term = query.trim().toLowerCase();
    if (term === '') return navItems.slice(0, 7);
    return navItems
      .filter((item) => {
        const haystack = [item.label, item.description ?? '', ...(item.keywords ?? [])]
          .join(' ')
          .toLowerCase();
        return haystack.includes(term);
      })
      .slice(0, 6);
  }, [navItems, query]);

  type Row =
    | { kind: 'nav'; item: NavItem }
    | { kind: 'hit'; hit: SearchHit };

  const rows: Row[] = React.useMemo(
    () => [
      ...navMatches.map((item) => ({ kind: 'nav' as const, item })),
      ...hits.map((hit) => ({ kind: 'hit' as const, hit })),
    ],
    [navMatches, hits],
  );

  React.useEffect(() => {
    setSelected((current) => Math.min(current, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  const go = React.useCallback(
    (href: string) => {
      setOpen(false);
      router.push(href);
    },
    [router],
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected((v) => Math.min(rows.length - 1, v + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected((v) => Math.max(0, v - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const row = rows[selected];
      if (!row) return;
      go(row.kind === 'nav' ? row.item.href : row.hit.url);
    }
  };

  // Keep the highlighted row in view when navigating with the keyboard.
  React.useEffect(() => {
    const list = listRef.current;
    const active = list?.querySelector('[data-selected="true"]');
    active?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-9 w-full max-w-xs items-center gap-2 rounded-lg border border-line bg-surface px-3 text-[0.8125rem] text-fg-subtle transition-colors hover:border-line-strong hover:text-fg-muted"
      >
        <Search className="size-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate text-start">Rechercher…</span>
        <kbd className="hidden shrink-0 rounded border border-line bg-surface-sunken px-1.5 py-0.5 font-mono text-[0.625rem] text-fg-subtle sm:inline">
          ⌘K
        </kbd>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[90] flex items-start justify-center bg-ink-950/50 p-4 pt-[10vh] backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
          role="presentation"
        >
          <div
            className="flex max-h-[70vh] w-full max-w-xl animate-scale-in flex-col overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface-raised shadow-raised"
            role="dialog"
            aria-modal="true"
            aria-label="Recherche globale"
          >
            <div className="flex shrink-0 items-center gap-2.5 border-b border-line px-4">
              <Search className="size-4 shrink-0 text-fg-subtle" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Clients, projets, factures, fichiers…"
                aria-label="Recherche"
                className="h-12 min-w-0 flex-1 bg-transparent text-[0.9375rem] text-fg outline-none placeholder:text-fg-subtle"
              />
              {loading && <Loader2 className="size-4 shrink-0 animate-spin text-fg-subtle" />}
              <kbd className="shrink-0 rounded border border-line bg-surface-sunken px-1.5 py-0.5 font-mono text-[0.625rem] text-fg-subtle">
                esc
              </kbd>
            </div>

            <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-2" role="listbox">
              {rows.length === 0 && (
                <li className="px-3 py-8 text-center text-[0.8125rem] text-fg-subtle">
                  {query.trim().length < 2 ? 'Tapez au moins 2 caractères.' : 'Aucun résultat.'}
                </li>
              )}

              {navMatches.length > 0 && (
                <li className="px-2 pb-1 pt-2 text-[0.625rem] font-semibold uppercase tracking-wider text-fg-subtle">
                  Navigation
                </li>
              )}
              {navMatches.map((item, index) => (
                <li key={item.href}>
                  <button
                    type="button"
                    data-selected={selected === index}
                    onMouseEnter={() => setSelected(index)}
                    onClick={() => go(item.href)}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-start transition-colors',
                      selected === index ? 'bg-accent-soft' : 'hover:bg-surface-hover',
                    )}
                  >
                    <Icon name={item.icon} className="size-4 shrink-0 text-fg-subtle" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.8125rem] font-medium text-fg">{item.label}</span>
                      {item.description && (
                        <span className="block truncate text-[0.6875rem] text-fg-subtle">{item.description}</span>
                      )}
                    </span>
                    {selected === index && <CornerDownLeft className="size-3.5 shrink-0 text-fg-subtle" />}
                  </button>
                </li>
              ))}

              {hits.length > 0 && (
                <li className="px-2 pb-1 pt-3 text-[0.625rem] font-semibold uppercase tracking-wider text-fg-subtle">
                  Résultats
                </li>
              )}
              {hits.map((hit, i) => {
                const index = navMatches.length + i;
                return (
                  <li key={`${hit.entity_type}-${hit.entity_id}`}>
                    <button
                      type="button"
                      data-selected={selected === index}
                      onMouseEnter={() => setSelected(index)}
                      onClick={() => go(hit.url)}
                      className={cn(
                        'flex w-full items-start gap-3 rounded-lg px-2.5 py-2 text-start transition-colors',
                        selected === index ? 'bg-accent-soft' : 'hover:bg-surface-hover',
                      )}
                    >
                      <Icon
                        name={TYPE_ICONS[hit.entity_type] ?? 'Circle'}
                        className="mt-0.5 size-4 shrink-0 text-fg-subtle"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className="min-w-0 truncate text-[0.8125rem] font-medium text-fg">{hit.title}</span>
                          <span className="shrink-0 rounded bg-surface-sunken px-1.5 py-0.5 text-[0.5625rem] font-semibold uppercase tracking-wide text-fg-subtle">
                            {hit.type_label}
                          </span>
                        </span>
                        {(hit.subtitle || hit.snippet) && (
                          <span className="mt-0.5 block truncate text-[0.6875rem] text-fg-subtle">
                            {hit.subtitle ?? hit.snippet}
                          </span>
                        )}
                      </span>
                      {selected === index && <CornerDownLeft className="mt-1 size-3.5 shrink-0 text-fg-subtle" />}
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="flex shrink-0 items-center gap-4 border-t border-line px-4 py-2 text-[0.625rem] text-fg-subtle">
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-line px-1">↑</kbd>
                <kbd className="rounded border border-line px-1">↓</kbd>
                naviguer
              </span>
              <span className="inline-flex items-center gap-1">
                <kbd className="rounded border border-line px-1">↵</kbd>
                ouvrir
              </span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
