import { createHandler, list, ok } from '@/lib/api/handler';
import { moodboardSchema } from '@/lib/validation/admin';
import { createMoodboard, listMoodboards } from '@/lib/db/repositories/moodboards';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createHandler({ permission: 'moodboards.view' }, async ({ request }) => {
  const url = new URL(request.url);
  return list(
    listMoodboards({
      projectId: Number(url.searchParams.get('projet')) || undefined,
      clientId: Number(url.searchParams.get('client')) || undefined,
      limit: 200,
    }),
  );
});

export const POST = createHandler(
  { permission: 'moodboards.create', schema: moodboardSchema },
  async ({ body, user, log }) => {
    const id = createMoodboard({
      title: body.title,
      projectId: body.project_id ?? null,
      clientId: body.client_id ?? null,
      description: body.description ?? null,
      background: body.background ?? null,
      createdBy: user.id,
    });

    log({
      action: 'create',
      entityType: 'moodboard',
      entityId: id,
      entityLabel: body.title,
      summary: `Moodboard créé : ${body.title}`,
    });

    return ok({ id }, 201);
  },
);
