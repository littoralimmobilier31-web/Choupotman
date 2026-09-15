import { createHandler, ok, badRequest, notFound, parseId } from '@/lib/api/handler';
import { expenseSchema, patchOf } from '@/lib/validation/admin';
import { deleteExpense, findExpense, updateExpense } from '@/lib/db/repositories/expenses';
import { findFile } from '@/lib/db/repositories/files';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler(
    { permission: 'expenses.update', schema: patchOf(expenseSchema) },
    async ({ body, log }) => {
      const before = findExpense(id);
      if (!before) return notFound('Dépense introuvable.');

      if (body.receipt_file_id && !findFile(body.receipt_file_id)) {
        return badRequest('Justificatif introuvable dans la bibliothèque.');
      }

      updateExpense(id, {
        label: body.label,
        category: body.category,
        amount: body.amount,
        currency: body.currency,
        spent_at: body.spent_at ?? undefined,
        supplier: body.supplier,
        project_id: body.project_id,
        receipt_file_id: body.receipt_file_id,
        notes: body.notes,
      });

      log({
        action: 'update',
        entityType: 'expense',
        entityId: id,
        entityLabel: body.label ?? before.label,
        summary: `Dépense modifiée : ${body.label ?? before.label}`,
        // An amount change moves the accounts, so record both values.
        metadata:
          body.amount !== undefined && body.amount !== before.amount
            ? { amountBefore: before.amount, amountAfter: body.amount }
            : undefined,
      });

      return ok({ id, expense: findExpense(id) });
    },
  )(request);
}

export async function DELETE(request: Request, context: Params): Promise<Response> {
  const id = parseId((await context.params).id);
  if (id === null) return badRequest('Identifiant invalide.');

  return createHandler({ permission: 'expenses.delete' }, async ({ log }) => {
    const expense = findExpense(id);
    if (!expense) return notFound('Dépense introuvable.');

    // The receipt file stays in the library: it may be a shared invoice covering
    // several lines, and the library is where files are managed.
    deleteExpense(id);
    log({
      action: 'delete',
      entityType: 'expense',
      entityId: id,
      entityLabel: expense.label,
      summary: `Dépense supprimée : ${expense.label} — ${expense.amount} ${expense.currency}`,
      metadata: { amount: expense.amount, category: expense.category },
    });

    return ok({ deleted: true });
  })(request);
}
