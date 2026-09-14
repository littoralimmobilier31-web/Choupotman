import { z } from 'zod';
import * as briefsRepo from '@/lib/db/repositories/briefs';
import * as projectsRepo from '@/lib/db/repositories/projects';
import { notify } from '@/lib/db/repositories/comms';
import { logActivity } from '@/lib/db/repositories/activity';
import { isSameOrigin } from '@/lib/auth/csrf';
import { clientIp, rateLimit, tooManyRequests } from '@/lib/auth/rate-limit';
import { emit } from '@/lib/automation/engine';
import { fieldErrors } from '@/lib/validation/public';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Public brief endpoint — authenticated by the token in the URL, with no session.
 *
 * The token *is* the credential, so:
 *  - an unknown or expired token is a flat 404, never a hint that it once existed;
 *  - there is no CSRF token to bind (the client has no session), so the Origin
 *    check plus the unguessable token are the defence, and the endpoint can only
 *    ever write answers to that one brief;
 *  - saves are rate-limited per token, so a leaked link cannot be used to hammer
 *    the database;
 *  - only question keys that belong to this brief are accepted, so the payload
 *    cannot smuggle arbitrary rows in.
 */

type Params = { params: Promise<{ token: string }> };

const answerSchema = z.object({
  key: z.string().trim().min(1).max(80),
  value: z.string().max(8000).nullable(),
});

const saveSchema = z.object({
  answers: z.array(answerSchema).min(1).max(60),
  /** The client pressed "Envoyer" on the last step. */
  complete: z.boolean().default(false),
});

function publicView(brief: briefsRepo.BriefWithMeta) {
  return {
    title: brief.title,
    introText: brief.intro_text,
    locale: brief.locale,
    status: brief.status,
    questions: briefsRepo.listBriefQuestions(brief.id).map((question) => ({
      key: question.key,
      label: question.label,
      helpText: question.help_text,
      inputType: question.input_type,
      options: question.optionList,
      required: question.is_required === 1,
      section: question.section,
    })),
    answers: briefsRepo.latestResponses(brief.id),
    progress: briefsRepo.briefProgress(brief.id),
  };
}

export async function GET(request: Request, context: Params): Promise<Response> {
  const { token } = await context.params;
  const brief = briefsRepo.findBriefByToken(token);
  if (!brief) return Response.json({ error: 'Lien introuvable.' }, { status: 404 });
  if (briefsRepo.isBriefExpired(brief)) {
    return Response.json({ error: 'Ce lien a expiré.', expired: true }, { status: 410 });
  }
  return Response.json({ ok: true, brief: publicView(brief) }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request, context: Params): Promise<Response> {
  const { token } = await context.params;

  if (!isSameOrigin(request)) {
    return Response.json({ error: 'Requête refusée.' }, { status: 403 });
  }

  const brief = briefsRepo.findBriefByToken(token);
  if (!brief) return Response.json({ error: 'Lien introuvable.' }, { status: 404 });
  if (briefsRepo.isBriefExpired(brief)) {
    return Response.json({ error: 'Ce lien a expiré.', expired: true }, { status: 410 });
  }
  if (brief.status === 'completed') {
    return Response.json(
      { error: 'Ce brief a déjà été validé. Contactez-nous pour toute modification.' },
      { status: 409 },
    );
  }

  const limit = rateLimit('briefSave', `${token}:${clientIp(request)}`);
  if (!limit.allowed) return tooManyRequests(limit);

  const parsed = saveSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ error: 'Données invalides.', fields: fieldErrors(parsed.error) }, { status: 400 });
  }

  // Only this brief's own questions may be answered.
  const questions = new Map(briefsRepo.listBriefQuestions(brief.id).map((q) => [q.key, q]));
  const accepted = parsed.data.answers.filter((answer) => questions.has(answer.key));
  if (accepted.length === 0) {
    return Response.json({ error: 'Aucune réponse reconnue.' }, { status: 400 });
  }

  for (const answer of accepted) {
    briefsRepo.saveBriefResponse({
      briefId: brief.id,
      questionKey: answer.key,
      questionId: questions.get(answer.key)?.id ?? null,
      value: answer.value,
    });
  }

  // Each answer lands on the project's timeline, which is the point of the brief.
  if (brief.project_id !== null) {
    projectsRepo.addProjectEvent({
      projectId: brief.project_id,
      kind: 'brief',
      title: `Brief complété à ${briefsRepo.briefProgress(brief.id).percent} %`,
      body: accepted.map((a) => questions.get(a.key)?.label).filter(Boolean).join(' · '),
      actorLabel: brief.client_name ?? 'Client',
      entityType: 'brief',
      entityId: brief.id,
    });
  }

  const progress = briefsRepo.briefProgress(brief.id);
  let completed = false;

  if (parsed.data.complete) {
    if (progress.requiredMissing.length > 0) {
      return Response.json(
        {
          error: 'Certaines réponses obligatoires sont manquantes.',
          missing: progress.requiredMissing,
          progress,
        },
        { status: 400 },
      );
    }
    briefsRepo.markBriefCompleted(brief.id);
    completed = true;
    emit('brief.completed', { briefId: brief.id });
  } else {
    notify({
      kind: 'form',
      title: `Brief en cours — ${brief.title}`,
      body: `${progress.answered}/${progress.total} réponses`,
      url: `/espace-admin/briefs/${brief.id}`,
      entityType: 'brief',
      entityId: brief.id,
      // One notification per brief per day: progress saves are frequent.
      dedupeKey: `brief-progress-${brief.id}-${new Date().toISOString().slice(0, 10)}`,
    });
  }

  logActivity({
    actorLabel: brief.client_name ?? 'Client (lien brief)',
    action: 'update',
    entityType: 'brief',
    entityId: brief.id,
    entityLabel: brief.title,
    summary: completed
      ? `Brief validé par le client : ${brief.title}`
      : `Réponses enregistrées (${accepted.length}) sur le brief ${brief.title}`,
    ip: clientIp(request),
  });

  return Response.json({ ok: true, saved: accepted.length, completed, progress });
}
