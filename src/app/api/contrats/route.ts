import { createHandler, list, ok, badRequest } from '@/lib/api/handler';
import { contractSchema } from '@/lib/validation/admin';
import {
  createContract,
  findContractTemplate,
  defaultContractTemplate,
  listContracts,
} from '@/lib/db/repositories/finance';
import { findClient } from '@/lib/db/repositories/clients';
import { findProject } from '@/lib/db/repositories/projects';
import { renderTemplate } from '@/lib/db/repositories/comms';
import { getSiteProfile } from '@/lib/site';
import { formatMoney, formatDate } from '@/lib/i18n/format';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createHandler({ permission: 'contracts.view' }, async ({ request }) => {
  const url = new URL(request.url);
  return list(
    listContracts({
      clientId: Number(url.searchParams.get('client')) || undefined,
      projectId: Number(url.searchParams.get('projet')) || undefined,
      status: url.searchParams.get('statut') ?? undefined,
      limit: 200,
    }),
  );
});

/**
 * Creates a contract, expanding a template if one is chosen.
 *
 * The substitution happens here and the result is stored as plain text, so the
 * contract is frozen at the moment it was drawn up. Editing the template
 * afterwards must not silently change the wording of a contract a client already
 * signed — which is exactly what would happen if the body were rendered on read.
 *
 * The filled-in variables are kept alongside the text, so it stays possible to
 * see what was substituted and from where.
 */
export const POST = createHandler(
  { permission: 'contracts.create', schema: contractSchema },
  async ({ body, user, log }) => {
    const client = body.client_id ? findClient(body.client_id) : null;
    if (body.client_id && !client) return badRequest('Client introuvable.');

    const project = body.project_id ? findProject(body.project_id) : null;
    if (body.project_id && !project) return badRequest('Projet introuvable.');

    const written = (body.body ?? '').trim();

    const template = body.template_id
      ? findContractTemplate(body.template_id)
      : written.length === 0
        ? defaultContractTemplate()
        : null;

    if (body.template_id && !template) return badRequest('Modèle de contrat introuvable.');

    // Either a template supplies the text, or the text was written here.
    if (!template && written.length < 20) {
      return Response.json(
        {
          error: 'Le contrat est vide.',
          fields: { body: 'Choisissez un modèle, ou rédigez le contrat (20 caractères minimum).' },
        },
        { status: 400 },
      );
    }

    const profile = getSiteProfile();
    const amount = body.amount;

    const variables: Record<string, string> = {
      client_name: client?.name ?? '',
      company: client?.company ?? '',
      client_address: client?.address ?? '',
      client_tax_id: client?.tax_id ?? '',
      project_title: project?.title ?? body.title,
      project_description: project?.description ?? '',
      amount: formatMoney(amount, body.currency),
      currency: body.currency,
      start_date: body.start_date ? formatDate(body.start_date, 'fr') : '',
      delivery_date: body.delivery_date ? formatDate(body.delivery_date, 'fr') : '',
      revisions_included: String(project?.revisions_included ?? ''),
      owner_name: profile.ownerName,
      owner_email: profile.email ?? '',
      owner_phone: profile.phone ?? '',
      today: formatDate(new Date().toISOString().slice(0, 10), 'fr'),
    };

    const text = template ? renderTemplate(template.body, variables) : written;

    const id = createContract({
      templateId: template?.id ?? null,
      clientId: body.client_id ?? null,
      projectId: body.project_id ?? null,
      title: body.title,
      body: text,
      variables,
      startDate: body.start_date ?? null,
      deliveryDate: body.delivery_date ?? null,
      amount,
      currency: body.currency,
      locale: body.locale,
      createdBy: user.id,
    });

    log({
      action: 'contract',
      entityType: 'contract',
      entityId: id,
      entityLabel: body.title,
      summary: `Contrat créé : ${body.title}${client ? ` — ${client.name}` : ''}`,
      metadata: { amount, currency: body.currency, templateId: template?.id ?? null },
    });

    return ok({ id }, 201);
  },
);
