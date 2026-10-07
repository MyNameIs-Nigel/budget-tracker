import { db } from "@/db/client";
import { transactions } from "@/db/schema";
import { apiUser, body, handle, json, sameOrigin } from "@/lib/http";
import { transactionSchema } from "@/lib/ledger";
import { getTransactions } from "@/lib/store";
import { categoryName } from "@/lib/transaction-api";
export function GET() {
  return handle(async () => json(await getTransactions((await apiUser()).id)));
}
export function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const u = await apiUser();
    const input = await body(req, transactionSchema);
    const name = await categoryName(u.id, input.categoryId, input.kind);
    const [t] = await db
      .insert(transactions)
      .values({ ...input, categoryName: name, userId: u.id })
      .returning();
    return json(t, 201);
  });
}
