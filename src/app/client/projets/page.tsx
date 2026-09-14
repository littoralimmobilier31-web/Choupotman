import Link from 'next/link';
import { FolderKanban } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardBody } from '@/components/ui/card';
import { Progress } from '@/components/ui/misc';
import { requireClientUser } from '@/lib/auth/guard';
import { portalProjects } from '@/lib/db/portal';
import { projectStatusLabel } from '@/lib/db/repositories/projects';
import { formatShortDate } from '@/lib/i18n/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Projets' };

const STATUS_TONES: Record<string, 'info' | 'brand' | 'warning' | 'success' | 'outline'> = {
  planning: 'info', in_progress: 'brand', in_review: 'warning',
  awaiting_client: 'warning', completed: 'success', archived: 'outline',
};

export default async function ClientProjectsPage() {
  const clientUser = await requireClientUser();
  const projects = portalProjects(clientUser.client_id);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <header className="mb-6">
        <h1 className="text-[1.375rem] font-semibold tracking-tight text-fg">Vos projets</h1>
        <p className="mt-1.5 text-[0.8125rem] text-fg-muted">
          Avancement, étapes et documents de chaque projet.
        </p>
      </header>

      {projects.length === 0 ? (
        <Card>
          <CardBody className="py-12 text-center">
            <FolderKanban className="mx-auto mb-3 size-6 text-fg-subtle" />
            <p className="text-[0.875rem] font-medium text-fg">Aucun projet pour le moment</p>
            <p className="mt-1.5 text-[0.8125rem] text-fg-muted">
              Vos projets apparaîtront ici dès leur démarrage.
            </p>
          </CardBody>
        </Card>
      ) : (
        <ul className="space-y-3">
          {projects.map((project) => {
            const late =
              project.delivery_date !== null &&
              project.delivery_date < today &&
              project.status !== 'completed' &&
              project.status !== 'archived';

            return (
              <li key={project.id}>
                <Link
                  href={`/client/projets/${project.id}`}
                  className="group block rounded-[var(--radius-card)] border border-line bg-surface-raised p-4 transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-soft sm:p-5"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[0.9375rem] font-semibold text-fg group-hover:text-accent">
                        {project.title}
                      </p>
                      <p className="mt-0.5 font-mono text-[0.6875rem] text-fg-subtle">{project.reference}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <Badge tone={STATUS_TONES[project.status] ?? 'neutral'}>
                        {projectStatusLabel(project.status)}
                      </Badge>
                      {project.open_revisions > 0 && (
                        <Badge tone="warning">{project.open_revisions} révision(s) en cours</Badge>
                      )}
                    </div>
                  </div>

                  {project.description && (
                    <p className="mt-2.5 line-clamp-2 text-[0.8125rem] leading-relaxed text-fg-muted">
                      {project.description}
                    </p>
                  )}

                  <div className="mt-3.5 flex items-center gap-3">
                    <Progress
                      className="flex-1"
                      value={project.progress}
                      tone={project.progress >= 80 ? 'success' : late ? 'warning' : 'accent'}
                    />
                    <span className="shrink-0 text-[0.75rem] font-medium tabular-nums text-fg">
                      {project.progress} %
                    </span>
                  </div>

                  <p className="mt-2 text-[0.6875rem] text-fg-subtle">
                    {project.start_date && `Démarré le ${formatShortDate(project.start_date, 'fr')}`}
                    {project.start_date && project.delivery_date && ' · '}
                    {project.delivery_date && (
                      <span className={late ? 'font-semibold text-warning' : undefined}>
                        livraison prévue le {formatShortDate(project.delivery_date, 'fr')}
                      </span>
                    )}
                    {!project.start_date && !project.delivery_date && 'Dates à confirmer'}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
