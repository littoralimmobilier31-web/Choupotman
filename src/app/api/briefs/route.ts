import { createHandler, list, ok } from '@/lib/api/handler';
import { briefSchema } from '@/lib/validation/admin';
import * as briefsRepo from '@/lib/db/repositories/briefs';
import { config } from '@/lib/config';
import type { BriefStatus } from '@/lib/db/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createHandler({ permission: 'briefs.view' }, async ({ request }) => {
  const url = new URL(request.url);
  return list(
    briefsRepo.listBriefs({
      status: (url.searchParams.get('statut') as BriefStatus | 'all') ?? undefined,
      clientId: Number.parseInt(url.searchParams.get('client') ?? '', 10) || undefined,
      limit: Math.min(300, Number.parseInt(url.searchParams.get('limit') ?? '100', 10) || 100),
    }),
  );
});

export const POST = createHandler(
  { permission: 'briefs.create', schema: briefSchema },
  async ({ body, user, log }) => {
    const { id, token } = briefsRepo.createBrief({
      title: body.title,
      clientId: body.client_id ?? null,
      projectId: body.project_id ?? null,
      leadId: body.lead_id ?? null,
      introText: body.intro_text ?? null,
      locale: body.locale,
      expiresInDays: body.expires_in_days ?? null,
      createdBy: user.id,
    });

    log({
      action: 'create',
      entityType: 'brief',
      entityId: id,
      entityLabel: body.title,
      summary: `Brief créé : ${body.title}`,
    });

    // The absolute link is what gets pasted into an email or WhatsApp message.
    return ok({ id, token, url: `${config.site.url}/brief/${token}` }, 201);
  },
);
