import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { AdminShell } from '@/components/admin/admin-shell';
import { ADMIN_NAV, flatNav } from '@/lib/admin-nav';
import { can } from '@/lib/auth/permissions';
import { getCurrentUser } from '@/lib/auth/session';
import { countUnreadNotifications, listNotifications, countNewSubmissions } from '@/lib/db/repositories/comms';
import { countTasks } from '@/lib/db/repositories/projects';
import { countInvoices } from '@/lib/db/repositories/finance';
import { listFeedback } from '@/lib/db/repositories/projects';
import { runDaily } from '@/lib/automation/engine';

/**
 * Admin layout.
 *
 * Pages under here are never static: each one calls `requireUser()` /
 * `requirePermission()` itself, so authentication is enforced per route rather
 * than by this layout alone. Layouts in the App Router are not a security
 * boundary — a page can be reached without its parent layout re-running — so the
 * guard lives with the data access it protects.
 *
 * Routes that must render without the shell (login, forced password change,
 * password reset) provide their own layout and are detected here by the absence
 * of a session.
 */

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'Espace admin', template: '%s · CHOUPOTMAN OS' },
  robots: { index: false, follow: false, nocache: true },
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();

  /**
   * No session, or a session that still owes a password change: render the page
   * bare. The page itself is the login / change-password screen, which must not
   * be wrapped in navigation the user cannot use yet.
   */
  if (!user || user.must_change_password) {
    return <div className="min-h-dvh bg-surface">{children}</div>;
  }

  // The daily sweep is opportunistic: the first authenticated page view of the
  // day runs it, so deadline and overdue alerts work without an external cron.
  // `runDaily` is a no-op once it has succeeded today.
  try {
    runDaily();
  } catch {
    // A failing automation must never block the admin from loading; the failure
    // is recorded in automation_runs.
  }

  // Filter the navigation by permission, server-side.
  const groups = ADMIN_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => can(user, item.permission)),
  })).filter((group) => group.items.length > 0);

  const navItems = flatNav().filter((item) => can(user, item.permission));

  const badges = {
    notifications: countUnreadNotifications(user.id),
    submissions: can(user, 'leads.view') ? countNewSubmissions() : 0,
    overdueInvoices: can(user, 'invoices.view') ? countInvoices('overdue') : 0,
    openTasks: can(user, 'tasks.view') ? countTasks({ overdueOnly: true }) : 0,
    newFeedback: can(user, 'feedback.view') ? listFeedback({ status: 'new', limit: 100 }).length : 0,
  };

  const notifications = listNotifications({ userId: user.id, limit: 12 });

  // Touching headers() keeps this layout dynamic even if a child is static.
  await headers();

  return (
    <AdminShell
      user={{
        username: user.username,
        fullName: user.full_name,
        roleName: user.role_name,
        avatarPath: user.avatar_path,
      }}
      groups={groups}
      navItems={navItems}
      badges={badges}
      notifications={notifications}
      unreadCount={badges.notifications}
    >
      {children}
    </AdminShell>
  );
}
