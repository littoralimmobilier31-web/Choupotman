import { createHandler, list, ok, badRequest } from '@/lib/api/handler';
import { messageTemplateSchema } from '@/lib/validation/admin';
import {
  deleteMessageTemplate,
  findMessageTemplate,
  listMessageTemplates,
  templateVariables,
  upsertMessageTemplate,
} from '@/lib/db/repositories/comms';
import { TEMPLATE_VARIABLE_HELP } from '@/lib/mail/templates';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Message templates.
 *
 * Templates hold `{{variables}}` that are filled in server-side at send time, so
 * the same relance reads correctly for every client without anyone editing three
 * sentences by hand each time. The variables a template actually uses are
 * reported back, so the editor can show which ones will be substituted and warn
 * about a name that nothing will fill.
 */
export const GET = createHandler({ permission: 'messages.view' }, async () =>
  list(
    listMessageTemplates().map((template) => ({
      ...template,
      variables: templateVariables(`${template.subject ?? ''} ${template.body}`),
    })),
  ),
);

export const POST = createHandler(
  { permission: 'messages.update', schema: messageTemplateSchema },
  async ({ body, log }) => {
    const used = templateVariables(`${body.subject ?? ''} ${body.body}`);
    const unknown = used.filter((name) => !(name in TEMPLATE_VARIABLE_HELP));

    const id = upsertMessageTemplate({
      key: body.key,
      name: body.name,
      channel: body.channel,
      subject: body.subject ?? null,
      body: body.body,
      locale: body.locale,
      description: body.description ?? null,
    });

    log({
      action: 'update',
      entityType: 'message_template',
      entityId: id,
      entityLabel: body.name,
      summary: `Modèle de message enregistré : ${body.name} (${body.key})`,
    });

    // A variable nobody fills is left as-is rather than rejected: the template
    // may be a draft. The interface shows the warning.
    return ok({ id, variables: used, unknownVariables: unknown });
  },
);

export const DELETE = createHandler({ permission: 'messages.update' }, async ({ request, log }) => {
  const key = new URL(request.url).searchParams.get('cle');
  const template = key ? findMessageTemplate(key) : null;
  if (!template) return badRequest('Modèle introuvable.');

  deleteMessageTemplate(template.id);
  log({
    action: 'delete',
    entityType: 'message_template',
    entityId: template.id,
    entityLabel: template.name,
    summary: `Modèle de message supprimé : ${template.name}`,
  });

  return ok({ deleted: true });
});
