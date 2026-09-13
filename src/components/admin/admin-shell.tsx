'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell, ChevronsLeft, ChevronsRight, ExternalLink, LogOut,
  Menu, PanelLeftClose, User, X, Check,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Sidebar, type BadgeCounts } from './sidebar';
import { CommandPalette } from './command-palette';
import { ThemeToggle } from '@/components/theme';
import { Avatar } from '@/components/ui/misc';
import { Dropdown, DropdownItem, DropdownLabel, DropdownSeparator } from '@/components/ui/dropdown';
import { findNavItem, type NavGroup, type NavItem } from '@/lib/admin-nav';
import { formatRelative } from '@/lib/i18n/format';
import type { NotificationRow } from '@/lib/db/types';

/**
 * Admin chrome: collapsible sidebar, top bar with global search, notification
 * bell and account menu.
 *
 * The nav tree arrives already filtered by permission, so nothing here can leak a
 * section the user cannot open. Sidebar collapse is a per-viewer convenience and
 * lives in localStorage.
 */

const COLLAPSE_KEY = 'chp-admin-collapsed';

export function AdminShell({
  user,
  groups,
  navItems,
  badges,
  notifications,
  unreadCount,
  children,
}: {
  user: { username: string; fullName: string | null; roleName: string; avatarPath: string | null };
  groups: NavGroup[];
  navItems: NavItem[];
  badges: BadgeCounts;
  notifications: NotificationRow[];
  unreadCount: number;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [loggingOut, setLoggingOut] = React.useState(false);

  React.useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      // Site data blocked — keep the expanded default.
    }
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch { /* ignore */ }
      return next;
    });
  };

  React.useEffect(() => setMobileOpen(false), [pathname]);

  React.useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const current = findNavItem(pathname);

  async function logout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await fetch('/api/auth/deconnexion', { method: 'POST' });
    } finally {
      router.push('/espace-admin/connexion');
      router.refresh();
    }
  }

  return (
    <div className="flex min-h-dvh bg-surface">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          'sticky top-0 hidden h-dvh shrink-0 flex-col border-e border-line bg-surface-raised transition-[width] duration-200 lg:flex',
          collapsed ? 'w-16' : 'w-60',
        )}
      >
        <div className={cn('flex h-14 shrink-0 items-center border-b border-line', collapsed ? 'justify-center px-2' : 'justify-between px-4')}>
          <Link href="/espace-admin" className="flex min-w-0 items-center gap-2.5">
            <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-[0.75rem] font-bold text-accent-fg">
              BC
            </span>
            {!collapsed && (
              <span className="min-w-0 truncate text-[0.8125rem] font-semibold tracking-tight text-fg">
                CHOUPOTMAN OS
              </span>
            )}
          </Link>
          {!collapsed && (
            <button
              type="button"
              onClick={toggleCollapsed}
              aria-label="Réduire le menu"
              className="shrink-0 rounded-md p-1 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
            >
              <ChevronsLeft className="size-4 rtl:-scale-x-100" />
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-2">
          <Sidebar groups={groups} badges={badges} collapsed={collapsed} />
        </div>

        {collapsed && (
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label="Déplier le menu"
            className="mx-auto mb-3 rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
          >
            <ChevronsRight className="size-4 rtl:-scale-x-100" />
          </button>
        )}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <div
            className="absolute inset-0 bg-ink-950/50 backdrop-blur-sm"
            onClick={() => setMobileOpen(false)}
            role="presentation"
          />
          <aside className="absolute inset-y-0 start-0 flex w-72 animate-slide-in flex-col border-e border-line bg-surface-raised" style={{ '--slide-from': '-1rem' } as React.CSSProperties}>
            <div className="flex h-14 shrink-0 items-center justify-between border-b border-line px-4">
              <span className="text-[0.8125rem] font-semibold text-fg">CHOUPOTMAN OS</span>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                aria-label="Fermer"
                className="rounded-md p-1 text-fg-subtle hover:bg-surface-hover hover:text-fg"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2">
              <Sidebar groups={groups} badges={badges} onNavigate={() => setMobileOpen(false)} />
            </div>
          </aside>
        </div>
      )}

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-line bg-surface/90 px-4 backdrop-blur-xl sm:px-6">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            aria-label="Ouvrir le menu"
            className="rounded-md p-1.5 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg lg:hidden"
          >
            <Menu className="size-5" />
          </button>

          <div className="hidden min-w-0 items-center gap-2 text-[0.8125rem] sm:flex">
            <span className="text-fg-subtle">Admin</span>
            {current && (
              <>
                <span className="text-fg-subtle" aria-hidden>/</span>
                <span className="truncate font-medium text-fg">{current.label}</span>
              </>
            )}
          </div>

          <div className="ms-auto flex min-w-0 items-center gap-2">
            <div className="hidden sm:block">
              <CommandPalette navItems={navItems} />
            </div>

            <NotificationBell notifications={notifications} unreadCount={unreadCount} />

            <ThemeToggle className="hidden sm:inline-flex" />

            <a
              href="/fr"
              target="_blank"
              rel="noopener noreferrer"
              title="Voir le site public"
              className="hidden size-9 items-center justify-center rounded-lg border border-line text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg sm:inline-flex"
            >
              <ExternalLink className="size-4" />
            </a>

            <Dropdown
              trigger={({ toggle }) => (
                <button
                  type="button"
                  onClick={toggle}
                  className="flex items-center gap-2 rounded-lg p-0.5 transition-colors hover:bg-surface-hover"
                  aria-label="Compte"
                >
                  <Avatar name={user.fullName ?? user.username} src={user.avatarPath} size={32} />
                </button>
              )}
            >
              {(close) => (
                <>
                  <DropdownLabel>{user.fullName ?? user.username}</DropdownLabel>
                  <p className="px-2.5 pb-2 text-[0.6875rem] text-fg-subtle">{user.roleName}</p>
                  <DropdownSeparator />
                  <Link href="/espace-admin/mon-compte" onClick={close}>
                    <DropdownItem className="w-full">
                      <User className="size-3.5" />
                      Mon compte
                    </DropdownItem>
                  </Link>
                  <a href="/fr" target="_blank" rel="noopener noreferrer" onClick={close}>
                    <DropdownItem className="w-full">
                      <ExternalLink className="size-3.5" />
                      Voir le site public
                    </DropdownItem>
                  </a>
                  <DropdownSeparator />
                  <DropdownItem tone="danger" onClick={() => { close(); logout(); }} disabled={loggingOut}>
                    <LogOut className="size-3.5" />
                    {loggingOut ? 'Déconnexion…' : 'Se déconnecter'}
                  </DropdownItem>
                </>
              )}
            </Dropdown>
          </div>
        </header>

        {/* Mobile search row */}
        <div className="border-b border-line px-4 py-2 sm:hidden">
          <CommandPalette navItems={navItems} />
        </div>

        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 sm:py-8">{children}</main>
      </div>
    </div>
  );
}

function NotificationBell({
  notifications,
  unreadCount,
}: {
  notifications: NotificationRow[];
  unreadCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);

  async function markAllRead() {
    if (busy) return;
    setBusy(true);
    try {
      await fetch('/api/notifications/tout-lu', { method: 'POST' });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const severityColor: Record<string, string> = {
    info: 'bg-info',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
  };

  return (
    <Dropdown
      panelClassName="w-[min(22rem,calc(100vw-2rem))] p-0"
      trigger={({ toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} non lues)` : ''}`}
          className="relative inline-flex size-9 items-center justify-center rounded-lg border border-line text-fg-subtle transition-colors hover:bg-surface-hover hover:text-fg"
        >
          <Bell className="size-4" />
          {unreadCount > 0 && (
            <span className="absolute -end-1 -top-1 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.5625rem] font-bold text-white">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      )}
    >
      {(close) => (
        <div className="flex max-h-[26rem] flex-col">
          <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-3 py-2.5">
            <p className="text-[0.8125rem] font-semibold text-fg">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                disabled={busy}
                className="inline-flex items-center gap-1 text-[0.6875rem] font-semibold text-accent hover:underline disabled:opacity-50"
              >
                <Check className="size-3" />
                Tout marquer lu
              </button>
            )}
          </div>

          <ul className="min-h-0 flex-1 overflow-y-auto">
            {notifications.length === 0 && (
              <li className="px-3 py-10 text-center text-[0.8125rem] text-fg-subtle">Aucune notification.</li>
            )}
            {notifications.map((notification) => {
              const body = (
                <div className="flex gap-2.5">
                  <span
                    className={cn(
                      'mt-1.5 size-1.5 shrink-0 rounded-full',
                      notification.read_at ? 'bg-line-strong' : severityColor[notification.severity] ?? 'bg-info',
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <p className={cn('text-[0.8125rem] leading-snug', notification.read_at ? 'text-fg-muted' : 'font-medium text-fg')}>
                      {notification.title}
                    </p>
                    {notification.body && (
                      <p className="mt-0.5 line-clamp-2 text-[0.6875rem] leading-relaxed text-fg-subtle">
                        {notification.body}
                      </p>
                    )}
                    <p className="mt-1 text-[0.625rem] text-fg-subtle">
                      {formatRelative(notification.created_at, 'fr')}
                    </p>
                  </div>
                </div>
              );
              return (
                <li key={notification.id} className="border-b border-line last:border-0">
                  {notification.url ? (
                    <Link
                      href={notification.url}
                      onClick={close}
                      className="block px-3 py-2.5 transition-colors hover:bg-surface-hover"
                    >
                      {body}
                    </Link>
                  ) : (
                    <div className="px-3 py-2.5">{body}</div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="shrink-0 border-t border-line p-2">
            <Link
              href="/espace-admin/notifications"
              onClick={close}
              className="block rounded-md px-2.5 py-1.5 text-center text-[0.75rem] font-medium text-accent transition-colors hover:bg-surface-hover"
            >
              Voir toutes les notifications
            </Link>
          </div>
        </div>
      )}
    </Dropdown>
  );
}

export { PanelLeftClose };
