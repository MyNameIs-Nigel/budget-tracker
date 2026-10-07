import { z } from "zod";
import { dateSchema } from "./budget";
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
export function csvCell(value: string | number) {
  let text = String(value);
  if (/^[\s]*[=+@-]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}
