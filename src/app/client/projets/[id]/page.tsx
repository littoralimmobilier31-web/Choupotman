import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Check, Circle, Download, FileText, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/misc';
import { ClientFeedbackForm, RatingStars } from '@/components/client/portal-forms';
import { requireClientUser } from '@/lib/auth/guard';
import { getClientCsrfToken } from '@/lib/auth/csrf';
import {
  portalFeedback, portalFiles, portalProject, portalRevisions, portalStages, portalTimeline,
} from '@/lib/db/portal';
import { projectStatusLabel } from '@/lib/db/repositories/projects';
import { formatBytes } from '@/lib/utils';
import { formatMoney, formatRelative, formatShortDate } from '@/lib/i18n/format';

export const dynamic = 'force-dynamic';

const STATUS_TONES: Record<string, 'info' | 'brand' | 'warning' | 'success' | 'outline'> = {
  planning: 'info', in_progress: 'brand', in_review: 'warning',
  awaiting_client: 'warning', completed: 'success', archived: 'outline',
};

const STAGE_LABELS: Record<string, string> = {
  todo: 'À venir', in_progress: 'En cours', done: 'Terminée', blocked: 'En attente',
};

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  return { title: 'Projet' };
}

export default async function ClientProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const clientUser = await requireClientUser();
  const { id: raw } = await params;
  const id = Number.parseInt(raw, 10);
  if (!Number.isInteger(id) || id <= 0) notFound();

  // Scoped by the caller's own client id: another client's project is simply
  // not found, which is also the right thing to reveal.
  const project = portalProject(clientUser.client_id, id);
  if (!project) notFound();

  const csrf = (await getClientCsrfToken()) ?? '';
  const stages = portalStages(clientUser.client_id, id);
  const timeline = portalTimeline(clientUser.client_id, id, 40);
  const files = portalFiles(clientUser.client_id, id);
  const revisions = portalRevisions(clientUser.client_id, id);
  const feedback = portalFeedback(clientUser.client_id, id);

  const usedRevisions = revisions.filter((revision) => revision.status !== 'rejected').length;
  const remaining = Math.max(0, project.revisions_included - usedRevisions);
  const today = new Date().toISOString().slice(0, 10);
  const late =
    project.delivery_date !== null &&
    project.delivery_date < today &&
    project.status !== 'completed' &&
    project.status !== 'archived';

  return (
    <>
      <Link
        href="/client/projets"
        className="mb-4 inline-flex items-center gap-1.5 text-[0.75rem] font-medium text-fg-muted transition-colors hover:text-fg"
      >
        <ArrowLeft className="size-3.5 rtl:-scale-x-100" />
        Vos projets
      </Link>

      <header className="mb-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-[1.375rem] font-semibold tracking-tight text-fg sm:text-[1.5rem]">
              {project.title}
            </h1>
            <p className="mt-1 font-mono text-[0.6875rem] text-fg-subtle">{project.reference}</p>
          </div>
          <Badge tone={STATUS_TONES[project.status] ?? 'neutral'}>
            {projectStatusLabel(project.status)}
          </Badge>
        </div>

        {project.description && (
          <p className="mt-3 max-w-2xl text-[0.8125rem] leading-relaxed text-fg-muted">
            {project.description}
          </p>
        )}
      </header>

      <Card className="mb-6">
        <CardBody className="space-y-4">
          <div className="flex items-center gap-3">
            <Progress
              className="flex-1"
              value={project.progress}
              tone={project.progress >= 80 ? 'success' : late ? 'warning' : 'accent'}
            />
            <span className="shrink-0 text-[0.875rem] font-semibold tabular-nums text-fg">
              {project.progress} %
            </span>
          </div>

          <dl className="grid gap-x-6 gap-y-3 text-[0.8125rem] sm:grid-cols-3">
            <div>
              <dt className="text-[0.625rem] font-semibold uppercase tracking-wider text-fg-subtle">Démarrage</dt>
              <dd className="mt-0.5 text-fg">
                {project.start_date ? formatShortDate(project.start_date, 'fr') : 'à confirmer'}
              </dd>
            </div>
            <div>
              <dt className="text-[0.625rem] font-semibold uppercase tracking-wider text-fg-subtle">Livraison</dt>
              <dd className={late ? 'mt-0.5 font-semibold text-warning' : 'mt-0.5 text-fg'}>
                {project.delivery_date ? formatShortDate(project.delivery_date, 'fr') : 'à confirmer'}
              </dd>
            </div>
            <div>
              <dt className="text-[0.625rem] font-semibold uppercase tracking-wider text-fg-subtle">
                Révisions incluses
              </dt>
              <dd className="mt-0.5 tabular-nums text-fg">
                {usedRevisions} / {project.revisions_included} utilisées
                {remaining === 0 && project.revisions_included > 0 && (
                  <span className="ms-1.5 text-[0.75rem] text-warning">(forfait épuisé)</span>
                )}
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
        <div className="min-w-0 space-y-6">
          {/* ── Stages ─────────────────────────────────────────────────── */}
          {stages.length > 0 && (
            <section>
              <h2 className="mb-3 text-[0.9375rem] font-semibold text-fg">Étapes du projet</h2>
              <ol className="space-y-2">
                {stages.map((stage) => (
                  <li
                    key={stage.id}
                    className="flex items-center gap-3 rounded-lg border border-line bg-surface-raised px-3.5 py-3"
                  >
                    {stage.status === 'done' ? (
                      <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-success text-surface">
                        <Check className="size-3" />
                      </span>
                    ) : stage.status === 'in_progress' ? (
                      <Loader2 className="size-5 shrink-0 animate-spin text-accent" />
                    ) : (
                      <Circle className="size-5 shrink-0 text-line-strong" />
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="text-[0.8125rem] font-medium text-fg">{stage.name}</p>
                      {stage.task_count > 0 && (
                        <p className="text-[0.625rem] tabular-nums text-fg-subtle">
                          {stage.done_count}/{stage.task_count} tâches terminées
                        </p>
                      )}
                    </div>

                    <Badge tone={stage.status === 'done' ? 'success' : stage.status === 'in_progress' ? 'brand' : 'outline'}>
                      {STAGE_LABELS[stage.status] ?? stage.status}
                    </Badge>
                  </li>
                ))}
              </ol>
            </section>
          )}

          {/* ── Feedback ───────────────────────────────────────────────── */}
          <section>
            <h2 className="mb-1 text-[0.9375rem] font-semibold text-fg">Votre retour</h2>
            <p className="mb-3 text-[0.75rem] leading-relaxed text-fg-muted">
              Validez la livraison, demandez des modifications ou laissez simplement un commentaire.
              Chaque message est transmis immédiatement.
            </p>

            <ClientFeedbackForm
              csrf={csrf}
              projectId={id}
              revisionsRemaining={remaining}
              revisionExtraCost={project.revision_extra_cost}
              currency={project.currency}
            />

            {feedback.length > 0 && (
              <ul className="mt-4 space-y-2.5">
                {feedback.slice(0, 8).map((entry) => (
                  <li key={entry.id} className="rounded-lg bg-surface-sunken px-3.5 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        tone={
                          entry.decision === 'approved'
                            ? 'success'
                            : entry.decision === 'changes_requested'
                              ? 'warning'
                              : 'neutral'
                        }
                      >
                        {entry.decision === 'approved'
                          ? 'Validé'
                          : entry.decision === 'changes_requested'
                            ? 'Modifications demandées'
                            : 'Commentaire'}
                      </Badge>
                      {entry.rating !== null && <RatingStars value={entry.rating} />}
                      <span className="text-[0.625rem] text-fg-subtle">
                        {formatRelative(entry.created_at, 'fr')}
                      </span>
                      {entry.status === 'resolved' && <Badge tone="outline">Traité</Badge>}
                    </div>
                    {entry.comment && (
                      <p className="mt-1.5 whitespace-pre-line text-[0.8125rem] leading-relaxed text-fg">
                        {entry.comment}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Timeline ───────────────────────────────────────────────── */}
          {timeline.length > 0 && (
            <section>
              <h2 className="mb-3 text-[0.9375rem] font-semibold text-fg">Historique</h2>
              <ol className="space-y-3 border-s border-line ps-4">
                {timeline.map((event) => (
                  <li key={event.id} className="relative">
                    <span className="absolute -start-[1.3125rem] top-1.5 size-2 rounded-full bg-line-strong" aria-hidden />
                    <p className="text-[0.8125rem] font-medium text-fg">{event.title}</p>
                    {event.body && (
                      <p className="mt-0.5 line-clamp-3 text-[0.75rem] leading-relaxed text-fg-muted">{event.body}</p>
                    )}
                    <p className="mt-0.5 text-[0.625rem] text-fg-subtle">
                      {formatRelative(event.created_at, 'fr')}
                      {event.actor_label && ` · ${event.actor_label}`}
                    </p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <aside className="space-y-5">
          {/* ── Files ──────────────────────────────────────────────────── */}
          <Card>
            <CardHeader>
              <CardTitle>Documents partagés</CardTitle>
            </CardHeader>
            <CardBody className="pt-3">
              {files.length === 0 ? (
                <p className="text-[0.75rem] leading-relaxed text-fg-subtle">
                  Aucun document n’a encore été partagé sur ce projet.
                </p>
              ) : (
                <ul className="space-y-2">
                  {files.map((file) => (
                    <li key={file.id}>
                      <a
                        href={`/api/client/fichiers/${file.id}`}
                        className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 transition-colors hover:bg-surface-hover"
                      >
                        <FileText className="size-4 shrink-0 text-fg-subtle" />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.75rem] font-medium text-fg">
                            {file.original_name}
                          </span>
                          <span className="block text-[0.625rem] text-fg-subtle">
                            {formatBytes(file.size_bytes)}
                          </span>
                        </span>
                        <Download className="size-3.5 shrink-0 text-fg-subtle" />
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          {/* ── Revisions ──────────────────────────────────────────────── */}
          {revisions.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Vos demandes de révision</CardTitle>
              </CardHeader>
              <CardBody className="pt-3">
                <ul className="space-y-2.5">
                  {revisions.map((revision) => (
                    <li key={revision.id} className="border-s-2 border-line ps-3">
                      <p className="flex flex-wrap items-center gap-2 text-[0.75rem] font-medium text-fg">
                        #{revision.index_number} · {revision.title ?? 'Révision'}
                        {revision.is_extra === 1 && revision.extra_cost > 0 && (
                          <Badge tone="warning">
                            +{formatMoney(revision.extra_cost, revision.currency)}
                          </Badge>
                        )}
                      </p>
                      {revision.description && (
                        <p className="mt-0.5 line-clamp-2 text-[0.6875rem] text-fg-muted">
                          {revision.description}
                        </p>
                      )}
                      <p className="mt-0.5 text-[0.625rem] text-fg-subtle">
                        {formatShortDate(revision.created_at, 'fr')} ·{' '}
                        {revision.status === 'done'
                          ? 'traitée'
                          : revision.status === 'rejected'
                            ? 'non retenue'
                            : revision.status === 'in_progress'
                              ? 'en cours'
                              : 'reçue'}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardBody>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
