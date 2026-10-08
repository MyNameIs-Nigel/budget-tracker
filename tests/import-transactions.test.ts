import { describe, expect, it } from "vitest";
import {
  findImportDuplicates,
  ImportConflictError,
  importTransactionsSchema,
  planTransactionImport,
  type ResolvedImportRow,
} from "@/lib/import-transactions";
import type { Transaction } from "@/lib/store";

const row = (
  number: number,
  changes: Partial<ResolvedImportRow> = {},
): ResolvedImportRow => ({
  row: number,
  date: "2026-10-07",
  kind: "expense",
  categoryId: "uncategorized",
  categoryName: "Uncategorized",
  description: "Coffee",
  amountCents: 500,
  ...changes,
});
const existing: Transaction = {
  id: "75d76d32-bc8b-4f97-a8bc-827fd2a34daa",
  date: "2026-10-07",
  kind: "expense",
  categoryId: "bills",
  categoryName: "Insurance & bills",
  description: "Previous description",
  amountCents: 500,
  createdAt: "2026-10-07T00:00:00.000Z",
};

describe("transaction import decisions", () => {
  it("matches date, amount and direction while ignoring description and category", () => {
    const preview = findImportDuplicates(
      [
        row(2),
        row(3, { kind: "income", categoryId: "income" }),
        row(4, { date: "2026-10-08" }),
        row(5, { amountCents: 501 }),
      ],
      [existing],
    );
    expect(preview.newCount).toBe(3);
    expect(preview.duplicates).toEqual([
      { row: 2, incoming: row(2), matches: [existing] },
    ]);
  });

  it("requires choosing a specific match when legitimate same-key transactions exist", () => {
    const second = {
      ...existing,
      id: "d8bf7910-9457-4970-be57-83f125a093d6",
      description: "Second purchase",
    };
    expect(
      findImportDuplicates(
        [row(2)],
        [second, existing],
      ).duplicates[0].matches.map((match) => match.id),
    ).toEqual([existing.id, second.id]);
    expect(() =>
      planTransactionImport(
        [row(2)],
        [existing, second],
        [{ row: 2, action: "update" }],
      ),
    ).toThrow(ImportConflictError);
    const planned = planTransactionImport(
      [row(2)],
      [existing, second],
      [{ row: 2, action: "update", targetId: second.id, expected: second }],
    );
    expect(planned.updates).toEqual([{ targetId: second.id, row: row(2) }]);
  });

  it("can update or skip duplicate CSV rows without adding them twice", () => {
    const rows = [
      row(2),
      row(3, { description: "Corrected coffee" }),
      row(4, { description: "Another copy" }),
    ];
    const preview = findImportDuplicates(rows, []);
    expect(preview.newCount).toBe(1);
    expect(
      preview.duplicates.map((duplicate) => duplicate.matches[0].id),
    ).toEqual(["csv-row-2", "csv-row-2"]);
    const planned = planTransactionImport(
      rows,
      [],
      [
        {
          row: 3,
          action: "update",
          targetId: "csv-row-2",
          expected: preview.duplicates[0].matches[0],
        },
        { row: 4, action: "skip" },
      ],
    );
    expect(planned.inserts).toEqual([
      row(2, { description: "Corrected coffee" }),
    ]);
    expect(planned).toMatchObject({ added: 1, updated: 1, skipped: 1 });
  });

  it("does not add anything on repeat import when duplicates are skipped", () => {
    expect(
      planTransactionImport([row(2)], [existing], [{ row: 2, action: "skip" }]),
    ).toEqual({ inserts: [], updates: [], added: 0, updated: 0, skipped: 1 });
  });

  it("rejects unreviewed duplicates, foreign targets and stale snapshots before writes", () => {
    expect(() =>
      planTransactionImport(
        [row(2), row(3, { amountCents: 600 })],
        [existing],
        [],
      ),
    ).toThrow(ImportConflictError);
    expect(() =>
      planTransactionImport(
        [row(2)],
        [existing],
        [{ row: 2, action: "update", targetId: "foreign-id" }],
      ),
    ).toThrow(ImportConflictError);
    expect(() =>
      planTransactionImport(
        [row(2)],
        [{ ...existing, description: "Changed elsewhere" }],
        [
          {
            row: 2,
            action: "update",
            targetId: existing.id,
            expected: existing,
          },
        ],
      ),
    ).toThrow(ImportConflictError);
    expect(() =>
      planTransactionImport([row(2)], [], [{ row: 2, action: "skip" }]),
    ).toThrow(ImportConflictError);
  });

  it("bounds the batch and requires unique row numbers and decisions", () => {
    expect(importTransactionsSchema.safeParse({ rows: [row(2)] }).success).toBe(
      true,
    );
    expect(
      importTransactionsSchema.safeParse({ rows: [row(2), row(2)] }).success,
    ).toBe(false);
    expect(
      importTransactionsSchema.safeParse({
        rows: [row(2)],
        decisions: [
          { row: 2, action: "skip" },
          { row: 2, action: "skip" },
        ],
      }).success,
    ).toBe(false);
    expect(
      importTransactionsSchema.safeParse({
        rows: Array.from({ length: 501 }, (_, i) => row(i + 1)),
      }).success,
    ).toBe(false);
    expect(
      importTransactionsSchema.safeParse({
        rows: [row(2, { amountCents: -1 })],
      }).success,
    ).toBe(false);
  });
});
