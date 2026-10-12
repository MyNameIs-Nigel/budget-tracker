import { describe, expect, it } from "vitest";
import { previousMonthSpending } from "../lib/spending-history";

const expense = (date: string, categoryId: string, amountCents: number) => ({
  date,
  categoryId,
  amountCents,
  kind: "expense" as const,
});
describe("previous calendar month spending", () => {
  it("uses the entire previous month across year boundaries and only sums expenses in cents", () => {
    const history = previousMonthSpending(
      [
        expense("2025-12-01", "food", 101),
        expense("2025-12-31", "food", 202),
        expense("2025-12-15", "uncategorized", 505),
        expense("2025-12-16", "removed", 707),
        expense("2025-11-30", "food", 999),
        expense("2026-01-01", "food", 999),
        { ...expense("2025-12-20", "food", 5000), kind: "income" as const },
      ],
      "2026-01-11",
    );
    expect(history.month).toBe("2025-12");
    expect(history.hasTransactions).toBe(true);
    expect(history.byCategory).toEqual({
      food: 303,
      uncategorized: 505,
      removed: 707,
    });
    expect(
      Object.values(history.byCategory).reduce(
        (total, cents) => total + cents,
        0,
      ),
    ).toBe(1515);
  });
  it("distinguishes missing history from a recorded month with zero expense spending", () => {
    expect(previousMonthSpending([], "2026-03-01").hasTransactions).toBe(false);
    const history = previousMonthSpending(
      [{ ...expense("2026-02-28", "income", 12000), kind: "income" as const }],
      "2026-03-01",
    );
    expect(history.hasTransactions).toBe(true);
    expect(history.byCategory).toEqual({});
    expect(
      previousMonthSpending([expense("2024-02-29", "food", 100)], "2024-03-01")
        .byCategory.food,
    ).toBe(100);
  });
  it("derives live totals from category identity after reclassification, edits or deletion", () => {
    const row = expense("2026-09-08", "food", 1234);
    expect(previousMonthSpending([row], "2026-10-11").byCategory.food).toBe(
      1234,
    );
    expect(
      previousMonthSpending(
        [{ ...row, categoryId: "home", amountCents: 4321 }],
        "2026-10-11",
      ).byCategory,
    ).toEqual({ home: 4321 });
    expect(previousMonthSpending([], "2026-10-11").byCategory).toEqual({});
    expect(previousMonthSpending([row], "2026-11-01").hasTransactions).toBe(
      false,
    );
  });
});
