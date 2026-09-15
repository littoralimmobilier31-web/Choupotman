import { PageHeader, SummaryStrip } from '@/components/admin/page-kit';
import { AutomationManager } from '@/components/admin/automation-manager';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import {
  getAutomationStats,
  lastDailyRun,
  listAutomations,
  listRuns,
} from '@/lib/db/repositories/automations';
import { describeAutomation } from '@/lib/automation/engine';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Automatisations' };

export default async function AutomationsPage() {
  const user = await requirePermission('automations.view');
  const csrf = (await getCsrfToken()) ?? '';

  const automations = listAutomations();
  const stats = getAutomationStats();
  const runs = listRuns({ limit: 40 });
  const daily = lastDailyRun();

  return (
    <>
      <PageHeader
        title="Automatisations"
        description="Les règles que la plateforme applique toute seule. Chaque règle se lit « SI … ALORS … », et chacune peut être désactivée."
      />

      <SummaryStrip
        items={[
          { label: 'Règles actives', value: automations.filter((rule) => rule.is_enabled === 1).length },
          { label: 'Désactivées', value: automations.filter((rule) => rule.is_enabled === 0).length },
          { label: 'Actions (30 j)', value: stats.actionsLast30Days },
          {
            label: 'Dernier balayage',
            value: daily ? daily.slice(0, 10) : 'jamais',
          },
        ]}
      />

      <div className="mt-5">
        <AutomationManager
          csrf={csrf}
          canUpdate={can(user, 'automations.update')}
          lastDailyRun={daily}
          runs={runs.map((run) => ({
            id: run.id,
            automation_key: run.automation_key,
            trigger_key: run.trigger_key,
            status: run.status,
            actions_count: run.actions_count,
            summary: run.summary,
            error: run.error,
            duration_ms: run.duration_ms,
            created_at: run.created_at,
          }))}
          automations={automations.map((rule) => {
            const described = describeAutomation(rule.key);
            return {
              id: rule.id,
              key: rule.key,
              name: rule.name,
              description: rule.description,
              trigger_type: rule.trigger_type,
              trigger_key: rule.trigger_key,
              is_enabled: rule.is_enabled,
              last_run_at: rule.last_run_at,
              run_count: rule.run_count,
              condition: described?.condition ?? rule.trigger_key,
              effects: described?.effects ?? [],
            };
          })}
        />
      </div>
    </>
  );
}
