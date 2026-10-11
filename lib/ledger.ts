import { z } from "zod";
import { dateSchema } from "./budget";
// Match PostgreSQL's canonical UUID shape before issuing a query.
export const transactionIdSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
export const transactionSchema = z.object({
  date: dateSchema,
  kind: z.enum(["income", "expense"]),
  categoryId: z.string().min(1).max(60),
  description: z.string().trim().min(1, "Add a description.").max(160),
  amountCents: z
    .number()
    .int()
    .min(1, "Enter an amount above zero.")
    .max(100_000_000),
});
// Compare only persisted mutable fields; clients can send the complete row.
export const transactionSnapshotSchema = transactionSchema.extend({
  categoryName: z.string().min(1).max(80),
});
export const transactionUpdateSchema = transactionSchema.extend({
  expected: transactionSnapshotSchema,
});
export const transactionDeleteSchema = z.object({
  expected: transactionSnapshotSchema,
});
export function matchesTransactionSnapshot(
  actual: z.infer<typeof transactionSnapshotSchema>,
  expected: z.infer<typeof transactionSnapshotSchema>,
) {
  return (Object.keys(expected) as (keyof typeof expected)[]).every(
    (key) => actual[key] === expected[key],
  );
}
export function csvCell(value: string | number) {
  let text = String(value);
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
