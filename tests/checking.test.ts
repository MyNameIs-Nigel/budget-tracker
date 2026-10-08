import { describe, expect, it } from "vitest";
import { checkingBalanceSchema, runningBalances } from "@/lib/checking";

const checkpoint = { asOf: "2026-10-07", balanceCents: 10_000, revision: 0 };
function activity(
  id: string,
  date: string,
  kind: "income" | "expense",
  amountCents: number,
  createdAt = "2026-10-08T00:00:00.000Z",
) {
  return { id, date, kind, amountCents, createdAt };
}

describe("checking balances", () => {
  it("requires an explicit balance instead of guessing from forecast or activity", () => {
    expect(
      runningBalances(
        [activity("expense", "2026-10-08", "expense", 200)],
        null,
        "2026-10-08",
      ),
    ).toEqual({ currentBalanceCents: null, balances: {}, projected: {} });
  });

  it("reconstructs older activity and includes same-day mutations exactly once", () => {
    const rows = [
      activity("old-income", "2026-10-05", "income", 2_000),
      activity("old-expense", "2026-10-06", "expense", 500),
      activity("same-day", "2026-10-07", "expense", 1_000),
      activity("today", "2026-10-08", "income", 3_000),
      activity("future", "2026-10-09", "expense", 4_000),
    ];
    const result = runningBalances(rows, checkpoint, "2026-10-08");
    expect(result.currentBalanceCents).toBe(12_000);
    expect(result.balances).toEqual({
      "old-income": 10_500,
      "old-expense": 10_000,
      "same-day": 9_000,
      today: 12_000,
      future: 8_000,
    });
    expect(result.projected.future).toBe(true);
    expect(result.projected.today).toBe(false);
    expect(
      runningBalances(
        rows.filter((row) => row.id !== "same-day"),
        checkpoint,
        "2026-10-08",
      ).currentBalanceCents,
    ).toBe(13_000);
    expect(
      runningBalances(
        rows.map((row) =>
          row.id === "same-day" ? { ...row, amountCents: 1_500 } : row,
        ),
        checkpoint,
        "2026-10-08",
      ).currentBalanceCents,
    ).toBe(11_500);
  });

  it("sorts equal dates by creation then ID without mutating the supplied order", () => {
    const rows = [
      activity("b", "2026-10-07", "expense", 300),
      activity("a", "2026-10-07", "income", 1_000),
      activity("c", "2026-10-07", "expense", 100, "2026-10-07T00:00:00.000Z"),
    ];
    const result = runningBalances(rows, checkpoint, "2026-10-08");
    expect(result.balances).toEqual({ c: 9_900, a: 10_900, b: 10_600 });
    expect(rows.map((row) => row.id)).toEqual(["b", "a", "c"]);
  });

  it("accepts overdrafts and zero, and rejects fractional, infinite or oversized cents", () => {
    for (const balanceCents of [-200, 0, 200])
      expect(
        checkingBalanceSchema.safeParse({
          asOf: checkpoint.asOf,
          balanceCents,
          revision: null,
        }).success,
      ).toBe(true);
    for (const balanceCents of [1.5, Infinity, 100_000_001])
      expect(
        checkingBalanceSchema.safeParse({
          asOf: checkpoint.asOf,
          balanceCents,
          revision: 0,
        }).success,
      ).toBe(false);
    expect(
      checkingBalanceSchema.safeParse({
        asOf: "2026-02-30",
        balanceCents: 0,
        revision: 0,
      }).success,
    ).toBe(false);
  });
});
