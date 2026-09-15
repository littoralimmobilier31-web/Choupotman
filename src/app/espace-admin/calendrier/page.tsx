import { PageHeader, SummaryStrip } from '@/components/admin/page-kit';
import { CalendarView } from '@/components/admin/calendar-view';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import {
  EVENT_KINDS,
  getCalendarEntries,
  overdueEntries,
  upcomingEntries,
} from '@/lib/db/repositories/calendar';
import { clientOptions } from '@/lib/db/repositories/clients';
import { projectOptions } from '@/lib/db/repositories/projects';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Calendrier' };

/** First and last day of the month containing `date`, as YYYY-MM-DD. */
function monthBounds(date: Date): { from: string; to: string } {
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ mois?: string }>;
}) {
  const user = await requirePermission('calendar.view');
  const query = await searchParams;
  const csrf = (await getCsrfToken()) ?? '';

  // `mois` is YYYY-MM; anything else falls back to the current month rather than
  // producing an invalid range.
  const parsed = /^\d{4}-\d{2}$/.test(query.mois ?? '') ? new Date(`${query.mois}-01T00:00:00Z`) : new Date();
  const month = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const bounds = monthBounds(month);

  // The grid shows leading and trailing days from the neighbouring months, so
  // the range is widened to cover them.
  const entries = getCalendarEntries({
    from: new Date(Date.parse(`${bounds.from}T00:00:00Z`) - 7 * 86400000).toISOString().slice(0, 10),
    to: new Date(Date.parse(`${bounds.to}T00:00:00Z`) + 7 * 86400000).toISOString().slice(0, 10),
  });

  const overdue = overdueEntries(50);
  const upcoming = upcomingEntries(14, 8);

  return (
    <>
      <PageHeader
        title="Calendrier"
        description="Livraisons, échéances de tâches, factures à encaisser, révisions et renouvellements — réunis depuis les modules, sans recopie."
      />

      <SummaryStrip
        items={[
          { label: 'Ce mois', value: entries.filter((entry) => entry.startsAt.slice(0, 7) === bounds.from.slice(0, 7)).length },
          { label: 'À venir (14 j)', value: upcoming.length },
          { label: 'En retard', value: overdue.length },
        ]}
      />

      <CalendarView
        csrf={csrf}
        month={bounds.from.slice(0, 7)}
        entries={entries}
        overdue={overdue}
        upcoming={upcoming}
        kinds={EVENT_KINDS.map(({ key, label }) => ({ key, label }))}
        clients={clientOptions().map((client) => ({ value: String(client.id), label: client.label }))}
        projects={projectOptions().map((project) => ({ value: String(project.id), label: project.label }))}
        canCreate={can(user, 'calendar.create')}
        canDelete={can(user, 'calendar.delete')}
      />
    </>
  );
}
