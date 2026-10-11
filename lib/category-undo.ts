import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { CATEGORY_BATCH_LIMIT } from "./category-assignment";
import { transactionIdSchema, transactionSnapshotSchema } from "./ledger";

const receiptSchema = z.object({
  userId: z.string().min(1),
  expiresAt: z.number().int(),
  changes: z
    .array(
      z.object({
        id: transactionIdSchema,
        before: z.object({
          categoryId: z.string().min(1).max(60),
          categoryName: z.string().min(1).max(80),
        }),
        expected: transactionSnapshotSchema,
      }),
    )
    .min(1)
    .max(CATEGORY_BATCH_LIMIT),
});
type Changes = z.infer<typeof receiptSchema>["changes"];
export const categoryUndoSchema = z.object({
  undoToken: z.string().min(1).max(180_000),
});

function secret() {
  const value = process.env.BETTER_AUTH_SECRET;
  if (!value) throw new Error("Missing signing secret");
  return value;
}
function signature(payload: string) {
  return createHmac("sha256", secret())
    .update(`category-undo:v1:${payload}`)
    .digest();
}
export function createCategoryUndo(
  userId: string,
  changes: Changes,
  now = Date.now(),
) {
  const payload = Buffer.from(
    JSON.stringify(
      receiptSchema.parse({ userId, changes, expiresAt: now + 15 * 60_000 }),
    ),
  ).toString("base64url");
  return `${payload}.${signature(payload).toString("base64url")}`;
}
export function readCategoryUndo(
  token: string,
  userId: string,
  now = Date.now(),
) {
  const [payload, mac, extra] = token.split(".");
  if (!payload || !mac || extra !== undefined) return null;
  const supplied = Buffer.from(mac, "base64url");
  const expected = signature(payload);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    return null;
  try {
    const receipt = receiptSchema.parse(
      JSON.parse(Buffer.from(payload, "base64url").toString("utf8")),
    );
    return receipt.userId === userId && receipt.expiresAt > now
      ? receipt.changes
      : null;
  } catch {
    return null;
  }
}
