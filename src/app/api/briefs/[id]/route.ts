import { z } from 'zod';
import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import * as briefsRepo from '@/lib/db/repositories/briefs';
import { config } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

const updateSchema = z.object({
  csrf: z.string().optional(),
  title: z.string().trim().min(2).max(200).optional(),
  status: z.enum(['draft', 'sent', 'in_progress', 'completed', 'expired']).optional(),
  intro_text: z.string().trim().max(2000).nullable().optional(),
  project_id: z.coerce.number().int().positive().nullable().optional(),
  client_id: z.coerce.number().int().positive().nullable().optional(),
  /** Push the expiry out (or clear it) without recreating the brief. */
  expires_in_days: z.coerce.number().int().min(1).max(365).nullable().optional(),
  /** Invalidate the current link and issue a new one. */
  regenerate_token: z.boolean().optional(),
});

export async function GET(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'briefs.view' }, async () => {
    const brief = briefsRepo.findBrief(id);
    if (!brief) return notFound('Brief introuvable.');
    return Response.json({
      ok: true,
      brief,
      questions: briefsRepo.listBriefQuestions(id),
      answers: briefsRepo.latestResponses(id),
      progress: briefsRepo.briefProgress(id),
      timeline: briefsRepo.briefTimeline(id),
      url: `${config.site.url}/brief/${brief.token}`,
    });
  })(request);
}

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'briefs.update', schema: updateSchema }, async ({ body, log }) => {
    const before = briefsRepo.findBrief(id);
    if (!before) return notFound('Brief introuvable.');

    briefsRepo.updateBrief(id, {
      title: body.title,
      status: body.status,
      introText: body.intro_text,
      projectId: body.project_id,
      clientId: body.client_id,
      expiresAt:
        body.expires_in_days === undefined
          ? undefined
          : body.expires_in_days === null
            ? null
            : new Date(Date.now() + body.expires_in_days * 86400000).toISOString(),
    });

    let token = before.token;
    if (body.regenerate_token === true) {
      // The old link stops working immediately — that is the point.
      token = briefsRepo.regenerateBriefToken(id);
    }

    log({
      action: 'update',
      entityType: 'brief',
      entityId: id,
      entityLabel: body.title ?? before.title,
      summary: body.regenerate_token
        ? `Lien du brief régénéré : ${before.title} (l’ancien lien est invalidé)`
        : `Brief modifié : ${body.title ?? before.title}`,
    });

    return ok({ id, token, url: `${config.site.url}/brief/${token}` });
  })(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'briefs.delete' }, async ({ log }) => {
    const brief = briefsRepo.findBrief(id);
    if (!brief) return notFound('Brief introuvable.');

    briefsRepo.deleteBrief(id);
    log({
      action: 'delete',
      entityType: 'brief',
      entityId: id,
      entityLabel: brief.title,
      summary: `Brief supprimé : ${brief.title}`,
    });

    return ok({ deleted: true });
  })(request);
}
