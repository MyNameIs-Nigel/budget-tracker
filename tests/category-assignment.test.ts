import { afterEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import {
  categoryAssignmentSchema,
  CATEGORY_BATCH_LIMIT,
} from "../lib/category-assignment";
import { createCategoryUndo, readCategoryUndo } from "../lib/category-undo";
const expected = {
  date: "2026-10-01",
  kind: "expense" as const,
  categoryId: "groceries",
  categoryName: "Groceries",
  description: "Fictional purchase",
  amountCents: 1234,
};
const id = "00000000-0000-0000-0000-000000000001";
afterEach(() => vi.unstubAllEnvs());
describe("category assignment boundaries", () => {
  it("requires a bounded set of distinct IDs with complete prior snapshots", () => {
    const row = { id, expected };
    expect(
      categoryAssignmentSchema.safeParse({
        categoryId: "debt",
        transactions: [row],
      }).success,
    ).toBe(true);
    for (const transactions of [
      [],
      [row, row],
      [{ ...row, id: "invalid" }],
      [{ id }],
      Array.from({ length: CATEGORY_BATCH_LIMIT + 1 }, () => row),
    ])
      expect(
        categoryAssignmentSchema.safeParse({ categoryId: "debt", transactions })
          .success,
      ).toBe(false);
  });
  it("binds undo to its owner, original historical label, signature and expiry", () => {
    vi.stubEnv("BETTER_AUTH_SECRET", "fictional-tests-only-signing-secret");
    const changes = [
      {
        id,
        expected,
        before: { categoryId: "removed", categoryName: "Old groceries" },
        version: "4242",
      },
    ];
    const token = createCategoryUndo("owner", changes, 1000);
    expect(readCategoryUndo(token, "owner", 1001)).toEqual(changes);
    expect(readCategoryUndo(token, "other", 1001)).toBeNull();
    expect(readCategoryUndo(token, "owner", 901000)).toBeNull();
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload, "base64url").toString()),
        userId: "other",
      }),
    ).toString("base64url");
    expect(
      readCategoryUndo(`${forged}.${signature}`, "other", 1001),
    ).toBeNull();
    expect(readCategoryUndo(`${token}.extra`, "owner", 1001)).toBeNull();
    expect(readCategoryUndo("invalid", "owner", 1001)).toBeNull();
    expect(() =>
      createCategoryUndo("owner", [{ ...changes[0], version: "" }], 1000),
    ).toThrow();
  });
});
