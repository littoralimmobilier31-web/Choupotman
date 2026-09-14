import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { leadConvertSchema } from '@/lib/validation/admin';
import * as leadsRepo from '@/lib/db/repositories/leads';
import * as clientsRepo from '@/lib/db/repositories/clients';
import * as projectsRepo from '@/lib/db/repositories/projects';
import { emit } from '@/lib/automation/engine';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Converts a lead into a client, and optionally straight into a project.
 *
 * The lead is kept and linked rather than consumed, so the CRM can always answer
 * where a client came from. Converting twice is refused instead of silently
 * creating a duplicate client.
 */
export async function POST(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: ['clients.create', 'leads.update'], schema: leadConvertSchema },
    async ({ body, user, log }) => {
      const lead = leadsRepo.findLead(id);
      if (!lead) return notFound('Prospect introuvable.');

      if (lead.client_id !== null) {
        return Response.json(
          {
            error: 'Ce prospect a déjà été converti.',
            clientId: lead.client_id,
            projectId: lead.project_id,
          },
          { status: 409 },
        );
      }

      const clientId = clientsRepo.createClient({
        name: lead.name,
        company: lead.company,
        email: lead.email,
        phone: lead.phone,
        country: lead.country,
        city: lead.city,
        currency: lead.currency,
        // Where the lead came from is the client's acquisition source.
        source: lead.source,
        notes: lead.message,
        is_demo: lead.is_demo === 1,
        created_by: user.id,
      });

      let projectId: number | null = null;
      if (body.createProject) {
        const title = (body.projectTitle ?? '').trim() || `${lead.company ?? lead.name} — nouveau projet`;
        projectId = projectsRepo.createProject({
          title,
          client_id: clientId,
          description: lead.message,
          status: 'planning',
          budget: body.budget ?? lead.estimated_value,
          currency: lead.currency,
          is_demo: lead.is_demo === 1,
          created_by: user.id,
        });

        // The scaffolding rule creates the stages, starter tasks and folders.
        emit('project.created', { projectId, actorLabel: user.full_name ?? user.username });

        projectsRepo.addProjectEvent({
          projectId,
          kind: 'created',
          title: `Projet créé depuis le prospect « ${lead.name} »`,
          actorLabel: user.full_name ?? user.username,
          entityType: 'lead',
          entityId: id,
        });
      }

      leadsRepo.updateLead(id, { stage: 'won', client_id: clientId, project_id: projectId });

      log({
        action: 'update',
        entityType: 'lead',
        entityId: id,
        entityLabel: lead.name,
        summary: `Prospect converti : ${lead.name} → client #${clientId}${
          projectId ? ` et projet #${projectId}` : ''
        }`,
        metadata: { clientId, projectId },
      });

      return ok({ clientId, projectId }, 201);
    },
  )(request);
}
