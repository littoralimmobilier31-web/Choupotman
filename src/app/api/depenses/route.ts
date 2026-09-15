import { createHandler, list, ok, badRequest } from '@/lib/api/handler';
import { expenseSchema } from '@/lib/validation/admin';
import {
  createExpense,
  expensesByCategory,
  listExpenses,
  totalExpenses,
} from '@/lib/db/repositories/expenses';
import { findFile } from '@/lib/db/repositories/files';
import type { ExpenseCategory } from '@/lib/db/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = createHandler({ permission: 'expenses.view' }, async ({ request }) => {
  const url = new URL(request.url);
  const range = {
    from: url.searchParams.get('du') ?? undefined,
    to: url.searchParams.get('au') ?? undefined,
  };

  return Response.json({
    ok: true,
    items: listExpenses({
      ...range,
      category: (url.searchParams.get('categorie') as ExpenseCategory) || undefined,
      projectId: Number(url.searchParams.get('projet')) || undefined,
      search: url.searchParams.get('q') ?? undefined,
      limit: 300,
    }),
    total: totalExpenses(range),
    byCategory: expensesByCategory(range),
  });
});

export const POST = createHandler(
  { permission: 'expenses.create', schema: expenseSchema },
  async ({ body, user, log }) => {
    // A receipt is a file from the library; a dangling id would show as a broken
    // link on the expense for as long as nobody noticed.
    if (body.receipt_file_id && !findFile(body.receipt_file_id)) {
      return badRequest('Justificatif introuvable dans la bibliothèque.');
    }

    const id = createExpense({
      label: body.label,
      category: body.category,
      amount: body.amount,
      currency: body.currency,
      spentAt: body.spent_at ?? undefined,
      supplier: body.supplier ?? null,
      projectId: body.project_id ?? null,
      receiptFileId: body.receipt_file_id ?? null,
      isRecurring: body.is_recurring,
      notes: body.notes ?? null,
      createdBy: user.id,
    });

    log({
      action: 'create',
      entityType: 'expense',
      entityId: id,
      entityLabel: body.label,
      summary: `Dépense enregistrée : ${body.label} — ${body.amount} ${body.currency}`,
      metadata: { category: body.category, amount: body.amount },
    });

    return ok({ id }, 201);
  },
);
