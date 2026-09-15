'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertTriangle, CalendarPlus, ChevronLeft, ChevronRight, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button, buttonClass } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Field, Input, Select, Textarea, Switch } from '@/components/ui/field';
import { useAction } from './use-resource-form';

/**
 * Month grid over the unified calendar.
 *
 * Entries come from six different modules and only one of them — a stored event —
 * can be edited here. That asymmetry is made visible rather than hidden: a
 * delivery date belongs to its project and is changed there, so those entries
 * link to their source instead of opening an editor that would have to write
 * back into another table.
 */

export type Entry = {
  id: string;
  source: 'event' | 'project' | 'task' | 'invoice' | 'revision' | 'subscription';
  sourceId: number;
  title: string;
  description: string | null;
  kind: string;
  startsAt: string;
  endsAt: string | null;
  allDay: boolean;
  url: string | null;
  color: string | null;
  overdue: boolean;
};

export type Option = { value: string; label: string };

const SOURCE_TONES: Record<Entry['source'], 'brand' | 'info' | 'warning' | 'success' | 'neutral' | 'danger'> = {
  event: 'brand',
  project: 'success',
  task: 'info',
  invoice: 'warning',
  revision: 'danger',
  subscription: 'neutral',
};

const SOURCE_LABELS: Record<Entry['source'], string> = {
  event: 'Événement',
  project: 'Livraison',
  task: 'Tâche',
  invoice: 'Facture',
  revision: 'Révision',
  subscription: 'Abonnement',
};

const WEEKDAYS = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

/** The 42 cells of a month grid, Monday-first, as YYYY-MM-DD strings. */
function gridDays(month: string): string[] {
  const [year, monthNumber] = month.split('-').map(Number);
  const first = new Date(Date.UTC(year, monthNumber - 1, 1));
  // getUTCDay: 0 = Sunday. Shift so Monday is 0.
  const offset = (first.getUTCDay() + 6) % 7;
  const start = new Date(first.getTime() - offset * 86400000);

  return Array.from({ length: 42 }, (_, index) =>
    new Date(start.getTime() + index * 86400000).toISOString().slice(0, 10),
  );
}

function shiftMonth(month: string, delta: number): string {
  const [year, monthNumber] = month.split('-').map(Number);
  const date = new Date(Date.UTC(year, monthNumber - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}

function monthLabel(month: string): string {
  const [year, monthNumber] = month.split('-').map(Number);
  return new Date(Date.UTC(year, monthNumber - 1, 1)).toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function CalendarView({
  csrf,
  month,
  entries,
  overdue,
  upcoming,
  kinds,
  clients,
  projects,
  canCreate,
  canDelete,
}: {
  csrf: string;
  month: string;
  entries: Entry[];
  overdue: Entry[];
  upcoming: Entry[];
  kinds: { key: string; label: string }[];
  clients: Option[];
  projects: Option[];
  canCreate: boolean;
  canDelete: boolean;
}) {
  const [creating, setCreating] = React.useState<string | null>(null);
  const [selectedDay, setSelectedDay] = React.useState<string | null>(null);

  const today = new Date().toISOString().slice(0, 10);
  const days = gridDays(month);

  const byDay = React.useMemo(() => {
    const grouped: Record<string, Entry[]> = {};
    for (const entry of entries) {
      const key = entry.startsAt.slice(0, 10);
      (grouped[key] ??= []).push(entry);
    }
    return grouped;
  }, [entries]);

  const dayEntries = selectedDay ? (byDay[selectedDay] ?? []) : [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1">
          <Link
            href={`/espace-admin/calendrier?mois=${shiftMonth(month, -1)}`}
            aria-label="Mois précédent"
            className="rounded-lg border border-line p-1.5 text-fg-muted transition-colors hover:text-fg"
          >
            <ChevronLeft className="size-4 rtl:-scale-x-100" />
          </Link>
          <Link
            href={`/espace-admin/calendrier?mois=${shiftMonth(month, 1)}`}
            aria-label="Mois suivant"
            className="rounded-lg border border-line p-1.5 text-fg-muted transition-colors hover:text-fg"
          >
            <ChevronRight className="size-4 rtl:-scale-x-100" />
          </Link>
          <h2 className="ms-2 text-[0.9375rem] font-semibold capitalize text-fg">{monthLabel(month)}</h2>
          {month !== today.slice(0, 7) && (
            <Link href="/espace-admin/calendrier" className={buttonClass('ghost', 'sm', 'ms-2')}>
              Aujourd’hui
            </Link>
          )}
        </div>

        {canCreate && (
          <Button variant="secondary" size="sm" onClick={() => setCreating(today)}>
            <CalendarPlus className="size-3.5" />
            Nouvel événement
          </Button>
        )}
      </div>

      {/* Month grid */}
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-line">
        <div className="grid grid-cols-7 border-b border-line bg-surface-sunken">
          {WEEKDAYS.map((label) => (
            <div key={label} className="px-2 py-1.5 text-center text-[0.6875rem] font-medium text-fg-subtle">
              {label}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7">
          {days.map((day) => {
            const inMonth = day.slice(0, 7) === month;
            const items = byDay[day] ?? [];
            const isToday = day === today;

            return (
              <button
                key={day}
                type="button"
                onClick={() => setSelectedDay(day)}
                className={cn(
                  'min-h-20 border-b border-e border-line p-1.5 text-start align-top transition-colors last:border-e-0 hover:bg-surface-hover sm:min-h-24',
                  !inMonth && 'bg-surface-sunken/50',
                )}
                aria-label={`${day} — ${items.length} élément${items.length === 1 ? '' : 's'}`}
              >
                <span
                  className={cn(
                    'inline-flex size-5 items-center justify-center rounded-full text-[0.6875rem] tabular-nums',
                    isToday
                      ? 'bg-accent font-semibold text-accent-fg'
                      : inMonth
                        ? 'text-fg'
                        : 'text-fg-subtle',
                  )}
                >
                  {Number(day.slice(8, 10))}
                </span>

                <span className="mt-1 block space-y-0.5">
                  {items.slice(0, 3).map((entry) => (
                    <span
                      key={entry.id}
                      className={cn(
                        'block truncate rounded px-1 py-0.5 text-[0.625rem] leading-tight',
                        entry.overdue
                          ? 'bg-danger-soft text-danger'
                          : entry.source === 'event'
                            ? 'bg-accent-soft text-accent'
                            : 'bg-surface-sunken text-fg-muted',
                      )}
                    >
                      {entry.title}
                    </span>
                  ))}
                  {items.length > 3 && (
                    <span className="block px-1 text-[0.625rem] text-fg-subtle">+{items.length - 3}</span>
                  )}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Late and upcoming, side by side: the two lists that need acting on. */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="flex items-center gap-2">
                {overdue.length > 0 && <AlertTriangle className="size-4 text-danger" />}
                En retard
                {overdue.length > 0 && <Badge tone="danger">{overdue.length}</Badge>}
              </span>
            </CardTitle>
          </CardHeader>
          <CardBody>
            {overdue.length === 0 ? (
              <p className="text-[0.8125rem] text-fg-muted">Rien en retard. </p>
            ) : (
              <ul className="space-y-1.5">
                {overdue.slice(0, 8).map((entry) => (
                  <EntryRow key={entry.id} entry={entry} />
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Les deux prochaines semaines</CardTitle>
          </CardHeader>
          <CardBody>
            {upcoming.length === 0 ? (
              <p className="text-[0.8125rem] text-fg-muted">Aucune échéance prévue.</p>
            ) : (
              <ul className="space-y-1.5">
                {upcoming.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} />
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>

      {selectedDay && (
        <DayModal
          csrf={csrf}
          day={selectedDay}
          entries={dayEntries}
          canCreate={canCreate}
          canDelete={canDelete}
          onCreate={() => {
            setCreating(selectedDay);
            setSelectedDay(null);
          }}
          onClose={() => setSelectedDay(null)}
        />
      )}

      {creating && (
        <EventModal
          csrf={csrf}
          day={creating}
          kinds={kinds}
          clients={clients}
          projects={projects}
          onClose={() => setCreating(null)}
        />
      )}
    </div>
  );
}

function EntryRow({ entry }: { entry: Entry }) {
  const content = (
    <span className="flex min-w-0 items-center gap-2">
      <Badge tone={SOURCE_TONES[entry.source]}>{SOURCE_LABELS[entry.source]}</Badge>
      <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-fg">{entry.title}</span>
      <span
        className={cn(
          'shrink-0 whitespace-nowrap text-[0.6875rem] tabular-nums',
          entry.overdue ? 'font-semibold text-danger' : 'text-fg-subtle',
        )}
      >
        {entry.startsAt.slice(0, 10)}
      </span>
    </span>
  );

  return (
    <li>
      {entry.url ? (
        <Link
          href={entry.url}
          className="block rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-hover"
        >
          {content}
        </Link>
      ) : (
        <span className="block px-2 py-1.5">{content}</span>
      )}
    </li>
  );
}

function DayModal({
  csrf,
  day,
  entries,
  canCreate,
  canDelete,
  onCreate,
  onClose,
}: {
  csrf: string;
  day: string;
  entries: Entry[];
  canCreate: boolean;
  canDelete: boolean;
  onCreate: () => void;
  onClose: () => void;
}) {
  const { run, busy } = useAction(csrf);
  const [confirmDelete, setConfirmDelete] = React.useState<Entry | null>(null);

  const label = new Date(`${day}T00:00:00Z`).toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });

  return (
    <Modal
      open
      onClose={onClose}
      title={label.charAt(0).toUpperCase() + label.slice(1)}
      description={
        entries.length === 0
          ? 'Rien de prévu ce jour-là.'
          : `${entries.length} élément${entries.length === 1 ? '' : 's'} — seuls les événements créés ici sont modifiables ; le reste appartient à son module.`
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Fermer
          </Button>
          {canCreate && (
            <Button onClick={onCreate}>
              <CalendarPlus className="size-4" />
              Ajouter un événement
            </Button>
          )}
        </>
      }
    >
      {entries.length > 0 && (
        <ul className="space-y-1.5">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="flex items-start gap-2 rounded-lg border border-line bg-surface-raised px-3 py-2"
            >
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <Badge tone={SOURCE_TONES[entry.source]}>{SOURCE_LABELS[entry.source]}</Badge>
                  <span className="text-[0.8125rem] font-medium text-fg">{entry.title}</span>
                  {entry.overdue && <Badge tone="danger">En retard</Badge>}
                </p>
                {entry.description && (
                  <p className="mt-0.5 text-[0.75rem] text-fg-muted">{entry.description}</p>
                )}
                <p className="mt-0.5 text-[0.6875rem] text-fg-subtle">
                  {entry.allDay ? 'Toute la journée' : entry.startsAt.slice(11, 16)}
                  {entry.url && ' · '}
                  {entry.url && (
                    <Link href={entry.url} className="text-accent underline-offset-2 hover:underline">
                      Ouvrir la fiche
                    </Link>
                  )}
                </p>
              </div>

              {canDelete && entry.source === 'event' && (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(entry)}
                  aria-label={`Supprimer ${entry.title}`}
                  className="rounded-md p-1.5 text-fg-subtle transition-colors hover:bg-danger-soft hover:text-danger"
                >
                  <Trash2 className="size-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        onConfirm={async () => {
          const target = confirmDelete;
          setConfirmDelete(null);
          if (!target) return;
          await run(`/api/evenements/${target.sourceId}`, { method: 'DELETE', success: 'Événement supprimé.' });
          onClose();
        }}
        title="Supprimer cet événement ?"
        message="Il disparaît du calendrier. Cette action est irréversible."
        confirmLabel="Supprimer"
        busy={busy}
      />
    </Modal>
  );
}

function EventModal({
  csrf,
  day,
  kinds,
  clients,
  projects,
  onClose,
}: {
  csrf: string;
  day: string;
  kinds: { key: string; label: string }[];
  clients: Option[];
  projects: Option[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { run, busy } = useAction(csrf);
  const [values, setValues] = React.useState({
    title: '',
    kind: 'meeting',
    date: day,
    time: '10:00',
    end_time: '',
    all_day: false,
    location: '',
    description: '',
    client_id: '',
    project_id: '',
  });

  const set = <K extends keyof typeof values>(key: K, value: (typeof values)[K]) =>
    setValues((previous) => ({ ...previous, [key]: value }));

  return (
    <Modal
      open
      onClose={onClose}
      title="Nouvel événement"
      description="Pour un rendez-vous ou un rappel. Les livraisons et les échéances arrivent automatiquement depuis les projets et les factures."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Annuler
          </Button>
          <Button
            disabled={busy || values.title.trim().length < 2}
            onClick={async () => {
              // An all-day event is stored at midnight; a timed one keeps its time.
              const startsAt = values.all_day
                ? `${values.date}T00:00:00.000Z`
                : `${values.date}T${values.time || '10:00'}:00.000Z`;
              const endsAt =
                !values.all_day && values.end_time ? `${values.date}T${values.end_time}:00.000Z` : null;

              const result = await run('/api/evenements', {
                body: {
                  title: values.title.trim(),
                  kind: values.kind,
                  starts_at: startsAt,
                  ends_at: endsAt,
                  all_day: values.all_day,
                  location: values.location.trim() || null,
                  description: values.description.trim() || null,
                  client_id: values.client_id ? Number(values.client_id) : null,
                  project_id: values.project_id ? Number(values.project_id) : null,
                },
                success: 'Événement ajouté.',
              });
              if (result) {
                router.refresh();
                onClose();
              }
            }}
          >
            Ajouter
          </Button>
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Intitulé" htmlFor="ev-title" required className="sm:col-span-2">
          <Input
            id="ev-title"
            value={values.title}
            onChange={(event) => set('title', event.target.value)}
            maxLength={200}
            autoFocus
            placeholder="Point d’avancement — Boulangerie Amine"
          />
        </Field>

        <Field label="Type" htmlFor="ev-kind">
          <Select id="ev-kind" value={values.kind} onChange={(event) => set('kind', event.target.value)}>
            {kinds.map((kind) => (
              <option key={kind.key} value={kind.key}>
                {kind.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Date" htmlFor="ev-date" required>
          <Input id="ev-date" type="date" value={values.date} onChange={(event) => set('date', event.target.value)} />
        </Field>

        {!values.all_day && (
          <>
            <Field label="Heure de début" htmlFor="ev-time">
              <Input id="ev-time" type="time" value={values.time} onChange={(event) => set('time', event.target.value)} />
            </Field>
            <Field label="Heure de fin" htmlFor="ev-end" hint="Optionnelle.">
              <Input
                id="ev-end"
                type="time"
                value={values.end_time}
                onChange={(event) => set('end_time', event.target.value)}
              />
            </Field>
          </>
        )}

        <Field label="Lieu" htmlFor="ev-location">
          <Input
            id="ev-location"
            value={values.location}
            onChange={(event) => set('location', event.target.value)}
            maxLength={200}
            placeholder="Bureau, visioconférence…"
          />
        </Field>

        <Field label="Client" htmlFor="ev-client">
          <Select id="ev-client" value={values.client_id} onChange={(event) => set('client_id', event.target.value)}>
            <option value="">Aucun</option>
            {clients.map((client) => (
              <option key={client.value} value={client.value}>
                {client.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Projet" htmlFor="ev-project">
          <Select id="ev-project" value={values.project_id} onChange={(event) => set('project_id', event.target.value)}>
            <option value="">Aucun</option>
            {projects.map((project) => (
              <option key={project.value} value={project.value}>
                {project.label}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Notes" htmlFor="ev-description" className="sm:col-span-2">
          <Textarea
            id="ev-description"
            rows={3}
            value={values.description}
            onChange={(event) => set('description', event.target.value)}
            maxLength={2000}
          />
        </Field>

        <div className="flex items-center rounded-lg bg-surface-sunken px-3 py-2.5 sm:col-span-2">
          <Switch
            checked={values.all_day}
            onChange={(next) => set('all_day', next)}
            label={values.all_day ? 'Toute la journée' : 'À une heure précise'}
          />
        </div>
      </div>
    </Modal>
  );
}
