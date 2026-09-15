import { z } from 'zod';
import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { deleteMessage, findMessage, updateMessage } from '@/lib/db/repositories/comms';
import { sendEmail } from '@/lib/mail/send';
import { config } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = z.object({
  csrf: z.string().optional(),
  subject: z.string().trim().max(300).optional(),
  body: z.string().trim().max(20000).optional(),
  to_address: z.union([z.string().trim().email('Adresse email invalide.'), z.literal('')]).nullable().optional(),
  /** Attempt delivery of this draft now. */
  send: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'messages.view' }, async () => {
    const message = findMessage(id);
    if (!message) return notFound('Message introuvable.');
    return Response.json({ ok: true, message });
  })(request);
}

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'messages.update', schema: patchSchema },
    async ({ body, user, log }) => {
      const message = findMessage(id);
      if (!message) return notFound('Message introuvable.');

      /**
       * A message that has left cannot be rewritten. Editing a sent message
       * would make the outbox a record of what we wish we had written rather
       * than of what the client received.
       */
      if (message.status === 'sent' && (body.subject !== undefined || body.body !== undefined)) {
        return Response.json(
          { error: 'Ce message a déjà été envoyé et ne peut plus être modifié.' },
          { status: 409 },
        );
      }

      updateMessage(id, {
        subject: body.subject,
        body: body.body,
        toAddress: body.to_address,
      });

      if (body.send) {
        const fresh = findMessage(id);
        const to = (body.to_address ?? fresh?.to_address ?? '').trim();
        if (!to) return badRequest('Aucune adresse destinataire.');

        // Re-sending creates a new message row via `sendEmail` (it owns the
        // record-then-deliver order), and this draft is removed so the outbox
        // does not show the same text twice.
        const result = await sendEmail({
          to,
          toName: fresh?.to_name ?? null,
          subject: body.subject ?? fresh?.subject ?? '',
          text: body.body ?? fresh?.body ?? '',
          templateKey: fresh?.template_key ?? null,
          clientId: fresh?.client_id ?? null,
          projectId: fresh?.project_id ?? null,
          leadId: fresh?.lead_id ?? null,
          invoiceId: fresh?.invoice_id ?? null,
          createdBy: user.id,
        });

        if (message.status === 'draft') deleteMessage(id);

        log({
          action: 'send',
          entityType: 'message',
          entityId: result.messageId,
          entityLabel: body.subject ?? message.subject ?? '',
          summary: result.ok
            ? `Message envoyé à ${to}`
            : `Échec d’envoi à ${to} : ${result.error}`,
        });

        return ok(
          {
            id: result.messageId,
            sent: result.ok && result.mode === 'smtp',
            queued: result.ok && result.mode === 'queued',
            error: result.ok ? undefined : result.error,
            mailConfigured: config.mail.enabled,
          },
          result.ok ? 200 : 502,
        );
      }

      log({
        action: 'update',
        entityType: 'message',
        entityId: id,
        entityLabel: body.subject ?? message.subject ?? '',
        summary: `Brouillon modifié : ${body.subject ?? message.subject ?? '(sans objet)'}`,
      });

      return ok({ id, message: findMessage(id) });
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'messages.update' }, async ({ log }) => {
    const message = findMessage(id);
    if (!message) return notFound('Message introuvable.');

    /**
     * Sent messages are the record of what a client actually received, so they
     * are kept. Drafts, queued and failed messages can be discarded.
     */
    if (message.status === 'sent') {
      return Response.json(
        {
          error: 'Un message envoyé est conservé comme trace de ce que le client a reçu.',
          reason: 'Seuls les brouillons, les messages en attente et les échecs peuvent être supprimés.',
        },
        { status: 409 },
      );
    }

    deleteMessage(id);
    log({
      action: 'delete',
      entityType: 'message',
      entityId: id,
      entityLabel: message.subject ?? '',
      summary: `Message supprimé (${message.status}) : ${message.subject ?? '(sans objet)'}`,
    });

    return ok({ deleted: true });
  })(request);
}
