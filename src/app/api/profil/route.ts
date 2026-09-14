import { createHandler, list, ok } from '@/lib/api/handler';
import { profileEntrySchema } from '@/lib/validation/admin';
import { createProfileEntry, listProfileEntries } from '@/lib/db/repositories/content';
import { revalidatePublic } from '@/lib/revalidate';
import type { ProfileEntryKind } from '@/lib/db/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createHandler({ permission: 'profile.view' }, async ({ request }) => {
  const url = new URL(request.url);
  const kind = url.searchParams.get('type') as ProfileEntryKind | null;
  // `false` = include unpublished: the admin manages drafts too.
  return list(listProfileEntries(kind ?? undefined, false));
});

/**
 * Adds an entry to the owner's professional background.
 *
 * Nothing here is generated or suggested: the public "À propos" page shows
 * exactly these rows and nothing else, which is the mechanism behind the rule
 * that the site never invents a diploma, a certification or an experience.
 */
export const POST = createHandler(
  { permission: 'profile.create', schema: profileEntrySchema },
  async ({ body, log }) => {
    const id = createProfileEntry({
      kind: body.kind,
      title: body.title,
      organisation: body.organisation ?? null,
      location: body.location ?? null,
      start_date: body.start_date ?? null,
      end_date: body.is_current ? null : (body.end_date ?? null),
      is_current: body.is_current,
      description: body.description ?? null,
      level: body.level ?? null,
      icon: body.icon ?? null,
      url: body.url ?? null,
      position: body.position,
      is_published: body.is_published,
    });

    log({
      action: 'create',
      entityType: 'profile_entry',
      entityId: id,
      entityLabel: body.title,
      summary: `Élément de parcours ajouté : ${body.title} (${body.kind})`,
    });

    revalidatePublic('about');
    return ok({ id }, 201);
  },
);
