import { apiClientUser } from '@/lib/auth/guard';
import { assertClientCsrf, CsrfError } from '@/lib/auth/csrf';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/auth/rate-limit';
import { clientFeedbackSchema, fieldErrors } from '@/lib/validation/public';
import { portalProject } from '@/lib/db/portal';
import { createFeedback, addProjectEvent } from '@/lib/db/repositories/projects';
import { logActivity } from '@/lib/db/repositories/activity';
import { emit } from '@/lib/automation/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Feedback submitted from the client portal.
 *
 * The project is looked up through `portalProject`, which filters on the signed-in
 * client's own id: a client cannot leave feedback on — or thereby learn of the
 * existence of — someone else's project by changing the id in the payload.
 *
 * An approval is emitted as its own event, because that is what can close a
 * project; the automation rules decide what follows.
 */
export async function POST(request: Request): Promise<Response> {
  const auth = await apiClientUser();
  if (!auth.ok) return auth.response;

  try {
    const raw = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    await assertClientCsrf(request, typeof raw.csrf === 'string' ? raw.csrf : null);

    const limit = rateLimit('api', `client-feedback:${auth.clientUser.id}`);
    if (!limit.allowed) return tooManyRequests(limit);

    const parsed = clientFeedbackSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json({ error: 'Données invalides.', fields: fieldErrors(parsed.error) }, { status: 400 });
    }

    const { projectId, comment, rating, decision } = parsed.data;

    const project = portalProject(auth.clientUser.client_id, projectId);
    if (!project) return Response.json({ error: 'Projet introuvable.' }, { status: 404 });

    const authorLabel = auth.clientUser.full_name ?? auth.clientUser.email;

    const id = createFeedback({
      projectId,
      clientId: auth.clientUser.client_id,
      authorLabel,
      comment: comment || null,
      rating: rating ?? null,
      decision,
      source: 'portal',
    });

    addProjectEvent({
      projectId,
      kind: 'feedback',
      title:
        decision === 'approved'
          ? 'Livraison validée par le client'
          : decision === 'changes_requested'
            ? 'Modifications demandées par le client'
            : 'Retour du client',
      body: comment || null,
      actorLabel: authorLabel,
      entityType: 'feedback',
      entityId: id,
    });

    emit('feedback.received', { projectId, feedbackId: id });
    if (decision === 'approved') emit('feedback.approved', { projectId, feedbackId: id });

    logActivity({
      actorLabel: authorLabel,
      action: 'create',
      entityType: 'feedback',
      entityId: id,
      entityLabel: project.title,
      summary: `Retour client depuis l’espace client (${decision})`,
      ip: clientIp(request),
    });

    return Response.json({ ok: true, id });
  } catch (error) {
    if (error instanceof CsrfError) {
      return Response.json({ error: error.message }, { status: 403 });
    }
    console.error('Client feedback failed', error);
    return Response.json({ error: 'Une erreur est survenue.' }, { status: 500 });
  }
}
