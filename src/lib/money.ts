/**
 * Money arithmetic.
 *
 * Amounts are stored as SQLite REAL in the row's own currency. Every
 * computation rounds through `money()` so a stored total is always exactly two
 * decimals and never accumulates binary-float drift. Realistic invoice values
 * are far below 2^53, so double precision is exact for the additions we do.
 *
 * Totals are *written* to the row (not recomputed on read) so a historical
 * document keeps the numbers it was issued with even if prices or tax rates
 * change later. `recalcLineTotals` is the single place those numbers come from.
 */

import type { DiscountType, LineItemRow } from '@/lib/db/types';

/** Rounds to 2 decimals, half-up, immune to 1.005 → 1.00 float artefacts. */
export function money(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type LineInput = {
  quantity?: number | null;
  unit_price?: number | null;
  /** Percentage discount applied to this line only. */
  discount?: number | null;
};

/** quantity × unit price, minus the line's own percentage discount. */
export function lineTotal(line: LineInput): number {
  const qty = Number(line.quantity ?? 0);
  const price = Number(line.unit_price ?? 0);
  const discount = Math.min(100, Math.max(0, Number(line.discount ?? 0)));
  return money(qty * price * (1 - discount / 100));
}

export type DocumentTotals = {
  subtotal: number;
  discount_total: number;
  taxable_base: number;
  tax_total: number;
  total: number;
};

/**
 * Document-level totals.
 *
 * Order of operations matters and is fixed here once: line discounts first,
 * then the document discount, then VAT on the discounted base. Applying VAT
 * before the discount would over-charge tax.
 */
export function computeTotals(
  lines: LineInput[],
  options: { discountType?: DiscountType; discountValue?: number; taxRate?: number } = {},
): DocumentTotals {
  const subtotal = money(lines.reduce((acc, line) => acc + lineTotal(line), 0));

  const discountType = options.discountType ?? 'none';
  const discountValue = Number(options.discountValue ?? 0);
  let discountTotal = 0;
  if (discountType === 'percent') {
    discountTotal = money(subtotal * (Math.min(100, Math.max(0, discountValue)) / 100));
  } else if (discountType === 'amount') {
    discountTotal = money(Math.min(subtotal, Math.max(0, discountValue)));
  }

  const taxableBase = money(subtotal - discountTotal);
  const taxRate = Math.max(0, Number(options.taxRate ?? 0));
  const taxTotal = money(taxableBase * (taxRate / 100));

  return {
    subtotal,
    discount_total: discountTotal,
    taxable_base: taxableBase,
    tax_total: taxTotal,
    total: money(taxableBase + taxTotal),
  };
}

/** Fills `line_total` on each row, for persisting alongside the document. */
export function recalcLineTotals<T extends LineInput>(lines: T[]): (T & { line_total: number })[] {
  return lines.map((line) => ({ ...line, line_total: lineTotal(line) }));
}

/** Remaining balance, floored at zero — an over-payment is not a negative due. */
export function balanceDue(total: number, amountPaid: number): number {
  return money(Math.max(0, money(total) - money(amountPaid)));
}

/** Monthly-equivalent cost, so subscriptions on different cycles are comparable. */
export function monthlyEquivalent(amount: number, frequency: string): number {
  switch (frequency) {
    case 'yearly':
      return money(amount / 12);
    case 'quarterly':
      return money(amount / 3);
    case 'one_time':
      return 0;
    default:
      return money(amount);
  }
}

export type LineLike = Pick<LineItemRow, 'quantity' | 'unit_price' | 'discount'>;
