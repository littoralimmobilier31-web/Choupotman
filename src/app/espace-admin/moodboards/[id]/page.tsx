import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { PageHeader, Section, DemoBadge } from '@/components/admin/page-kit';
import { MoodboardCanvas } from '@/components/admin/moodboard-canvas';
import { MoodboardShare } from '@/components/admin/moodboard-share';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import { findMoodboard, listCaptureTokens, listMoodboardItems } from '@/lib/db/repositories/moodboards';
import { absoluteUrl } from '@/lib/site';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const board = findMoodboard(Number((await params).id));
  return { title: board ? board.title : 'Moodboard' };
}

export default async function MoodboardPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission('moodboards.view');
  const id = Number((await params).id);
  const board = findMoodboard(id);
  if (!Number.isInteger(id) || !board) notFound();

  const csrf = (await getCsrfToken()) ?? '';
  const items = listMoodboardItems(id);
  const canEdit = can(user, 'moodboards.update');

  return (
    <>
      <PageHeader
        title={board.title}
        description={board.description ?? undefined}
        backHref="/espace-admin/moodboards"
        backLabel="Moodboards"
        badges={
          <>
            {board.share_token && <Badge tone="info">Lien public</Badge>}
            <DemoBadge when={board.is_demo} />
          </>
        }
        actions={
          board.project_id ? (
            <Link
              href={`/espace-admin/projets/${board.project_id}`}
              className="text-[0.75rem] font-medium text-fg-muted transition-colors hover:text-fg"
            >
              {board.project_title}
            </Link>
          ) : undefined
        }
      />

      <MoodboardCanvas
        csrf={csrf}
        boardId={id}
        background={board.background}
        canEdit={canEdit}
        items={items.map((item) => ({
          id: item.id,
          kind: item.kind,
          file_id: item.file_id,
          url: item.url,
          source_url: item.source_url,
          content: item.content,
          color: item.color,
          x: item.x,
          y: item.y,
          width: item.width,
          height: item.height,
          z_index: item.z_index,
          notes: item.notes,
        }))}
      />

      <Section
        title="Partage"
        description="Qui peut voir cette planche, et ce qui peut y ajouter des éléments."
        className="mt-8"
      >
        <MoodboardShare
          csrf={csrf}
          boardId={id}
          shareToken={board.share_token}
          origin={absoluteUrl('')}
          canEdit={canEdit}
          tokens={listCaptureTokens(id).map((token) => ({
            id: token.id,
            label: token.label,
            expires_at: token.expires_at,
            revoked_at: token.revoked_at,
            last_used_at: token.last_used_at,
            created_at: token.created_at,
          }))}
        />
      </Section>
    </>
  );
}
