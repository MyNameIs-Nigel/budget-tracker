import "server-only";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { checkingBalances, plans, transactions } from "@/db/schema";
import { emptyPlan } from "./budget";
import type { CheckingBalance } from "./checking";

export async function getPlan(userId: string) {
  const [existing] = await db
    .select()
    .from(plans)
    .where(eq(plans.userId, userId));
  if (existing) return existing;
  await db
    .insert(plans)
    .values({ userId, data: emptyPlan() })
    .onConflictDoNothing();
  const [created] = await db
    .select()
    .from(plans)
    .where(eq(plans.userId, userId));
  return created;
}
export async function getTransactions(userId: string) {
  const rows = await db
    .select({
      id: transactions.id,
      date: transactions.date,
      kind: transactions.kind,
      categoryId: transactions.categoryId,
      categoryName: transactions.categoryName,
      description: transactions.description,
      amountCents: transactions.amountCents,
      createdAt: transactions.createdAt,
    })
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(
      desc(transactions.date),
      desc(transactions.createdAt),
      desc(transactions.id),
    );
  return rows.map((row) => ({
    ...row,
    createdAt: row.createdAt.toISOString(),
  }));
}
export type Transaction = Awaited<ReturnType<typeof getTransactions>>[number];

export async function getCheckingBalance(
  userId: string,
): Promise<CheckingBalance | null> {
  const [balance] = await db
    .select({
      asOf: checkingBalances.asOf,
      balanceCents: checkingBalances.balanceCents,
      revision: checkingBalances.revision,
    })
    .from(checkingBalances)
    .where(eq(checkingBalances.userId, userId));
  return balance ?? null;
}
