import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { transactions } from "@/db/schema";
import { getPlan } from "./store";
import type { Transaction } from "./store";
import type { Plan } from "./budget";
import { HttpError } from "./http";

export type LedgerTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];

/** All ledger writes serialize per owner, including imports and reconciliation. */
export function withLedgerLock<T>(
  userId: string,
  work: (tx: LedgerTransaction) => Promise<T>,
) {
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${`checking-ledger:${userId}`}, 0))`,
    );
    return work(tx);
  });
}

export function serializeTransaction(
  row: typeof transactions.$inferSelect,
): Transaction {
  return {
    id: row.id,
    date: row.date,
    kind: row.kind,
    categoryId: row.categoryId,
    categoryName: row.categoryName,
    description: row.description,
    amountCents: row.amountCents,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function categoryName(
  userId: string,
  categoryId: string,
  kind: "income" | "expense",
) {
  if (kind === "income") {
    if (categoryId !== "income")
      throw new HttpError(400, "Choose the income category.");
    return "Income";
  }
  const fixed = {
    uncategorized: "Uncategorized",
    bills: "Insurance & bills",
    giving: "Giving",
    debt: "Debt payments",
  };
  if (Object.hasOwn(fixed, categoryId))
    return fixed[categoryId as keyof typeof fixed];
  const p = await getPlan(userId);
  const c = (p.data as Plan).categories.find((c) => c.id === categoryId);
  if (!c) throw new HttpError(400, "Choose a category from your saved budget.");
  return c.name;
}
