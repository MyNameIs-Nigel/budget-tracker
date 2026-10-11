import { expect, it } from "vitest";
import { emptyPlan, planSchema } from "@/lib/budget";
import { importPlan } from "@/lib/import-plan";
import { transactionSchema, csvCell } from "@/lib/ledger";
it("PLAN-01 rejects invalid dates, non-finite amounts, duplicate IDs and excess horizons", () => {
  const p = emptyPlan("2026-10-01");
  expect(planSchema.safeParse(p).success).toBe(true);
  expect(
    planSchema.safeParse({
      ...p,
      balances: { ...p.balances, asOf: "2026-02-30" },
    }).success,
  ).toBe(false);
  expect(
    planSchema.safeParse({
      ...p,
      balances: { ...p.balances, horizon: "2032-01" },
    }).success,
  ).toBe(false);
  expect(
    planSchema.safeParse({
      ...p,
      categories: [p.categories[0], p.categories[0]],
    }).success,
  ).toBe(false);
  expect(planSchema.safeParse({ ...p, extraPayment: Infinity }).success).toBe(
    false,
  );
  expect(planSchema.safeParse({ ...p, extraPayment: 1.001 }).success).toBe(
    false,
  );
});
it("LEDGER-01 rejects negative and fractional cents", () => {
  const t = {
    date: "2026-10-07",
    kind: "expense",
    categoryId: "bills",
    description: "Example",
    amountCents: 200,
  };
  expect(transactionSchema.safeParse(t).success).toBe(true);
  expect(transactionSchema.safeParse({ ...t, amountCents: -1 }).success).toBe(
    false,
  );
  expect(transactionSchema.safeParse({ ...t, amountCents: 1.5 }).success).toBe(
    false,
  );
});
it("LEDGER-01 protects CSV formulas and quotes", () => {
  expect(csvCell("=SUM(1,2)")).toBe('"\'=SUM(1,2)"');
  expect(csvCell('hello "world"')).toBe('"hello ""world"""');
});
it("IMPORT-01 JSON round-trip has no loss; scripts are not run", () => {
  const p = emptyPlan("2026-10-01");
  expect(importPlan(JSON.stringify(p))).toEqual(p);
  expect(() =>
    importPlan('<script>throw new Error("executed")</script>'),
  ).toThrow("Choose a Budget Tracker");
});
it("IMPORT-01 extracts literal reference values without executing scripts", () => {
  const html = `var CATS=[{k:"groceries",name:"Groceries",was:220,max:500,sug:200}];
    var EXTRA={sug:50}; function defaults(){return {income:{pay:2000,dad:100,other:50},first:{titheRate:5,insurance:120,discMin:60,wfMin:30},sim:{asOf:"2026-10-01",checking:1200,discover:3000,wf:1000,floor:500,discApr:8,discPlanLast:"2027-01",discAprAfter:24,wfPromoLast:"2027-03",wfAprAfter:22,horizon:"2027-04"},lumps:[{month:"2027-01",label:"Example loan",amount:400,loan:true,tithe:false}]};} throw new Error("must not execute");`;
  const p = importPlan(html);
  expect(p.income.support).toBe(100);
  expect(p.categories[0].baseline).toBe(220);
  expect(p.debts[0].promoApr).toBe(8);
  expect(p.events[0].borrowed).toBe(true);
});

it("LEDGER-01 rejects year zero, which PostgreSQL cannot store", () => {
  expect(
    transactionSchema.safeParse({
      date: "0000-01-01",
      kind: "income",
      categoryId: "income",
      description: "Invalid year",
      amountCents: 100,
    }).success,
  ).toBe(false);
});
