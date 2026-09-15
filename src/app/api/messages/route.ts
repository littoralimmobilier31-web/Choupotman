import { createHandler, list, ok, badRequest } from '@/lib/api/handler';
import { messageSchema } from '@/lib/validation/admin';
import { countMessages, findMessageTemplate, listMessages, renderTemplate } from '@/lib/db/repositories/comms';
import { findClient } from '@/lib/db/repositories/clients';
import { findProject } from '@/lib/db/repositories/projects';
import { findInvoice } from '@/lib/db/repositories/finance';
import { sendEmail } from '@/lib/mail/send';
import { config } from '@/lib/config';
import type { MessageStatus } from '@/lib/db/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createHandler({ permission: 'messages.view' }, async ({ request }) => {
  const url = new URL(request.url);
  const status = (url.searchParams.get('statut') as MessageStatus) || undefined;

  return list(
    listMessages({
      status,
      clientId: Number(url.searchParams.get('client')) || undefined,
      projectId: Number(url.searchParams.get('projet')) || undefined,
      search: url.searchParams.get('q') ?? undefined,
      limit: 200,
    }),
    { total: countMessages(status) },
  );
});

/**
 * Composes a message, optionally sending it.
 *
 * `send: false` saves a draft, which is the default: a message to a client is
 * worth re-reading before it leaves. When sending, `sendEmail` records the
 * message first and then attempts delivery, so a failed send is visible in the
 * outbox with its error rather than lost.
 *
 * With no SMTP configured the message is queued rather than discarded — the
 * application is fully usable before mail is set up, and the queue can be
 * flushed later.
 */
export const POST = createHandler(
  { permission: 'messages.create', schema: messageSchema },
  async ({ body, user, log }) => {
    // The recipient may be given directly or taken from the linked client.
    let toAddress = body.to_address?.trim() || null;
    let toName = body.to_name?.trim() || null;

    if (body.client_id) {
      const client = findClient(body.client_id);
      if (!client) return badRequest('Client introuvable.');
      toAddress ??= client.email;
      toName ??= client.name;
    }

    if (!toAddress) {
      return badRequest('Aucune adresse destinataire : renseignez-la ou choisissez un client qui en a une.');
    }

    /**
     * A template is expanded here rather than in the browser, so the variables
     * come from the database and not from whatever the form happened to hold.
     */
    let subject = body.subject;
    let text = body.body;

    if (body.template_key) {
      const template = findMessageTemplate(body.template_key);
      if (template) {
        const client = body.client_id ? findClient(body.client_id) : null;
        const project = body.project_id ? findProject(body.project_id) : null;
        const invoice = body.invoice_id ? findInvoice(body.invoice_id) : null;

        const variables: Record<string, string> = {
          client_name: client?.name ?? toName ?? '',
          company: client?.company ?? '',
          project_title: project?.title ?? '',
          invoice_number: invoice?.number ?? '',
          owner_name: config.site.owner,
          site_url: config.site.url,
        };

        // Only fill what the form left untouched: an edited subject wins.
        if (subject === template.subject) subject = renderTemplate(template.subject ?? '', variables);
        if (text === template.body) text = renderTemplate(template.body, variables);
      }
    }

    const result = await sendEmail({
      to: toAddress,
      toName,
      subject,
      text,
      templateKey: body.template_key ?? null,
      clientId: body.client_id ?? null,
      projectId: body.project_id ?? null,
      leadId: body.lead_id ?? null,
      invoiceId: body.invoice_id ?? null,
      createdBy: user.id,
      asDraft: !body.send,
    });

    log({
      action: body.send ? 'send' : 'create',
      entityType: 'message',
      entityId: result.messageId,
      entityLabel: subject,
      summary: body.send
        ? result.ok
          ? `Message envoyé à ${toAddress} : ${subject}`
          : `Échec d’envoi à ${toAddress} : ${subject}`
        : `Brouillon enregistré : ${subject}`,
      metadata: { mode: result.mode, to: toAddress },
    });

    return ok(
      {
        id: result.messageId,
        sent: result.ok && result.mode === 'smtp',
        queued: result.ok && result.mode === 'queued',
        error: result.ok ? undefined : result.error,
        // Said plainly so the interface can explain why nothing left yet.
        mailConfigured: config.mail.enabled,
      },
      result.ok ? 201 : 502,
    );
  },
);
