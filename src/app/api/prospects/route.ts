import { createHandler, list, ok } from '@/lib/api/handler';
import { leadSchema } from '@/lib/validation/admin';
import * as leadsRepo from '@/lib/db/repositories/leads';
import { emit } from '@/lib/automation/engine';
import type { LeadStage } from '@/lib/db/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createHandler({ permission: 'leads.view' }, async ({ request }) => {
  const url = new URL(request.url);
  const filter = {
    stage: (url.searchParams.get('etape') as LeadStage | 'all' | 'open') ?? undefined,
    source: url.searchParams.get('source') ?? undefined,
    search: url.searchParams.get('q') ?? undefined,
    assignedTo: Number.parseInt(url.searchParams.get('assigne') ?? '', 10) || undefined,
    limit: Math.min(500, Number.parseInt(url.searchParams.get('limit') ?? '200', 10) || 200),
  };

  if (url.searchParams.get('vue') === 'pipeline') {
    return Response.json({ ok: true, columns: leadsRepo.getPipeline(), stats: leadsRepo.getPipelineStats() });
  }

  return list(leadsRepo.listLeads(filter));
});

export const POST = createHandler(
  { permission: 'leads.create', schema: leadSchema },
  async ({ body, log }) => {
    // The score is recomputed server-side from the submitted signals: it drives
    // sorting and the chatbot's behaviour, so the client never gets to set it.
    const id = leadsRepo.createLead({
      name: body.name,
      company: body.company ?? null,
      email: body.email ?? null,
      phone: body.phone ?? null,
      country: body.country ?? null,
      city: body.city ?? null,
      stage: body.stage,
      source: body.source,
      service_interest: body.service_interest ?? null,
      budget_range: body.budget_range ?? null,
      estimated_value: body.estimated_value,
      currency: body.currency,
      deadline_hint: body.deadline_hint ?? null,
      message: body.message ?? null,
      assigned_to: body.assigned_to ?? null,
    });

    const outcomes = emit('lead.created', { leadId: id });

    log({
      action: 'create',
      entityType: 'lead',
      entityId: id,
      entityLabel: body.name,
      summary: `Prospect créé : ${body.name}`,
      metadata: { automations: outcomes },
    });

    return ok({ id, lead: leadsRepo.findLead(id) }, 201);
  },
);
