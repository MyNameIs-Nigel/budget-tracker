import { createHash } from "node:crypto";
import { and, desc, eq, or } from "drizzle-orm";
import { transactions } from "@/db/schema";
import { apiUser, body, handle, HttpError, json, sameOrigin } from "@/lib/http";
import {
  duplicateKey,
  findImportDuplicates,
  ImportConflictError,
  importTransactionsSchema,
  planTransactionImport,
} from "@/lib/import-transactions";
import {
  categoryName,
  serializeTransaction,
  withLedgerLock,
} from "@/lib/transaction-api";

export function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const u = await apiUser();
    const input = await body(req, importTransactionsSchema);
    const names = new Map<string, Promise<string>>();
    const rows = await Promise.all(
      input.rows.map(async (row) => {
        const key = `${row.kind}:${row.categoryId}`;
        if (!names.has(key))
          names.set(key, categoryName(u.id, row.categoryId, row.kind));
        return { ...row, categoryName: await names.get(key)! };
      }),
    );
    try {
      const result = await withLedgerLock(u.id, async (tx) => {
        const keys = [
          ...new Map(rows.map((row) => [duplicateKey(row), row])).values(),
        ];
        const matching = await tx
          .select()
          .from(transactions)
          .where(
            and(
              eq(transactions.userId, u.id),
              or(
                ...keys.map((row) =>
                  and(
                    eq(transactions.date, row.date),
                    eq(transactions.kind, row.kind),
                    eq(transactions.amountCents, row.amountCents),
                  ),
                ),
              ),
            ),
          );
        const existing = matching.map(serializeTransaction);
        const preview = findImportDuplicates(rows, existing);
        const reviewToken = createHash("sha256")
          .update(
            JSON.stringify({
              userId: u.id,
              rows,
              duplicates: preview.duplicates,
            }),
          )
          .digest("hex");
        if (!input.commit) return { ...preview, reviewToken };
        if (input.reviewToken !== reviewToken) throw new ImportConflictError();
        const plan = planTransactionImport(rows, existing, input.decisions);
        if (plan.inserts.length)
          await tx.insert(transactions).values(
            plan.inserts.map((row) => ({
              userId: u.id,
              date: row.date,
              kind: row.kind,
              categoryId: row.categoryId,
              categoryName: row.categoryName,
              description: row.description,
              amountCents: row.amountCents,
            })),
          );
        for (const { targetId, row } of plan.updates) {
          await tx
            .update(transactions)
            .set({
              date: row.date,
              kind: row.kind,
              categoryId: row.categoryId,
              categoryName: row.categoryName,
              description: row.description,
              amountCents: row.amountCents,
            })
            .where(
              and(eq(transactions.id, targetId), eq(transactions.userId, u.id)),
            );
        }
        const all = await tx
          .select()
          .from(transactions)
          .where(eq(transactions.userId, u.id))
          .orderBy(
            desc(transactions.date),
            desc(transactions.createdAt),
            desc(transactions.id),
          );
        return {
          transactions: all.map(serializeTransaction),
          added: plan.added,
          updated: plan.updated,
          skipped: plan.skipped,
        };
      });
      return json(result);
    } catch (error) {
      if (error instanceof ImportConflictError)
        throw new HttpError(409, error.message);
      throw error;
    }
  });
}
