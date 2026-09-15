import { PageHeader, SummaryStrip } from '@/components/admin/page-kit';
import { SubscriptionManager } from '@/components/admin/subscription-manager';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import {
  FREQUENCIES,
  SUBSCRIPTION_CATEGORIES,
  listSubscriptions,
  monthlyRecurringCost,
  upcomingRenewals,
} from '@/lib/db/repositories/expenses';
import { defaultCurrency } from '@/lib/db/repositories/finance';
import { formatMoney } from '@/lib/i18n/format';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Abonnements' };

export default async function SubscriptionsPage() {
  const user = await requirePermission('subscriptions.view');
  const csrf = (await getCsrfToken()) ?? '';
  const currency = defaultCurrency();

  const subscriptions = listSubscriptions({ status: 'all', limit: 200 });
  const active = subscriptions.filter((subscription) => subscription.status === 'active');
  const monthly = monthlyRecurringCost();
  const renewals = upcomingRenewals(30);

  return (
    <>
      <PageHeader
        title="Abonnements"
        description="Les dépenses qui reviennent : hébergement, logiciels, services d’IA. Le coût mensuel équivalent ramène tous les cycles sur la même base."
      />

      <SummaryStrip
        items={[
          { label: 'Coût mensuel équivalent', value: formatMoney(monthly, currency) },
          { label: 'Sur l’année', value: formatMoney(monthly * 12, currency) },
          { label: 'Actifs', value: active.length },
          { label: 'À renouveler sous 30 j', value: renewals.length },
        ]}
      />

      <div className="mt-5">
        <SubscriptionManager
          csrf={csrf}
          currency={currency}
          categories={SUBSCRIPTION_CATEGORIES.map(({ key, label }) => ({ key, label }))}
          frequencies={FREQUENCIES.map(({ key, label }) => ({ key, label }))}
          canCreate={can(user, 'subscriptions.create')}
          canUpdate={can(user, 'subscriptions.update')}
          canDelete={can(user, 'subscriptions.delete')}
          subscriptions={subscriptions.map((subscription) => ({
            id: subscription.id,
            service_name: subscription.service_name,
            category: subscription.category,
            amount: subscription.amount,
            currency: subscription.currency,
            frequency: subscription.frequency,
            renewal_date: subscription.renewal_date,
            status: subscription.status,
            auto_renew: subscription.auto_renew,
            url: subscription.url,
            notes: subscription.notes,
            is_demo: subscription.is_demo,
            days_until:
              renewals.find((renewal) => renewal.id === subscription.id)?.days_until ?? null,
          }))}
        />
      </div>
    </>
  );
}
