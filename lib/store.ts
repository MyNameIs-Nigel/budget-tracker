import "server-only";
import { eq, desc } from "drizzle-orm";
import { db } from "@/db/client";
import { plans, transactions } from "@/db/schema";
import { emptyPlan } from "./budget";

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
  return db
    .select({
      id: transactions.id,
      date: transactions.date,
      kind: transactions.kind,
      categoryId: transactions.categoryId,
      categoryName: transactions.categoryName,
      description: transactions.description,
      amountCents: transactions.amountCents,
    })
    .from(transactions)
    .where(eq(transactions.userId, userId))
    .orderBy(desc(transactions.date), desc(transactions.createdAt));
}
export type Transaction = Awaited<ReturnType<typeof getTransactions>>[number];
