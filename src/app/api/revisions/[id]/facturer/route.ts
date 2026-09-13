import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import * as projectsRepo from '@/lib/db/repositories/projects';
import * as financeRepo from '@/lib/db/repositories/finance';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Creates the supplementary invoice for an out-of-allowance revision.
 *
 * The automation normally does this the moment the revision is recorded; this is
 * the manual path for when the rule is disabled, or when the amount was set
 * after the fact. It is idempotent: a revision already linked to an invoice is
 * refused rather than billed twice.
 */
export async function POST(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'invoices.create' }, async ({ user, log }) => {
    const revision = projectsRepo.findRevision(id);
    if (!revision) return notFound('Révision introuvable.');

    if (revision.extra_invoice_id !== null) {
      return Response.json(
        { error: 'Cette révision est déjà rattachée à une facture.' },
        { status: 409 },
      );
    }
    if (revision.is_extra !== 1 || revision.extra_cost <= 0) {
      return badRequest('Cette révision est incluse au forfait : il n’y a rien à facturer.');
    }

    const project = projectsRepo.findProject(revision.project_id);
    if (!project) return notFound('Projet introuvable.');

    const summary = projectsRepo.getRevisionSummary(project.id);

    const invoiceId = financeRepo.createInvoice({
      client_id: project.client_id,
      project_id: project.id,
      title: `Révision supplémentaire #${revision.index_number} — ${project.title}`,
      status: 'draft',
      kind: 'revision_extra',
      currency: revision.currency,
      is_demo: project.is_demo === 1,
      items: [
        {
          label: `Révision supplémentaire #${revision.index_number}`,
          description: `Au-delà des ${summary.included} révisions incluses au forfait.`,
          quantity: 1,
          unit: 'forfait',
          unit_price: revision.extra_cost,
        },
      ],
    });

    projectsRepo.updateRevision(id, { extra_invoice_id: invoiceId });

    projectsRepo.addProjectEvent({
      projectId: project.id,
      kind: 'invoice',
      title: `Facture de révision #${revision.index_number} créée`,
      actorLabel: user.full_name ?? user.username,
      entityType: 'invoice',
      entityId: invoiceId,
    });

    log({
      action: 'invoice',
      entityType: 'invoice',
      entityId: invoiceId,
      entityLabel: `Révision #${revision.index_number}`,
      summary: `Facture brouillon créée pour la révision #${revision.index_number} (${project.title})`,
      metadata: { revisionId: id, amount: revision.extra_cost, currency: revision.currency },
    });

    return ok({ invoiceId }, 201);
  })(request);
}
