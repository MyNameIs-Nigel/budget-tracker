import { describe, expect, it } from "vitest";
import { emptyLedgerFilters, matchesLedgerFilters } from "../lib/ledger-view";
import type { Transaction } from "../lib/store";

const row: Transaction = {
  id: "a",
  date: "2026-10-01",
  kind: "expense",
  categoryId: "uncategorized",
  categoryName: "Uncategorized",
  description: "North Market, weekly shop",
  amountCents: 4825,
  createdAt: "2026-10-01T12:00:00Z",
};
describe("transaction discovery", () => {
  it("matches every partial word in any order, ignoring case and extra spaces", () => {
    expect(
      matchesLedgerFilters(row, {
        ...emptyLedgerFilters,
        search: " SHOP   mark ",
      }),
    ).toBe(true);
    expect(
      matchesLedgerFilters(row, {
        ...emptyLedgerFilters,
        search: "market cafe",
      }),
    ).toBe(false);
    expect(
      matchesLedgerFilters(row, { ...emptyLedgerFilters, search: ".*" }),
    ).toBe(false);
    expect(
      matchesLedgerFilters(row, {
        ...emptyLedgerFilters,
        search: "Uncategorized",
      }),
    ).toBe(false);
  });
  it("combines category, direction, inclusive date and cents boundaries", () => {
    const filters = {
      ...emptyLedgerFilters,
      category: "uncategorized",
      kind: "expense",
      from: "2026-10-01",
      to: "2026-10-01",
      minimum: "48.25",
      maximum: "48.25",
    };
    expect(matchesLedgerFilters(row, filters)).toBe(true);
    for (const change of [
      { category: "groceries" },
      { kind: "income" },
      { from: "2026-10-02" },
      { to: "2026-09-30" },
      { minimum: "48.26" },
      { maximum: "48.24" },
    ])
      expect(matchesLedgerFilters(row, { ...filters, ...change })).toBe(false);
  });
});
