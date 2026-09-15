import { createHandler, ok } from '@/lib/api/handler';
import { subscriptionSchema } from '@/lib/validation/admin';
import {
  createSubscription,
  listSubscriptions,
  monthlyRecurringCost,
  upcomingRenewals,
  updateSubscription,
} from '@/lib/db/repositories/expenses';
import type { SubscriptionRow } from '@/lib/db/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createHandler({ permission: 'subscriptions.view' }, async ({ request }) => {
  const url = new URL(request.url);
  return Response.json({
    ok: true,
    items: listSubscriptions({
      status: (url.searchParams.get('statut') as SubscriptionRow['status'] | 'all') ?? 'all',
      category: url.searchParams.get('categorie') ?? undefined,
      limit: 200,
    }),
    upcoming: upcomingRenewals(30),
    monthlyCost: monthlyRecurringCost(),
  });
});

/**
 * Records a recurring charge.
 *
 * Subscriptions are the spending that is easiest to forget and hardest to notice:
 * they renew quietly. Knowing the monthly equivalent of every cycle in one figure
 * is the point — `monthlyRecurringCost` converts yearly and quarterly onto a
 * common basis so the total means something.
 */
export const POST = createHandler(
  { permission: 'subscriptions.create', schema: subscriptionSchema },
  async ({ body, log }) => {
    const id = createSubscription({
      serviceName: body.service_name,
      category: body.category,
      amount: body.amount,
      currency: body.currency,
      frequency: body.frequency,
      renewalDate: body.renewal_date ?? null,
      autoRenew: body.auto_renew,
      url: body.url ?? null,
      notes: body.notes ?? null,
    });

    // A new subscription is active; anything else is a deliberate choice, so it
    // is applied as a separate step rather than being a creation parameter.
    if (body.status !== 'active') updateSubscription(id, { status: body.status });

    log({
      action: 'create',
      entityType: 'subscription',
      entityId: id,
      entityLabel: body.service_name,
      summary: `Abonnement ajouté : ${body.service_name} — ${body.amount} ${body.currency} / ${body.frequency}`,
    });

    return ok({ id }, 201);
  },
);
