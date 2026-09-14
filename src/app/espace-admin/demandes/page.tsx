import Link from 'next/link';
import { Inbox, Mail, Paperclip, Phone } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { PageHeader, SummaryStrip, ListEmpty, DetailGrid } from '@/components/admin/page-kit';
import { ListFilters } from '@/components/admin/list-filters';
import { SubmissionActions } from '@/components/admin/submission-controls';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import { listContactSubmissions } from '@/lib/db/repositories/comms';
import { formatRelative } from '@/lib/i18n/format';
import type { ContactSubmissionRow } from '@/lib/db/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Demandes reçues' };

const STATUS_LABELS: Record<string, string> = {
  new: 'Nouvelle', read: 'Lue', converted: 'Convertie', spam: 'Indésirable',
};

const STATUS_TONES: Record<string, 'brand' | 'info' | 'success' | 'danger'> = {
  new: 'brand', read: 'info', converted: 'success', spam: 'danger',
};

const SOURCE_LABELS: Record<string, string> = {
  contact_form: 'Formulaire de contact',
  project_request: 'Demande de projet',
  chatbot: 'Assistant du site',
};

/** Field labels for the 9-step project-request wizard's stored answers. */
const PAYLOAD_LABELS: Record<string, string> = {
  projectType: 'Type de projet',
  objectives: 'Objectifs',
  audience: 'Cible',
  features: 'Fonctionnalités',
  references: 'Références',
  style: 'Style souhaité',
  content: 'Contenu disponible',
  budget: 'Budget',
  deadline: 'Échéance',
  existingSite: 'Site existant',
  languages: 'Langues',
  maintenance: 'Maintenance',
};

export default async function SubmissionsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string; source?: string }>;
}) {
  const user = await requirePermission('leads.view');
  const query = await searchParams;
  const csrf = (await getCsrfToken()) ?? '';

  const submissions = listContactSubmissions({
    status: (query.statut as ContactSubmissionRow['status'] | 'all') || undefined,
    source: (query.source as ContactSubmissionRow['source']) || undefined,
    limit: 200,
  }).filter((submission) => {
    const term = query.q?.trim().toLowerCase();
    if (!term) return true;
    return [submission.name, submission.email, submission.company, submission.message, submission.service]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
  });

  const counts = {
    all: listContactSubmissions({ status: 'all', limit: 500 }).length,
    new: listContactSubmissions({ status: 'new', limit: 500 }).length,
    converted: listContactSubmissions({ status: 'converted', limit: 500 }).length,
    spam: listContactSubmissions({ status: 'spam', limit: 500 }).length,
  };

  return (
    <>
      <PageHeader
        title="Demandes reçues"
        description="Tout ce qui arrive du site public : formulaire de contact, demande de projet en 9 étapes, assistant. Rien n’est modifié ici — les réponses sont conservées telles quelles."
      />

      <SummaryStrip
        items={[
          { label: 'Nouvelles', value: counts.new, href: '/espace-admin/demandes?statut=new' },
          { label: 'Converties', value: counts.converted, href: '/espace-admin/demandes?statut=converted' },
          { label: 'Indésirables', value: counts.spam, href: '/espace-admin/demandes?statut=spam' },
          { label: 'Total', value: counts.all, href: '/espace-admin/demandes?statut=all' },
        ]}
      />

      <ListFilters
        searchPlaceholder="Nom, email, société, message…"
        resultCount={submissions.length}
        selects={[
          {
            key: 'statut',
            label: 'Statut',
            allLabel: 'Non traitées',
            options: [
              { value: 'new', label: 'Nouvelle' },
              { value: 'read', label: 'Lue' },
              { value: 'converted', label: 'Convertie' },
              { value: 'spam', label: 'Indésirable' },
              { value: 'all', label: 'Toutes' },
            ],
          },
          {
            key: 'source',
            label: 'Source',
            allLabel: 'Toutes les sources',
            options: [
              { value: 'contact_form', label: 'Formulaire de contact' },
              { value: 'project_request', label: 'Demande de projet' },
              { value: 'chatbot', label: 'Assistant du site' },
            ],
          },
        ]}
      />

      <div className="mt-5 space-y-3">
        {submissions.length === 0 ? (
          <ListEmpty
            icon={<Inbox className="size-5" />}
            title="Aucune demande"
            description="Les messages envoyés depuis le site public arrivent ici, avec une notification."
          />
        ) : (
          submissions.map((submission) => {
            // Only the wizard's own answers: the flat columns are already shown above.
            const answers = Object.entries(submission.payloadData).filter(
              ([key, value]) =>
                value !== null &&
                value !== '' &&
                !['name', 'email', 'phone', 'company', 'message', 'locale', 'csrf'].includes(key),
            );

            return (
              <Card key={submission.id}>
                <CardBody className="space-y-3">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[0.9375rem] font-semibold text-fg">{submission.name}</h3>
                        <Badge tone={STATUS_TONES[submission.status] ?? 'neutral'}>
                          {STATUS_LABELS[submission.status] ?? submission.status}
                        </Badge>
                        <Badge tone="outline">
                          {SOURCE_LABELS[submission.source] ?? submission.source}
                        </Badge>
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.75rem] text-fg-muted">
                        <a href={`mailto:${submission.email}`} className="inline-flex items-center gap-1 hover:text-accent">
                          <Mail className="size-3" />
                          {submission.email}
                        </a>
                        {submission.phone && (
                          <a href={`tel:${submission.phone}`} className="inline-flex items-center gap-1 hover:text-accent">
                            <Phone className="size-3" />
                            {submission.phone}
                          </a>
                        )}
                        {submission.company && <span>{submission.company}</span>}
                        <span className="text-fg-subtle">{formatRelative(submission.created_at, 'fr')}</span>
                      </div>
                    </div>

                    <SubmissionActions
                      csrf={csrf}
                      submissionId={submission.id}
                      status={submission.status}
                      canUpdate={can(user, 'leads.update')}
                      canCreateLead={can(user, 'leads.create')}
                      canDelete={can(user, 'leads.delete')}
                    />
                  </div>

                  {submission.message && (
                    <blockquote className="whitespace-pre-line border-s-2 border-line-strong ps-3 text-[0.8125rem] leading-relaxed text-fg">
                      {submission.message}
                    </blockquote>
                  )}

                  {(submission.service || submission.budget || submission.deadline) && (
                    <DetailGrid
                      columns={3}
                      items={[
                        ...(submission.service ? [{ label: 'Service', value: submission.service }] : []),
                        ...(submission.budget ? [{ label: 'Budget', value: submission.budget }] : []),
                        ...(submission.deadline ? [{ label: 'Échéance', value: submission.deadline }] : []),
                      ]}
                    />
                  )}

                  {answers.length > 0 && (
                    <details className="rounded-lg bg-surface-sunken px-3 py-2">
                      <summary className="cursor-pointer text-[0.75rem] font-semibold text-fg">
                        Réponses détaillées ({answers.length})
                      </summary>
                      <dl className="mt-2.5 grid gap-x-6 gap-y-3 sm:grid-cols-2">
                        {answers.map(([key, value]) => (
                          <div key={key} className="min-w-0">
                            <dt className="text-[0.625rem] font-semibold uppercase tracking-wider text-fg-subtle">
                              {PAYLOAD_LABELS[key] ?? key}
                            </dt>
                            <dd className="mt-0.5 break-words text-[0.8125rem] text-fg">
                              {Array.isArray(value) ? value.join(', ') : String(value)}
                            </dd>
                          </div>
                        ))}
                      </dl>
                    </details>
                  )}

                  <div className="flex flex-wrap items-center gap-3 border-t border-line pt-2.5 text-[0.6875rem] text-fg-subtle">
                    {submission.file_id !== null && (
                      <span className="inline-flex items-center gap-1">
                        <Paperclip className="size-3" />
                        Pièce jointe
                      </span>
                    )}
                    <span>Langue : {submission.locale.toUpperCase()}</span>
                    {submission.lead_id !== null && (
                      <Link
                        href="/espace-admin/prospects?vue=liste"
                        className="ms-auto font-semibold text-accent hover:underline"
                      >
                        Voir le prospect
                      </Link>
                    )}
                  </div>
                </CardBody>
              </Card>
            );
          })
        )}
      </div>
    </>
  );
}
