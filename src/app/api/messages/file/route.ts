import { createHandler, ok } from '@/lib/api/handler';
import { listQueuedMessages } from '@/lib/db/repositories/comms';
import { flushQueue } from '@/lib/mail/send';
import { config } from '@/lib/config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * The outbox.
 *
 * Messages composed while SMTP was not configured — or that failed on a transient
 * error — sit queued rather than being lost. This retries them, so setting up
 * mail later does not mean re-typing anything.
 */
export const GET = createHandler({ permission: 'messages.view' }, async () =>
  Response.json({
    ok: true,
    items: listQueuedMessages(100),
    mailConfigured: config.mail.enabled,
  }),
);

export const POST = createHandler({ permission: 'messages.create' }, async ({ log }) => {
  const pending = listQueuedMessages(100).length;

  if (!config.mail.enabled) {
    return ok({
      sent: 0,
      failed: 0,
      skipped: pending,
      mailConfigured: false,
      reason:
        'Aucun serveur SMTP n’est configuré : les messages restent en attente. Renseignez les paramètres d’envoi pour les expédier.',
    });
  }

  const result = await flushQueue(50);

  log({
    action: 'send',
    entityType: 'message',
    summary: `File d’envoi traitée : ${result.sent} envoyé${result.sent === 1 ? '' : 's'}, ${result.failed} en échec`,
    metadata: result,
  });

  return ok({ ...result, mailConfigured: true });
});
