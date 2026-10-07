import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { transactions } from "@/db/schema";
import { apiUser, body, handle, HttpError, json, sameOrigin } from "@/lib/http";
import { transactionSchema } from "@/lib/ledger";
import { categoryName } from "@/lib/transaction-api";
type Context = { params: Promise<{ id: string }> };
export function PATCH(req: Request, ctx: Context) {
  return handle(async () => {
    sameOrigin(req);
    const u = await apiUser();
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id))
      throw new HttpError(404, "Transaction not found.");
    const value = await body(req, transactionSchema);
    const name = await categoryName(u.id, value.categoryId, value.kind);
    const [t] = await db
      .update(transactions)
      .set({ ...value, categoryName: name })
      .where(and(eq(transactions.id, id), eq(transactions.userId, u.id)))
      .returning();
    if (!t) throw new HttpError(404, "Transaction not found.");
    return json(t);
  });
}
export function DELETE(req: Request, ctx: Context) {
  return handle(async () => {
    sameOrigin(req);
    const u = await apiUser();
    const { id } = await ctx.params;
    if (!/^[0-9a-f-]{36}$/i.test(id))
      throw new HttpError(404, "Transaction not found.");
    const [t] = await db
      .delete(transactions)
      .where(and(eq(transactions.id, id), eq(transactions.userId, u.id)))
      .returning({ id: transactions.id });
    if (!t) throw new HttpError(404, "Transaction not found.");
    return json(t);
  });
}
