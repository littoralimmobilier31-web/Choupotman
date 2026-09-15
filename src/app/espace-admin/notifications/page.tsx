import { PageHeader, SummaryStrip } from '@/components/admin/page-kit';
import { NotificationList } from '@/components/admin/notification-list';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import { countUnreadNotifications, listNotifications } from '@/lib/db/repositories/comms';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Notifications' };

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ nonlues?: string }>;
}) {
  const user = await requirePermission('notifications.view');
  const query = await searchParams;
  const csrf = (await getCsrfToken()) ?? '';

  const unreadOnly = query.nonlues === '1';
  const notifications = listNotifications({ userId: user.id, unreadOnly, limit: 200 });
  const unread = countUnreadNotifications(user.id);

  return (
    <>
      <PageHeader
        title="Notifications"
        description="Ce que la plateforme a remarqué : retours clients, paiements reçus, échéances qui approchent, demandes arrivées."
      />

      <SummaryStrip
        items={[
          { label: 'Non lues', value: unread, href: '/espace-admin/notifications?nonlues=1' },
          { label: 'Affichées', value: notifications.length, href: '/espace-admin/notifications' },
        ]}
      />

      <div className="mt-5">
        <NotificationList
          csrf={csrf}
          unreadOnly={unreadOnly}
          unreadCount={unread}
          canUpdate={can(user, 'notifications.update')}
          notifications={notifications.map((notification) => ({
            id: notification.id,
            kind: notification.kind,
            title: notification.title,
            body: notification.body,
            url: notification.url,
            severity: notification.severity,
            read_at: notification.read_at,
            created_at: notification.created_at,
          }))}
        />
      </div>
    </>
  );
}
