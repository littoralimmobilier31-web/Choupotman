import Link from 'next/link';
import { MessageSquareQuote, Star } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { PageHeader, SummaryStrip, ListEmpty, DemoBadge } from '@/components/admin/page-kit';
import { ListFilters } from '@/components/admin/list-filters';
import { FeedbackActions } from '@/components/admin/feedback-controls';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import { countFeedback, listFeedbackWithMeta, projectOptions } from '@/lib/db/repositories/projects';
import { formatRelative } from '@/lib/i18n/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Feedback' };

const DECISION_LABELS: Record<string, string> = {
  approved: 'Validé', changes_requested: 'Modifications demandées', comment: 'Commentaire',
};

const DECISION_TONES: Record<string, 'success' | 'warning' | 'neutral'> = {
  approved: 'success', changes_requested: 'warning', comment: 'neutral',
};

const STATUS_LABELS: Record<string, string> = {
  new: 'Nouveau', acknowledged: 'Vu', resolved: 'Traité',
};

const STATUS_TONES: Record<string, 'brand' | 'info' | 'outline'> = {
  new: 'brand', acknowledged: 'info', resolved: 'outline',
};

export default async function FeedbackPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; statut?: string; decision?: string; projet?: string }>;
}) {
  const user = await requirePermission('feedback.view');
  const query = await searchParams;
  const csrf = (await getCsrfToken()) ?? '';

  const entries = listFeedbackWithMeta({
    status: query.statut || undefined,
    decision: query.decision || undefined,
    projectId: Number.parseInt(query.projet ?? '', 10) || undefined,
    limit: 300,
  }).filter((entry) => {
    const term = query.q?.trim().toLowerCase();
    if (!term) return true;
    return [entry.comment, entry.author_label, entry.project_title, entry.client_name, entry.client_company]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(term));
  });

  const projects = projectOptions();

  return (
    <>
      <PageHeader
        title="Feedback client"
        description="Chaque retour alimente la timeline du projet. Un « modifications demandées » peut être transformé en révision suivie."
      />

      <SummaryStrip
        items={[
          { label: 'Nouveaux', value: countFeedback({ status: 'new' }), href: '/espace-admin/feedback?statut=new' },
          { label: 'Vus', value: countFeedback({ status: 'acknowledged' }), href: '/espace-admin/feedback?statut=acknowledged' },
          { label: 'Traités', value: countFeedback({ status: 'resolved' }), href: '/espace-admin/feedback?statut=resolved' },
          { label: 'Validations', value: countFeedback({ decision: 'approved' }), href: '/espace-admin/feedback?decision=approved' },
          {
            label: 'Modifications',
            value: countFeedback({ decision: 'changes_requested' }),
            href: '/espace-admin/feedback?decision=changes_requested',
          },
        ]}
      />

      <ListFilters
        searchPlaceholder="Commentaire, auteur, projet, client…"
        resultCount={entries.length}
        selects={[
          {
            key: 'statut',
            label: 'Statut',
            allLabel: 'Tous les statuts',
            options: [
              { value: 'new', label: 'Nouveau' },
              { value: 'acknowledged', label: 'Vu' },
              { value: 'resolved', label: 'Traité' },
            ],
          },
          {
            key: 'decision',
            label: 'Décision',
            allLabel: 'Toutes les décisions',
            options: [
              { value: 'approved', label: 'Validé' },
              { value: 'changes_requested', label: 'Modifications demandées' },
              { value: 'comment', label: 'Commentaire' },
            ],
          },
          ...(projects.length > 0
            ? [
                {
                  key: 'projet',
                  label: 'Projet',
                  allLabel: 'Tous les projets',
                  options: projects.map((project) => ({ value: String(project.id), label: project.label })),
                },
              ]
            : []),
        ]}
      />

      <div className="mt-5 space-y-3">
        {entries.length === 0 ? (
          <ListEmpty
            icon={<MessageSquareQuote className="size-5" />}
            title="Aucun retour client"
            description="Les retours arrivent depuis l’espace client ou sont saisis depuis un projet."
          />
        ) : (
          entries.map((entry) => (
            <Card key={entry.id}>
              <CardBody className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={DECISION_TONES[entry.decision] ?? 'neutral'}>
                        {DECISION_LABELS[entry.decision] ?? entry.decision}
                      </Badge>
                      <Badge tone={STATUS_TONES[entry.status] ?? 'neutral'}>
                        {STATUS_LABELS[entry.status] ?? entry.status}
                      </Badge>
                      {entry.rating !== null && (
                        <span className="inline-flex items-center gap-0.5 text-[0.75rem] font-semibold tabular-nums text-warning">
                          <Star className="size-3.5 fill-current" />
                          {entry.rating}/5
                        </span>
                      )}
                      <DemoBadge when={entry.is_demo} />
                    </div>

                    <p className="mt-2 text-[0.6875rem] text-fg-subtle">
                      {[
                        entry.author_label,
                        entry.client_company ?? entry.client_name,
                        formatRelative(entry.created_at, 'fr'),
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  </div>

                  <FeedbackActions
                    csrf={csrf}
                    feedbackId={entry.id}
                    status={entry.status}
                    decision={entry.decision}
                    canUpdate={can(user, 'feedback.update')}
                    canCreateRevision={can(user, 'revisions.create')}
                  />
                </div>

                {entry.comment && (
                  <blockquote className="border-s-2 border-line-strong ps-3 text-[0.8125rem] leading-relaxed text-fg">
                    {entry.comment}
                  </blockquote>
                )}

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line pt-2.5 text-[0.6875rem] text-fg-subtle">
                  {entry.project_id !== null && (
                    <Link
                      href={`/espace-admin/projets/${entry.project_id}`}
                      className="font-medium text-accent hover:underline"
                    >
                      {entry.project_title ?? `Projet #${entry.project_id}`}
                    </Link>
                  )}
                  {entry.stage_name && <span>Étape : {entry.stage_name}</span>}
                  {entry.task_title && <span>Tâche : {entry.task_title}</span>}
                  <span className="ms-auto">Source : {entry.source}</span>
                </div>
              </CardBody>
            </Card>
          ))
        )}
      </div>
    </>
  );
}
