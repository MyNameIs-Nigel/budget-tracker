import { describe, expect, it } from "vitest";
import { emptyPlan, totals, simulate, allocationCap } from "@/lib/budget";

function plan() {
  const p = emptyPlan("2026-10-01");
  p.income.pay = 2000;
  p.balances.horizon = "2026-12";
  p.balances.checking = 500;
  p.balances.floor = 500;
  p.debts = [
    {
      id: "a",
      name: "Card A",
      balance: 1000,
      minimum: 50,
      apr: 12,
      promoApr: 0,
      promoEnd: "2026-10",
    },
    {
      id: "b",
      name: "Card B",
      balance: 1000,
      minimum: 25,
      apr: 0,
      promoApr: 0,
      promoEnd: "",
    },
  ];
  return p;
}

describe("budget and forecast", () => {
  it("PLAN-02 caps increases and allows decreases in an over-budget plan", () => {
    const p = plan();
    p.categories[0].amount = 1950;
    expect(totals(p).left).toBe(-25);
    expect(allocationCap(p, 1950)).toBe(1950);
    p.categories[0].amount = 1000;
    expect(allocationCap(p, 1000)).toBe(1925);
  });
  it("FORECAST-02 sweeps to priority debts, rolls payment over, and preserves floor", () => {
    const r = simulate(plan());
    expect(r.rows[0].debts).toEqual({ a: 0, b: 0 });
    expect(r.rows[0].checking).toBe(500);
    expect(r.rows[0].payments.a).toBe(1000);
    expect(r.rows[0].payments.b).toBe(1000);
  });
  it("FORECAST-02 explicit extra changes payoff when sweep is disabled", () => {
    const p = plan();
    p.sweepSurplus = false;
    const before = simulate(p).rows[0].debts.a;
    p.extraPayment = 100;
    expect(simulate(p).rows[0].debts.a).toBe(before - 100);
  });
  it("FORECAST-02 promotion is inclusive and resets the following month", () => {
    const p = plan();
    p.sweepSurplus = false;
    p.debts[0].minimum = 0;
    const r = simulate(p);
    expect(r.rows[0].interest).toBe(0);
    expect(r.rows[1].interest).toBe(10);
  });
  it("FORECAST-01 prorates mid-month and respects already-passed pay/due days", () => {
    const p = plan();
    p.balances.asOf = "2026-10-17";
    p.sweepSurplus = false;
    p.categories[0].amount = 310;
    p.debts[0].promoEnd = "";
    const row = simulate(p).rows[0];
    expect(row.income).toBe(0);
    expect(row.expenses).toBe(150);
    expect(row.payments.a).toBe(0);
    expect(row.interest).toBe(4.84);
    expect(row.belowFloor).toBe(true);
  });
  it("FORECAST-03 counts borrowed inflows, giving, and negative one-offs once", () => {
    const p = plan();
    p.sweepSurplus = false;
    p.fixed.givingRate = 10;
    p.events = [
      {
        id: "loan",
        month: "2026-10",
        label: "Loan",
        amount: 600,
        borrowed: true,
        giving: false,
      },
      {
        id: "grant",
        month: "2026-10",
        label: "Grant",
        amount: 100,
        borrowed: false,
        giving: true,
      },
      {
        id: "rent",
        month: "2026-10",
        label: "Rent",
        amount: -50,
        borrowed: false,
        giving: true,
      },
    ];
    const r = simulate(p);
    expect(r.borrowed).toBe(600);
    expect(r.rows[0].events).toBe(640);
    expect(r.rows[1].events).toBe(0);
  });
  it("FORECAST-04 retains the actual lowest opening checking balance", () => {
    const p = plan();
    p.balances.checking = 100;
    p.balances.floor = 0;
    const r = simulate(p);
    expect(r.lowestChecking).toBe(100);
    expect(r.lowestMonth).toBe(null);
  });
  it("FORECAST-02 caps all payments at balances", () => {
    const p = plan();
    p.debts[0].balance = 1;
    p.debts[0].minimum = 999;
    p.extraPayment = 10000;
    for (const row of simulate(p).rows)
      for (const balance of Object.values(row.debts))
        expect(balance).toBeGreaterThanOrEqual(0);
  });
});

it("FORECAST-02 snowball sends extra to the smallest remaining debt", () => {
  const p = plan();
  p.sweepSurplus = false;
  p.strategy = "snowball";
  p.extraPayment = 100;
  p.debts[1].balance = 400;
  expect(simulate(p).rows[0].payments).toEqual({ a: 50, b: 125 });
});

it("FORECAST-02 avalanche reorders by the active APR when promotions expire", () => {
  const p = plan();
  p.sweepSurplus = false;
  p.strategy = "avalanche";
  p.extraPayment = 100;
  p.debts[0].minimum = p.debts[1].minimum = 0;
  p.debts[0].apr = 36;
  p.debts[1].apr = 12;
  const result = simulate(p);
  expect(result.rows[0].payments).toEqual({ a: 0, b: 100 });
  expect(result.rows[1].payments).toEqual({ a: 100, b: 0 });
});

it("FORECAST-01/03 conserves cash and debt to the cent across strategies and partial months", () => {
  const toCents = (amount: number) => Math.round(amount * 100);
  const sumCents = (values: number[]) =>
    values.reduce((sum, value) => sum + toCents(value), 0);
  for (const strategy of ["priority", "snowball", "avalanche"] as const) {
    for (const sweepSurplus of [true, false]) {
      const p = plan();
      p.strategy = strategy;
      p.sweepSurplus = sweepSurplus;
      p.balances.asOf = "2026-10-12";
      p.balances.horizon = "2027-03";
      p.income.pay = 2000.01;
      p.fixed.givingRate = 7.5;
      p.categories[0].amount = 103.37;
      p.extraPayment = 50.01;
      p.events = [
        {
          id: "cost",
          month: "2026-11",
          label: "One-off cost",
          amount: -207.13,
          borrowed: false,
          giving: false,
        },
      ];
      let cash = toCents(p.balances.checking);
      let debt = sumCents(p.debts.map((d) => d.balance));
      for (const row of simulate(p).rows) {
        const paid = sumCents(Object.values(row.payments));
        cash +=
          toCents(row.income) +
          toCents(row.events) -
          toCents(row.expenses) -
          paid;
        debt += toCents(row.interest) - paid;
        expect(toCents(row.checking)).toBe(cash);
        expect(sumCents(Object.values(row.debts))).toBe(debt);
        expect(Object.values(row.debts).every((balance) => balance >= 0)).toBe(
          true,
        );
      }
    }
  }
});
