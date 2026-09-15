import { PageHeader, SummaryStrip } from '@/components/admin/page-kit';
import { ExpenseManager } from '@/components/admin/expense-manager';
import { ListFilters } from '@/components/admin/list-filters';
import { requirePermission } from '@/lib/auth/guard';
import { can } from '@/lib/auth/permissions';
import { getCsrfToken } from '@/lib/auth/csrf';
import {
  EXPENSE_CATEGORIES,
  expensesByCategory,
  listExpenses,
  totalExpenses,
} from '@/lib/db/repositories/expenses';
import { defaultCurrency } from '@/lib/db/repositories/finance';
import { projectOptions } from '@/lib/db/repositories/projects';
import { formatMoney } from '@/lib/i18n/format';
import type { ExpenseCategory } from '@/lib/db/types';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Dépenses' };

export default async function ExpensesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; categorie?: string; projet?: string; du?: string; au?: string }>;
}) {
  const user = await requirePermission('expenses.view');
  const query = await searchParams;
  const csrf = (await getCsrfToken()) ?? '';

  const range = { from: query.du || undefined, to: query.au || undefined };
  const currency = defaultCurrency();

  const expenses = listExpenses({
    ...range,
    category: (query.categorie as ExpenseCategory) || undefined,
    projectId: Number.parseInt(query.projet ?? '', 10) || undefined,
    search: query.q?.trim() || undefined,
    limit: 300,
  });

  const byCategory = expensesByCategory(range);
  const thisYear = new Date().getFullYear();
  const yearTotal = totalExpenses({ from: `${thisYear}-01-01`, to: `${thisYear}-12-31` });
  const thisMonth = new Date().toISOString().slice(0, 7);
  const monthTotal = totalExpenses({ from: `${thisMonth}-01`, to: `${thisMonth}-31` });

  return (
    <>
      <PageHeader
        title="Dépenses"
        description="Les charges de l’activité : logiciels, hébergement, matériel, sous-traitance. Elles alimentent le résultat affiché dans les statistiques."
      />

      <SummaryStrip
        items={[
          { label: 'Ce mois', value: formatMoney(monthTotal, currency) },
          { label: `Année ${thisYear}`, value: formatMoney(yearTotal, currency) },
          { label: 'Sur la période affichée', value: formatMoney(totalExpenses(range), currency) },
          { label: 'Lignes', value: expenses.length },
        ]}
      />

      <ListFilters
        searchPlaceholder="Libellé, fournisseur…"
        resultCount={expenses.length}
        selects={[
          {
            key: 'categorie',
            label: 'Catégorie',
            allLabel: 'Toutes les catégories',
            options: EXPENSE_CATEGORIES.map(({ key, label }) => ({ value: key, label })),
          },
        ]}
      />

      <div className="mt-5">
        <ExpenseManager
          csrf={csrf}
          currency={currency}
          categories={EXPENSE_CATEGORIES.map(({ key, label }) => ({ key, label }))}
          byCategory={byCategory.map((entry) => ({
            category: entry.category,
            label: entry.label,
            total: entry.total,
            count: entry.count,
          }))}
          projects={projectOptions().map((project) => ({ value: String(project.id), label: project.label }))}
          canCreate={can(user, 'expenses.create')}
          canUpdate={can(user, 'expenses.update')}
          canDelete={can(user, 'expenses.delete')}
          expenses={expenses.map((expense) => ({
            id: expense.id,
            label: expense.label,
            category: expense.category,
            amount: expense.amount,
            currency: expense.currency,
            spent_at: expense.spent_at,
            supplier: expense.supplier,
            project_id: expense.project_id,
            project_title: expense.project_title,
            receipt_file_id: expense.receipt_file_id,
            receipt_name: expense.receipt_name,
            is_recurring: expense.is_recurring,
            is_demo: expense.is_demo,
            notes: expense.notes,
          }))}
        />
      </div>
    </>
  );
}
