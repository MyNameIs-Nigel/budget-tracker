import { z } from "zod";
import { dateSchema } from "./budget";

export type CheckingBalance = {
  asOf: string;
  balanceCents: number;
  revision: number;
};

export const checkingBalanceSchema = z.object({
  asOf: dateSchema,
  balanceCents: z.number().int().min(-100_000_000).max(100_000_000),
  revision: z.number().int().min(0).nullable(),
  mode: z.enum(["opening", "closing"]).optional(),
});

type BalanceTransaction = {
  id: string;
  date: string;
  kind: "income" | "expense";
  amountCents: number;
  createdAt: string;
};

export const signedAmount = (
  transaction: Pick<BalanceTransaction, "kind" | "amountCents">,
) =>
  transaction.kind === "income"
    ? transaction.amountCents
    : -transaction.amountCents;

export function transactionOrder(a: BalanceTransaction, b: BalanceTransaction) {
  return (
    a.date.localeCompare(b.date) ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

/** The checkpoint is the opening balance on asOf; same-day activity contributes. */
export function runningBalances(
  transactions: readonly BalanceTransaction[],
  checkpoint: CheckingBalance | null,
  today: string,
) {
  const balances: Record<string, number> = {};
  const projected: Record<string, boolean> = {};
  if (!checkpoint) return { currentBalanceCents: null, balances, projected };

  let balance =
    checkpoint.balanceCents -
    transactions
      .filter((t) => t.date < checkpoint.asOf)
      .reduce((sum, t) => sum + signedAmount(t), 0);
  for (const t of [...transactions].sort(transactionOrder)) {
    balance += signedAmount(t);
    balances[t.id] = balance;
    projected[t.id] = t.date > today;
  }
  const currentBalanceCents =
    checkpoint.balanceCents +
    transactions
      .filter((t) => t.date >= checkpoint.asOf && t.date <= today)
      .reduce((sum, t) => sum + signedAmount(t), 0);
  return { currentBalanceCents, balances, projected };
}
