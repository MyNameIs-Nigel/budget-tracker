import { and, eq, getTableColumns, inArray, sql } from "drizzle-orm";
import { transactions } from "@/db/schema";
import { categoryAssignmentSchema } from "@/lib/category-assignment";
import {
  categoryUndoSchema,
  createCategoryUndo,
  readCategoryUndo,
} from "@/lib/category-undo";
import { apiUser, body, handle, HttpError, json, sameOrigin } from "@/lib/http";
import { matchesTransactionSnapshot } from "@/lib/ledger";
import {
  categoryName,
  serializeTransaction,
  withLedgerLock,
  type LedgerTransaction,
} from "@/lib/transaction-api";

// xmin changes on every write, so it detects rows that changed and returned.
const versioned = {
  ...getTableColumns(transactions),
  version: sql<string>`xmin::text`,
};

const conflict =
  "These transactions changed in another tab. Refresh transactions and review your selection before trying again.";

async function checkedRows(
  tx: LedgerTransaction,
  userId: string,
  input: {
    id: string;
    expected: Parameters<typeof matchesTransactionSnapshot>[1];
    version?: string;
  }[],
) {
  const rows = await tx
    .select(versioned)
    .from(transactions)
    .where(
      and(
        eq(transactions.userId, userId),
        inArray(
          transactions.id,
          input.map((row) => row.id),
        ),
      ),
    );
  const byId = new Map(rows.map((row) => [row.id, row]));
  return input.map(({ id, expected, version }) => {
    const row = byId.get(id);
    if (!row) throw new HttpError(404, "Transaction not found.");
    if (
      !matchesTransactionSnapshot(row, expected) ||
      (version !== undefined && row.version !== version)
    )
      throw new HttpError(409, conflict);
    if (row.kind !== "expense")
      throw new HttpError(400, "Only expenses have spending categories.");
    return row;
  });
}

export function PATCH(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const user = await apiUser();
    const input = await body(req, categoryAssignmentSchema);
    const result = await withLedgerLock(user.id, async (tx) => {
      const rows = await checkedRows(tx, user.id, input.transactions);
      const name = await categoryName(user.id, input.categoryId, "expense", tx);
      // Selecting the same identity preserves its historical name.
      const changed = rows.filter((row) => row.categoryId !== input.categoryId);
      if (!changed.length)
        return {
          transactions: rows.map(serializeTransaction),
          undoToken: null,
        };
      const updated = await tx
        .update(transactions)
        .set({ categoryId: input.categoryId, categoryName: name })
        .where(
          and(
            eq(transactions.userId, user.id),
            inArray(
              transactions.id,
              changed.map((row) => row.id),
            ),
          ),
        )
        .returning(versioned);
      const before = new Map(changed.map((row) => [row.id, row]));
      const undoToken = createCategoryUndo(
        user.id,
        updated.map((row) => ({
          id: row.id,
          before: {
            categoryId: before.get(row.id)!.categoryId,
            categoryName: before.get(row.id)!.categoryName,
          },
          expected: serializeTransaction(row),
          version: row.version,
        })),
      );
      if (undoToken.length > 180_000)
        throw new HttpError(
          413,
          "This selection is too large. Choose fewer expenses and try again.",
        );
      return { transactions: updated.map(serializeTransaction), undoToken };
    });
    return json(result);
  });
}

export function POST(req: Request) {
  return handle(async () => {
    sameOrigin(req);
    const user = await apiUser();
    const { undoToken } = await body(req, categoryUndoSchema);
    const changes = readCategoryUndo(undoToken, user.id);
    if (!changes)
      throw new HttpError(
        400,
        "Undo expired or is invalid. You can assign categories again.",
      );
    const updated = await withLedgerLock(user.id, async (tx) => {
      await checkedRows(tx, user.id, changes);
      const groups = new Map<
        string,
        { before: (typeof changes)[number]["before"]; ids: string[] }
      >();
      for (const { id, before } of changes) {
        const key = JSON.stringify([before.categoryId, before.categoryName]);
        const group = groups.get(key) ?? { before, ids: [] };
        group.ids.push(id);
        groups.set(key, group);
      }
      const restored = [];
      for (const { before, ids } of groups.values())
        // Only a server-signed receipt can restore a removed category or old name.
        restored.push(
          ...(await tx
            .update(transactions)
            .set(before)
            .where(
              and(
                eq(transactions.userId, user.id),
                inArray(transactions.id, ids),
              ),
            )
            .returning()),
        );
      return restored.map(serializeTransaction);
    });
    return json({ transactions: updated, undoToken: null });
  });
}
