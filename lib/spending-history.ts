import { addMonths, monthLabel } from "./budget";
import type { Transaction } from "./store";

/** Derive references from the ledger, never from plan or forecast snapshots. */
export function previousMonthSpending(
  transactions: readonly Pick<
    Transaction,
    "date" | "kind" | "categoryId" | "amountCents"
  >[],
  asOf: string,
) {
  const month = addMonths(asOf.slice(0, 7), -1);
  const rows = transactions.filter((row) => row.date.startsWith(`${month}-`));
  const byCategory: Record<string, number> = Object.create(null);
  for (const row of rows)
    if (row.kind === "expense")
      byCategory[row.categoryId] =
        (byCategory[row.categoryId] ?? 0) + row.amountCents;
  return {
    month,
    label: monthLabel(month),
    hasTransactions: rows.length > 0,
    byCategory,
  };
}
export type SpendingHistory = ReturnType<typeof previousMonthSpending>;
