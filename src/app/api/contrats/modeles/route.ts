import { z } from 'zod';
import { createHandler, list, ok, badRequest } from '@/lib/api/handler';
import { contractTemplateSchema } from '@/lib/validation/admin';
import {
  deleteContractTemplate,
  findContractTemplate,
  listContractTemplates,
  upsertContractTemplate,
} from '@/lib/db/repositories/finance';
import { templateVariables } from '@/lib/db/repositories/comms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Contract templates.
 *
 * A template holds `{{variables}}` filled in when a contract is drawn up. The
 * expansion happens once, at creation, and the result is stored — editing a
 * template never changes the wording of a contract that already exists.
 */
export const GET = createHandler({ permission: 'contracts.view' }, async () =>
  list(
    listContractTemplates().map((template) => ({
      ...template,
      variables: templateVariables(template.body),
    })),
  ),
);

export const POST = createHandler(
  {
    permission: 'contracts.update',
    schema: contractTemplateSchema.extend({ id: z.coerce.number().int().positive().optional() }),
  },
  async ({ body, log }) => {
    const id = upsertContractTemplate({
      id: body.id,
      name: body.name,
      description: body.description ?? null,
      body: body.body,
      locale: body.locale,
      isDefault: body.is_default,
    });

    log({
      action: body.id ? 'update' : 'create',
      entityType: 'contract_template',
      entityId: id,
      entityLabel: body.name,
      summary: `${body.id ? 'Modèle de contrat modifié' : 'Modèle de contrat créé'} : ${body.name}`,
    });

    return ok({ id, variables: templateVariables(body.body) }, body.id ? 200 : 201);
  },
);

export const DELETE = createHandler({ permission: 'contracts.update' }, async ({ request, log }) => {
  const id = Number(new URL(request.url).searchParams.get('id'));
  const template = Number.isInteger(id) && id > 0 ? findContractTemplate(id) : null;
  if (!template) return badRequest('Modèle introuvable.');

  // Contracts keep their own text, so removing a template cannot alter one.
  deleteContractTemplate(id);
  log({
    action: 'delete',
    entityType: 'contract_template',
    entityId: id,
    entityLabel: template.name,
    summary: `Modèle de contrat supprimé : ${template.name}`,
  });

  return ok({ deleted: true });
});
