import { z } from 'zod';
import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { subscriptionSchema, patchOf } from '@/lib/validation/admin';
import {
  deleteSubscription,
  findSubscription,
  rollRenewal,
  updateSubscription,
} from '@/lib/db/repositories/expenses';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const patchSchema = patchOf(subscriptionSchema).extend({
  /** Move the renewal date forward one cycle and record the charge. */
  roll: z.boolean().optional(),
});

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'subscriptions.update', schema: patchSchema },
    async ({ body, log }) => {
      const before = findSubscription(id);
      if (!before) return notFound('Abonnement introuvable.');

      if (body.roll) {
        /**
         * Rolling forward also writes the charge as an expense, so recurring
         * spend reaches the P&L without anyone re-typing it every month. It is a
         * no-op when the renewal is still in the future or auto-renew is off —
         * the repository decides, and says which happened.
         */
        const result = rollRenewal(id);
        if (!result.rolled) {
          return badRequest(
            'Ce renouvellement ne peut pas être avancé : vérifiez que l’abonnement est actif, en renouvellement automatique, et que la date est atteinte.',
          );
        }

        log({
          action: 'payment',
          entityType: 'subscription',
          entityId: id,
          entityLabel: before.service_name,
          summary: `Renouvellement enregistré : ${before.service_name} — ${before.amount} ${before.currency}`,
          metadata: { expenseId: result.expenseId },
        });

        return ok({ id, rolled: true, expenseId: result.expenseId, subscription: findSubscription(id) });
      }

      updateSubscription(id, {
        service_name: body.service_name,
        category: body.category,
        amount: body.amount,
        currency: body.currency,
        frequency: body.frequency,
        renewal_date: body.renewal_date,
        status: body.status,
        auto_renew: body.auto_renew,
        url: body.url,
        notes: body.notes,
      });

      log({
        action: body.status !== undefined && body.status !== before.status ? 'status_change' : 'update',
        entityType: 'subscription',
        entityId: id,
        entityLabel: body.service_name ?? before.service_name,
        summary:
          body.status !== undefined && body.status !== before.status
            ? `Abonnement ${body.service_name ?? before.service_name} : ${before.status} → ${body.status}`
            : `Abonnement modifié : ${body.service_name ?? before.service_name}`,
      });

      return ok({ id, subscription: findSubscription(id) });
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'subscriptions.delete' }, async ({ request: req, log }) => {
    const subscription = findSubscription(id);
    if (!subscription) return notFound('Abonnement introuvable.');

    /**
     * Cancelling is usually what was meant, and it keeps the history of what was
     * paid. Deleting the row removes the subscription but never the expenses it
     * already produced — those are accounting records.
     */
    const force = new URL(req.url).searchParams.get('force') === '1';
    if (!force && subscription.status !== 'cancelled') {
      updateSubscription(id, { status: 'cancelled', auto_renew: false });
      log({
        action: 'status_change',
        entityType: 'subscription',
        entityId: id,
        entityLabel: subscription.service_name,
        summary: `Abonnement résilié : ${subscription.service_name}`,
      });
      return ok({
        cancelled: true,
        reason:
          'L’abonnement a été résilié et son renouvellement automatique désactivé. Les dépenses déjà enregistrées sont conservées.',
      });
    }

    deleteSubscription(id);
    log({
      action: 'delete',
      entityType: 'subscription',
      entityId: id,
      entityLabel: subscription.service_name,
      summary: `Abonnement supprimé : ${subscription.service_name}`,
    });

    return ok({ deleted: true });
  })(request);
}
