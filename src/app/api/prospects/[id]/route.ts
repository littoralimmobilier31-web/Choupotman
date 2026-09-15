import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { leadSchema, leadStageSchema, patchOf } from '@/lib/validation/admin';
import * as leadsRepo from '@/lib/db/repositories/leads';
import { diffFields } from '@/lib/db/repositories/activity';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'leads.view' }, async () => {
    const lead = leadsRepo.findLead(id);
    if (!lead) return notFound('Prospect introuvable.');
    return Response.json({ ok: true, lead, payload: leadsRepo.leadPayload(lead) });
  })(request);
}

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'leads.update', schema: patchOf(leadSchema) },
    async ({ body, log }) => {
      const before = leadsRepo.findLead(id);
      if (!before) return notFound('Prospect introuvable.');

      leadsRepo.updateLead(id, {
        name: body.name,
        company: body.company,
        email: body.email,
        phone: body.phone,
        country: body.country,
        city: body.city,
        stage: body.stage,
        source: body.source,
        service_interest: body.service_interest,
        budget_range: body.budget_range,
        estimated_value: body.estimated_value,
        currency: body.currency,
        deadline_hint: body.deadline_hint,
        message: body.message,
        assigned_to: body.assigned_to,
        lost_reason: body.lost_reason,
        // Qualification signals changed, so the score must follow them. Built
        // field by field rather than spreading the row, because only these six
        // feed the score and the row carries incompatible flag types.
        score: leadsRepo.scoreLead({
          email: body.email ?? before.email,
          phone: body.phone ?? before.phone,
          company: body.company ?? before.company,
          budget_range: body.budget_range ?? before.budget_range,
          estimated_value: body.estimated_value ?? before.estimated_value,
          deadline_hint: body.deadline_hint ?? before.deadline_hint,
          service_interest: body.service_interest ?? before.service_interest,
          message: body.message ?? before.message,
        }),
      });

      log({
        action: 'update',
        entityType: 'lead',
        entityId: id,
        entityLabel: body.name ?? before.name,
        summary: `Prospect modifié : ${body.name ?? before.name}`,
        metadata: {
          changes: diffFields(before as unknown as Record<string, unknown>, body as Record<string, unknown>),
        },
      });

      return ok({ id, lead: leadsRepo.findLead(id) });
    },
  )(request);
}

/** PUT — pipeline drag & drop: move to another stage. */
export async function PUT(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'leads.update', schema: leadStageSchema },
    async ({ body, log }) => {
      const before = leadsRepo.findLead(id);
      if (!before) return notFound('Prospect introuvable.');

      leadsRepo.moveLeadStage(id, body.stage, body.lost_reason ?? null);

      log({
        action: 'status_change',
        entityType: 'lead',
        entityId: id,
        entityLabel: before.name,
        summary: `Prospect ${before.name} : ${leadsRepo.stageLabel(before.stage)} → ${leadsRepo.stageLabel(body.stage)}`,
        metadata: { from: before.stage, to: body.stage, lostReason: body.lost_reason ?? null },
      });

      return ok({ id, stage: body.stage });
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'leads.delete' }, async ({ request: req, log }) => {
    const lead = leadsRepo.findLead(id);
    if (!lead) return notFound('Prospect introuvable.');

    // A converted lead is the origin of a client and possibly a project: keeping
    // it is how the CRM can still answer "where did this client come from?".
    const force = new URL(req.url).searchParams.get('force') === '1';
    if ((lead.client_id !== null || lead.project_id !== null) && !force) {
      leadsRepo.moveLeadStage(id, 'won');
      return ok({
        archived: true,
        reason: 'Ce prospect a été converti : il est conservé comme origine du client.',
      });
    }

    leadsRepo.deleteLead(id);
    log({
      action: 'delete',
      entityType: 'lead',
      entityId: id,
      entityLabel: lead.name,
      summary: `Prospect supprimé : ${lead.name}`,
    });

    return ok({ deleted: true });
  })(request);
}
