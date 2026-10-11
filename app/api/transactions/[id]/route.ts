import { and, eq } from "drizzle-orm";
import { transactions } from "@/db/schema";
import { apiUser, body, handle, HttpError, json, sameOrigin } from "@/lib/http";
import {
  matchesTransactionSnapshot,
  transactionDeleteSchema,
  transactionIdSchema,
  transactionUpdateSchema,
} from "@/lib/ledger";
import {
  categoryName,
  serializeTransaction,
  withLedgerLock,
} from "@/lib/transaction-api";
type Context = { params: Promise<{ id: string }> };
const changedMessage =
  "This transaction changed in another tab. Refresh transactions before trying again.";
export function PATCH(req: Request, ctx: Context) {
  return handle(async () => {
    sameOrigin(req);
    const u = await apiUser();
    const { id } = await ctx.params;
    if (!transactionIdSchema.safeParse(id).success)
      throw new HttpError(404, "Transaction not found.");
    const { expected, ...value } = await body(req, transactionUpdateSchema);
    const t = await withLedgerLock(u.id, async (tx) => {
      const [existing] = await tx
        .select()
        .from(transactions)
        .where(and(eq(transactions.id, id), eq(transactions.userId, u.id)));
      if (!existing) throw new HttpError(404, "Transaction not found.");
      if (!matchesTransactionSnapshot(existing, expected))
        throw new HttpError(409, changedMessage);
      // Editing an amount/date/description must not rewrite a historical label
      // or require a deleted category to exist in today's plan.
      const name =
        existing.categoryId === value.categoryId && existing.kind === value.kind
          ? existing.categoryName
          : await categoryName(u.id, value.categoryId, value.kind, tx);
      const [updated] = await tx
        .update(transactions)
        .set({ ...value, categoryName: name })
        .where(and(eq(transactions.id, id), eq(transactions.userId, u.id)))
        .returning();
      if (!updated) throw new HttpError(404, "Transaction not found.");
      return serializeTransaction(updated);
    });
    return json(t);
  });
}
export function DELETE(req: Request, ctx: Context) {
  return handle(async () => {
    sameOrigin(req);
    const u = await apiUser();
    const { id } = await ctx.params;
    if (!transactionIdSchema.safeParse(id).success)
      throw new HttpError(404, "Transaction not found.");
    const { expected } = await body(req, transactionDeleteSchema);
    const t = await withLedgerLock(u.id, async (tx) => {
      const [existing] = await tx
        .select()
        .from(transactions)
        .where(and(eq(transactions.id, id), eq(transactions.userId, u.id)));
      if (!existing) throw new HttpError(404, "Transaction not found.");
      if (!matchesTransactionSnapshot(existing, expected))
        throw new HttpError(409, changedMessage);
      const [removed] = await tx
        .delete(transactions)
        .where(and(eq(transactions.id, id), eq(transactions.userId, u.id)))
        .returning({ id: transactions.id });
      if (!removed) throw new HttpError(404, "Transaction not found.");
      return removed;
    });
    return json(t);
  });
}
