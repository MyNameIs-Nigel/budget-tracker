import { z } from "zod";
import { transactionIdSchema, transactionSnapshotSchema } from "./ledger";
import type { Transaction } from "./store";

export const CATEGORY_BATCH_LIMIT = 200;
export const categoryAssignmentSchema = z
  .object({
    categoryId: z.string().min(1).max(60),
    transactions: z
      .array(
        z.object({
          id: transactionIdSchema,
          expected: transactionSnapshotSchema,
        }),
      )
      .min(1, "Select an expense first.")
      .max(CATEGORY_BATCH_LIMIT, "Assign at most 200 expenses at a time."),
  })
  .refine(
    (value) =>
      new Set(value.transactions.map((row) => row.id)).size ===
      value.transactions.length,
    "Select each transaction only once.",
  );

export type CategoryAssignmentResult = {
  transactions: Transaction[];
  undoToken: string | null;
};
