import { notFound } from 'next/navigation';
import { ExternalLink, Link2 } from 'lucide-react';
import { findMoodboardByShareToken, listMoodboardItems } from '@/lib/db/repositories/moodboards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Read-only public view of a moodboard.
 *
 * Addressed by an unguessable token rather than by id, and indexed by nobody:
 * the page is `noindex`, so a link sent to one client does not end up in a search
 * result. There is no editing surface here at all — not hidden, absent — and the
 * capture endpoint is a different route with its own credential.
 */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const board = findMoodboardByShareToken((await params).token);
  return {
    title: board ? `${board.title} — Moodboard` : 'Moodboard',
    robots: { index: false, follow: false },
  };
}

export default async function SharedMoodboardPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const board = findMoodboardByShareToken(token);
  // A wrong token and a board whose sharing was turned off answer identically.
  if (!board) notFound();

  const items = listMoodboardItems(board.id);
  const height = Math.max(560, ...items.map((item) => item.y + item.height + 80));

  return (
    <main className="mx-auto max-w-[1400px] px-4 py-8 sm:px-6">
      <header className="mb-5">
        <h1 className="text-[1.375rem] font-semibold tracking-tight text-fg sm:text-[1.625rem]">{board.title}</h1>
        {board.description && (
          <p className="mt-1.5 max-w-2xl text-[0.875rem] leading-relaxed text-fg-muted">{board.description}</p>
        )}
        <p className="mt-2 text-[0.75rem] text-fg-subtle">
          {items.length} élément{items.length === 1 ? '' : 's'} · mis à jour le {board.updated_at.slice(0, 10)}
        </p>
      </header>

      {items.length === 0 ? (
        <p className="rounded-[var(--radius-card)] border border-line bg-surface-sunken px-4 py-10 text-center text-[0.875rem] text-fg-muted">
          Cette planche est encore vide.
        </p>
      ) : (
        <div
          className="relative overflow-hidden rounded-[var(--radius-card)] border border-line"
          style={{ height, background: board.background ?? 'var(--color-surface-sunken)' }}
        >
          {items.map((item) => (
            <div
              key={item.id}
              style={{
                left: item.x,
                top: item.y,
                width: item.width,
                height: item.height,
                zIndex: item.z_index,
              }}
              className="absolute overflow-hidden rounded-lg border border-line bg-surface shadow-sm"
            >
              {item.kind === 'image' && (
                // Arbitrary address, or a library file served through the portal-
                // style handler. A plain <img> either way.

                <img
                  src={item.file_id ? `/api/moodboard-public/${token}/${item.file_id}` : (item.url ?? '')}
                  alt={item.notes ?? ''}
                  className="size-full object-cover"
                  loading="lazy"
                />
              )}

              {item.kind === 'color' && (
                <div
                  className="flex size-full flex-col items-center justify-center"
                  style={{ background: item.color ?? '#888' }}
                >
                  <span className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-[0.6875rem] text-white">
                    {item.color}
                  </span>
                </div>
              )}

              {(item.kind === 'text' || item.kind === 'note') && (
                <div className={`size-full overflow-auto p-3 ${item.kind === 'note' ? 'bg-warning-soft' : ''}`}>
                  <p className="whitespace-pre-line text-[0.8125rem] leading-relaxed text-fg">{item.content}</p>
                </div>
              )}

              {item.kind === 'link' && (
                <div className="flex size-full flex-col justify-center gap-1 p-3">
                  <Link2 className="size-4 text-accent" />
                  <p className="line-clamp-2 text-[0.8125rem] font-medium text-fg">{item.content ?? item.url}</p>
                  {item.url && (
                    <a
                      href={item.url}
                      target="_blank"
                      rel="noreferrer nofollow"
                      className="inline-flex items-center gap-1 truncate text-[0.6875rem] text-accent underline-offset-2 hover:underline"
                    >
                      <ExternalLink className="size-2.5 shrink-0" />
                      {item.url}
                    </a>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="mt-4 text-[0.75rem] text-fg-subtle">
        Planche partagée en lecture seule. Pour demander une modification, répondez au message qui vous a transmis
        ce lien.
      </p>
    </main>
  );
}
