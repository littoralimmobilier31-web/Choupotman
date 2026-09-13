'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import * as Icons from 'lucide-react';
import { cn } from '@/lib/utils';
import { ADMIN_NAV, type NavGroup } from '@/lib/admin-nav';

/**
 * Admin sidebar.
 *
 * Receives an already-filtered nav tree — the server removes anything the user's
 * role cannot reach, so the client never has to know about permissions and there
 * is no flash of links that then disappear.
 */

export type BadgeCounts = Record<string, number>;

/** Resolves a lucide icon by name, with a safe fallback. */
function Icon({ name, className }: { name: string; className?: string }) {
  const Component = (Icons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[name];
  const Fallback = Icons.Circle;
  const Resolved = Component ?? Fallback;
  return <Resolved className={className} />;
}

export function Sidebar({
  groups,
  badges,
  collapsed,
  onNavigate,
}: {
  groups: NavGroup[];
  badges: BadgeCounts;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();

  const isActive = (href: string) =>
    href === '/espace-admin' ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav className="flex flex-col gap-5 py-4" aria-label="Navigation de l’administration">
      {groups.map((group) => (
        <div key={group.label}>
          {!collapsed && (
            <p className="mb-1.5 px-3 text-[0.625rem] font-semibold uppercase tracking-[0.12em] text-fg-subtle">
              {group.label}
            </p>
          )}
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = isActive(item.href);
              const count = item.badge ? (badges[item.badge] ?? 0) : 0;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    title={collapsed ? item.label : undefined}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'group flex items-center gap-2.5 rounded-lg px-3 py-2 text-[0.8125rem] font-medium transition-colors',
                      collapsed && 'justify-center px-2',
                      active
                        ? 'bg-accent-soft text-accent'
                        : 'text-fg-muted hover:bg-surface-hover hover:text-fg',
                    )}
                  >
                    <Icon
                      name={item.icon}
                      className={cn('size-4 shrink-0', active ? 'text-accent' : 'text-fg-subtle group-hover:text-fg')}
                    />
                    {!collapsed && <span className="min-w-0 flex-1 truncate">{item.label}</span>}
                    {count > 0 && (
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-1.5 py-0.5 text-[0.625rem] font-bold tabular-nums',
                          collapsed
                            ? 'absolute -end-0.5 -top-0.5'
                            : '',
                          item.badge === 'overdueInvoices'
                            ? 'bg-danger text-white'
                            : 'bg-accent text-accent-fg',
                        )}
                        aria-label={`${count} élément(s)`}
                      >
                        {count > 99 ? '99+' : count}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

export { ADMIN_NAV };
