import Link from 'next/link';
import { Palette } from 'lucide-react';
import { PageHeader, SummaryStrip, ListEmpty, DemoBadge } from '@/components/admin/page-kit';
import { Badge } from '@/components/ui/badge';
import { NewMoodboardButton } from '@/components/admin/moodboard-create';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import { listMoodboards } from '@/lib/db/repositories/moodboards';
import { clientOptions } from '@/lib/db/repositories/clients';
import { projectOptions } from '@/lib/db/repositories/projects';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Moodboards' };

export default async function MoodboardsPage() {
  const user = await requirePermission('moodboards.view');
  const csrf = (await getCsrfToken()) ?? '';
  const moodboards = listMoodboards({ limit: 200 });

  return (
    <>
      <PageHeader
        title="Moodboards"
        description="La direction visuelle d’un projet, posée sur une toile : images, couleurs, références et notes, déplaçables à la souris."
        actions={
          can(user, 'moodboards.create') && (
            <NewMoodboardButton
              csrf={csrf}
              clients={clientOptions().map((client) => ({ value: String(client.id), label: client.label }))}
              projects={projectOptions().map((project) => ({ value: String(project.id), label: project.label }))}
            />
          )
        }
      />

      <SummaryStrip
        items={[
          { label: 'Moodboards', value: moodboards.length },
          { label: 'Éléments', value: moodboards.reduce((total, board) => total + board.item_count, 0) },
          { label: 'Partagés publiquement', value: moodboards.filter((board) => board.share_token !== null).length },
        ]}
      />

      <div className="mt-5">
        {moodboards.length === 0 ? (
          <ListEmpty
            icon={<Palette className="size-5" />}
            title="Aucun moodboard"
            description="Un moodboard permet de s’accorder avec le client sur le style avant d’écrire une ligne de code — c’est ce qui évite les révisions de dernière minute."
          />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {moodboards.map((board) => (
              <li key={board.id}>
                <Link
                  href={`/espace-admin/moodboards/${board.id}`}
                  className="group block overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface-raised transition-colors hover:border-line-strong"
                >
                  <div
                    className="flex aspect-[16/10] items-center justify-center bg-surface-sunken"
                    style={board.background ? { background: board.background } : undefined}
                  >
                    {board.cover_url ? (
                      // Arbitrary external address, outside Next's image domains.
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={board.cover_url}
                        alt=""
                        className="size-full object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <Palette className="size-6 text-fg-subtle" />
                    )}
                  </div>

                  <div className="p-3">
                    <p className="flex items-center gap-2">
                      <span className="truncate text-[0.875rem] font-semibold text-fg group-hover:text-accent">
                        {board.title}
                      </span>
                      <DemoBadge when={board.is_demo} />
                      {board.share_token && <Badge tone="info">Lien public</Badge>}
                    </p>
                    <p className="mt-0.5 truncate text-[0.6875rem] text-fg-subtle">
                      {[board.project_title, board.client_name].filter(Boolean).join(' · ') || 'Sans projet'}
                    </p>
                    <p className="mt-1.5 text-[0.6875rem] text-fg-muted">
                      {board.item_count} élément{board.item_count === 1 ? '' : 's'} · modifié le{' '}
                      {board.updated_at.slice(0, 10)}
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
