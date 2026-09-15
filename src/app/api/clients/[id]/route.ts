import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { clientSchema, patchOf } from '@/lib/validation/admin';
import { diffFields } from '@/lib/db/repositories/activity';
import * as clientsRepo from '@/lib/db/repositories/clients';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

/**
 * Single-client endpoints.
 *
 * The dynamic segment is read from the route context rather than from the URL
 * string, and `PATCH` records a field-level diff in the audit log so a later
 * question like "who changed this email?" has an answer.
 */

export async function GET(request: Request, context: Params): Promise<Response> {
  const { id: raw } = await context.params;
  const id = parseId(raw);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'clients.view' }, async () => {
    const dossier = clientsRepo.getClientDossier(id);
    if (!dossier) return notFound('Client introuvable.');
    return Response.json({ ok: true, ...dossier });
  })(request);
}

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const { id: raw } = await context.params;
  const id = parseId(raw);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'clients.update', schema: patchOf(clientSchema) },
    async ({ body, log }) => {
      const before = clientsRepo.findClient(id);
      if (!before) return notFound('Client introuvable.');

      clientsRepo.updateClient(id, {
        name: body.name,
        company: body.company,
        email: body.email,
        phone: body.phone,
        whatsapp: body.whatsapp,
        country: body.country,
        city: body.city,
        address: body.address,
        website: body.website,
        social: body.social,
        tax_id: body.tax_id,
        currency: body.currency,
        preferred_locale: body.preferred_locale,
        status: body.status,
        source: body.source,
        notes: body.notes,
      });

      const diff = diffFields(before as unknown as Record<string, unknown>, body as Record<string, unknown>);
      log({
        action: 'update',
        entityType: 'client',
        entityId: id,
        entityLabel: body.name ?? before.name,
        summary: `Client modifié : ${body.name ?? before.name}`,
        metadata: { changes: diff },
      });

      return ok({ id });
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const { id: raw } = await context.params;
  const id = parseId(raw);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'clients.delete' }, async ({ log, request: req }) => {
    const client = clientsRepo.findClient(id);
    if (!client) return notFound('Client introuvable.');

    const dossier = clientsRepo.getClientDossier(id);
    const url = new URL(req.url);
    const force = url.searchParams.get('force') === '1';

    /**
     * A client with history is archived, not deleted, unless deletion is
     * explicitly forced: removing the row would cascade away projects, invoices
     * and payments — accounting records that should not vanish on a misclick.
     */
    if (!force && dossier && (dossier.projects.length > 0 || dossier.invoices.length > 0)) {
      clientsRepo.archiveClient(id);
      log({
        action: 'update',
        entityType: 'client',
        entityId: id,
        entityLabel: client.name,
        summary: `Client archivé (historique conservé) : ${client.name}`,
        metadata: { projects: dossier.projects.length, invoices: dossier.invoices.length },
      });
      return ok({ archived: true, reason: 'Le client a un historique : il a été archivé au lieu d’être supprimé.' });
    }

    clientsRepo.deleteClient(id);
    log({
      action: 'delete',
      entityType: 'client',
      entityId: id,
      entityLabel: client.name,
      summary: `Client supprimé : ${client.name}`,
    });
    return ok({ deleted: true });
  })(request);
}
