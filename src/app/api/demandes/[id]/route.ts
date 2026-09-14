import { z } from 'zod';
import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import * as commsRepo from '@/lib/db/repositories/comms';
import * as leadsRepo from '@/lib/db/repositories/leads';
import { emit } from '@/lib/automation/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * A submission is what a visitor actually wrote: it is never edited, only
 * triaged. Hence a status-only endpoint plus a separate "promote to lead" POST.
 */
const triageSchema = z.object({
  csrf: z.string().optional(),
  // The schema's status set is new|read|converted|spam; `converted` is set by the
  // promote-to-lead path below, not chosen by hand.
  status: z.enum(['read', 'spam']),
});

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'leads.update', schema: triageSchema }, async ({ body, log }) => {
    const submission = commsRepo.findContactSubmission(id);
    if (!submission) return notFound('Demande introuvable.');

    if (body.status === 'spam') commsRepo.markSubmissionSpam(id);
    else commsRepo.markSubmissionRead(id);

    log({
      action: 'status_change',
      entityType: 'contact_submission',
      entityId: id,
      entityLabel: submission.name,
      summary: `Demande de ${submission.name} marquée « ${body.status} »`,
      metadata: { from: submission.status, to: body.status },
    });

    return ok({ id, status: body.status });
  })(request);
}

/** Promotes a submission into the sales pipeline. */
export async function POST(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'leads.create' }, async ({ log }) => {
    const submission = commsRepo.findContactSubmission(id);
    if (!submission) return notFound('Demande introuvable.');

    if (submission.lead_id !== null) {
      return Response.json(
        { error: 'Cette demande a déjà été convertie en prospect.', leadId: submission.lead_id },
        { status: 409 },
      );
    }

    const leadId = leadsRepo.createLead({
      name: submission.name,
      company: submission.company,
      email: submission.email,
      phone: submission.phone,
      source: submission.source,
      service_interest: submission.service,
      budget_range: submission.budget,
      deadline_hint: submission.deadline,
      message: submission.message,
      // The original answers are kept verbatim, so nothing the visitor wrote is lost.
      payload: submission.payloadData,
    });

    commsRepo.linkSubmissionToLead(id, leadId);
    const outcomes = emit('lead.created', { leadId });

    log({
      action: 'create',
      entityType: 'lead',
      entityId: leadId,
      entityLabel: submission.name,
      summary: `Prospect créé depuis la demande #${id} : ${submission.name}`,
      metadata: { submissionId: id, automations: outcomes },
    });

    return ok({ leadId }, 201);
  })(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'leads.delete' }, async ({ log }) => {
    const submission = commsRepo.findContactSubmission(id);
    if (!submission) return notFound('Demande introuvable.');

    commsRepo.deleteContactSubmission(id);
    log({
      action: 'delete',
      entityType: 'contact_submission',
      entityId: id,
      entityLabel: submission.name,
      summary: `Demande supprimée : ${submission.name}`,
    });

    return ok({ deleted: true });
  })(request);
}
