import type { Plan } from "./budget";

/** Built-in spending categories shared by the ledger UI and the API. */
export const fixedExpenseCategories: Record<
  "uncategorized" | "bills" | "giving" | "debt",
  string
> = {
  uncategorized: "Uncategorized",
  bills: "Insurance & bills",
  giving: "Giving",
  debt: "Debt payments",
};

/** Spending categories that can be assigned today, in display order. */
export function expenseCategories(plan: Pick<Plan, "categories">) {
  const fixed = fixedExpenseCategories;
  return [
    { id: "uncategorized", name: fixed.uncategorized },
    ...plan.categories.map(({ id, name }) => ({ id, name })),
    { id: "bills", name: fixed.bills },
    { id: "giving", name: fixed.giving },
    { id: "debt", name: fixed.debt },
  ];
}
