import { z } from "zod";

export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value
  );
}
export const dateSchema = z.string().refine(validDate, "Enter a valid date.");
export const monthSchema = z
  .string()
  .regex(/^20\d{2}-(0[1-9]|1[0-2])$/, "Enter a valid month.");
const id = z.string().regex(/^[a-zA-Z0-9-]{1,60}$/);
const moneyValue = z
  .number()
  .finite()
  .min(0)
  .max(1_000_000)
  .refine(
    (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001,
    "Use at most two decimal places.",
  );
const signedMoney = z
  .number()
  .finite()
  .min(-1_000_000)
  .max(1_000_000)
  .refine(
    (n) => Math.abs(n * 100 - Math.round(n * 100)) < 0.00001,
    "Use at most two decimal places.",
  );
const rate = z.number().min(0).max(100);
const name = z.string().trim().min(1).max(80);
const day = z.number().int().min(1).max(28);
export const planSchema = z
  .object({
    version: z.literal(1),
    name,
    income: z.object({
      pay: moneyValue,
      support: moneyValue,
      other: moneyValue,
    }),
    fixed: z.object({
      givingRate: rate,
      insurance: moneyValue,
      insuranceDay: day,
      paymentDay: day,
      payday1: day,
      payday2: day,
    }),
    extraPayment: moneyValue,
    sweepSurplus: z.boolean(),
    strategy: z.enum(["priority", "avalanche", "snowball"]),
    categories: z
      .array(
        z.object({
          id,
          name,
          amount: moneyValue,
          baseline: moneyValue.nullable(),
        }),
      )
      .min(1)
      .max(24),
    balances: z.object({
      asOf: dateSchema,
      checking: signedMoney,
      floor: moneyValue,
      horizon: monthSchema,
    }),
    debts: z
      .array(
        z.object({
          id,
          name,
          balance: moneyValue,
          minimum: moneyValue,
          apr: rate,
          promoApr: rate,
          promoEnd: z.union([monthSchema, z.literal("")]),
        }),
      )
      .max(10),
    events: z
      .array(
        z.object({
          id,
          month: monthSchema,
          label: name,
          amount: signedMoney,
          borrowed: z.boolean(),
          giving: z.boolean(),
        }),
      )
      .max(60),
  })
  .superRefine((p, ctx) => {
    const span =
      monthIndex(p.balances.horizon) - monthIndex(p.balances.asOf.slice(0, 7));
    if (span < 0 || span > 59)
      ctx.addIssue({
        code: "custom",
        path: ["balances", "horizon"],
        message:
          "Choose a horizon from the starting month through the next 59 months.",
      });
    for (const key of ["categories", "debts", "events"] as const) {
      if (new Set(p[key].map((x) => x.id)).size !== p[key].length)
        ctx.addIssue({
          code: "custom",
          path: [key],
          message: "IDs must be unique.",
        });
    }
    if (
      p.categories.some((c) =>
        ["income", "bills", "giving", "debt"].includes(c.id),
      )
    )
      ctx.addIssue({
        code: "custom",
        path: ["categories"],
        message: "Reserved category ID.",
      });
    if (p.fixed.payday2 <= p.fixed.payday1)
      ctx.addIssue({
        code: "custom",
        path: ["fixed"],
        message: "The second payday must follow the first.",
      });
    if (p.events.some((e) => e.borrowed && e.amount <= 0))
      ctx.addIssue({
        code: "custom",
        path: ["events"],
        message: "Borrowing must be a positive inflow.",
      });
  });
export type Plan = z.infer<typeof planSchema>;
export type Debt = Plan["debts"][number];
export const cents = (n: number) => Math.round(n * 100);
export const dollars = (n: number) => n / 100;
export const roundMoney = (n: number) => dollars(cents(n));
export function monthIndex(month: string) {
  const [y, m] = month.split("-").map(Number);
  return y * 12 + m - 1;
}
export function addMonths(month: string, n: number) {
  const i = monthIndex(month) + n;
  return `${Math.floor(i / 12)}-${String((i % 12) + 1).padStart(2, "0")}`;
}
export function today() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Boise",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
export const money = (value: number, precise = false) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: precise ? 2 : 0,
    minimumFractionDigits: precise ? 2 : 0,
  }).format(value);
export const monthLabel = (value: string) =>
  new Date(`${value}-01T12:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });

export function emptyPlan(asOf = today()): Plan {
  return {
    version: 1,
    name: "My budget",
    income: { pay: 0, support: 0, other: 0 },
    fixed: {
      givingRate: 0,
      insurance: 0,
      insuranceDay: 15,
      paymentDay: 2,
      payday1: 1,
      payday2: 16,
    },
    extraPayment: 0,
    sweepSurplus: true,
    strategy: "priority",
    categories: [
      "Groceries",
      "Eating out",
      "Fuel",
      "Household",
      "Subscriptions",
      "Car upkeep",
      "Personal care",
      "Everything else",
    ].map((name, i) => ({
      id: `category-${i}`,
      name,
      amount: 0,
      baseline: null,
    })),
    balances: {
      asOf,
      checking: 0,
      floor: 0,
      horizon: addMonths(asOf.slice(0, 7), 11),
    },
    debts: [],
    events: [],
  };
}
// Fictional amounts for the explicitly selected local demo, never real-user defaults.
export function demoPlan(asOf = today()): Plan {
  const p = emptyPlan(asOf);
  p.name = "A little more breathing room";
  p.income = { pay: 2800, support: 0, other: 200 };
  p.fixed.givingRate = 5;
  p.fixed.insurance = 140;
  p.extraPayment = 300;
  p.balances.checking = 1200;
  p.balances.floor = 800;
  const amounts = [400, 120, 160, 90, 40, 50, 60, 80];
  p.categories = p.categories.map((c, i) => ({
    ...c,
    amount: amounts[i],
    baseline: roundMoney(amounts[i] * 1.3),
  }));
  p.debts = [
    {
      id: "card-a",
      name: "Everyday card",
      balance: 4200,
      minimum: 95,
      apr: 24.9,
      promoApr: 8.9,
      promoEnd: addMonths(asOf.slice(0, 7), 3),
    },
    {
      id: "card-b",
      name: "Travel card",
      balance: 1800,
      minimum: 35,
      apr: 22.5,
      promoApr: 0,
      promoEnd: addMonths(asOf.slice(0, 7), 5),
    },
  ];
  p.events = [
    {
      id: "refund",
      month: addMonths(asOf.slice(0, 7), 3),
      label: "Example tax refund",
      amount: 500,
      borrowed: false,
      giving: false,
    },
  ];
  return p;
}
export function totals(p: Plan) {
  const inc =
    cents(p.income.pay) + cents(p.income.support) + cents(p.income.other);
  const giving = Math.round((inc * p.fixed.givingRate) / 100);
  const bills = cents(p.fixed.insurance);
  const minimums = p.debts.reduce(
    (n, d) => n + cents(d.balance > 0 ? Math.min(d.minimum, d.balance) : 0),
    0,
  );
  const spending = p.categories.reduce((n, c) => n + cents(c.amount), 0);
  return {
    income: dollars(inc),
    giving: dollars(giving),
    bills: dollars(bills),
    minimums: dollars(minimums),
    spending: dollars(spending),
    extra: p.extraPayment,
    left: dollars(
      inc - giving - bills - minimums - cents(p.extraPayment) - spending,
    ),
  };
}
export const allocationCap = (p: Plan, current: number) =>
  roundMoney(current + Math.max(0, totals(p).left));
export type ForecastRow = {
  month: string;
  partial: boolean;
  income: number;
  expenses: number;
  events: number;
  interest: number;
  checking: number;
  debts: Record<string, number>;
  payments: Record<string, number>;
  belowFloor: boolean;
};
export function simulate(p: Plan) {
  const t = totals(p),
    startMonth = p.balances.asOf.slice(0, 7),
    startDay = Number(p.balances.asOf.slice(8));
  const balances = Object.fromEntries(
    p.debts.map((d) => [d.id, cents(d.balance)]),
  );
  let checking = cents(p.balances.checking),
    interest = 0,
    borrowed = 0,
    lowestChecking = checking;
  let lowestMonth: string | null = null;
  const payoff: Record<string, string | null> = Object.fromEntries(
    p.debts.map((d) => [d.id, null]),
  );
  const rows: ForecastRow[] = [];
  const span = Math.min(
    60,
    monthIndex(p.balances.horizon) - monthIndex(startMonth) + 1,
  );
  for (let i = 0; i < span; i++) {
    const month = addMonths(startMonth, i),
      [y, m] = month.split("-").map(Number);
    const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const fraction = i === 0 ? (dim - startDay + 1) / dim : 1;
    const due = i > 0 || startDay <= p.fixed.paymentDay;
    const installments =
      i > 0
        ? 2
        : Number(startDay <= p.fixed.payday1) +
          Number(startDay <= p.fixed.payday2);
    const inc = Math.round((cents(t.income) * installments) / 2);
    const giving = Math.round((inc * p.fixed.givingRate) / 100);
    const expenses =
      giving +
      (i > 0 || startDay <= p.fixed.insuranceDay
        ? cents(p.fixed.insurance)
        : 0) +
      Math.round(cents(t.spending) * fraction);
    const payments = Object.fromEntries(p.debts.map((d) => [d.id, 0]));
    let int = 0;
    for (const d of p.debts) {
      const apr = d.promoEnd && month <= d.promoEnd ? d.promoApr : d.apr;
      const charge = Math.round(((balances[d.id] * apr) / 1200) * fraction);
      balances[d.id] += charge;
      int += charge;
    }
    checking += inc - expenses;
    const pay = (d: Debt, amount: number) => {
      const paid = Math.min(Math.max(0, amount), balances[d.id]);
      balances[d.id] -= paid;
      checking -= paid;
      payments[d.id] += paid;
      return paid;
    };
    if (due) for (const d of p.debts) pay(d, cents(d.minimum));
    let events = 0;
    for (const e of p.events.filter((e) => e.month === month)) {
      const amount = cents(e.amount),
        net =
          amount -
          (e.giving && amount > 0
            ? Math.round((amount * p.fixed.givingRate) / 100)
            : 0);
      events += net;
      if (e.borrowed && amount > 0) borrowed += amount;
    }
    checking += events;
    const priority = [...p.debts];
    if (p.strategy === "snowball")
      priority.sort((a, b) => balances[a.id] - balances[b.id]);
    if (p.strategy === "avalanche") {
      const apr = (d: Debt) =>
        d.promoEnd && month <= d.promoEnd ? d.promoApr : d.apr;
      priority.sort((a, b) => apr(b) - apr(a));
    }
    let extra = due ? cents(p.extraPayment) : 0;
    for (const d of priority) extra -= pay(d, extra);
    if (p.sweepSurplus) {
      let surplus = Math.max(0, checking - cents(p.balances.floor));
      for (const d of priority) surplus -= pay(d, surplus);
    }
    for (const d of p.debts)
      if (balances[d.id] === 0 && d.balance > 0 && !payoff[d.id])
        payoff[d.id] = month;
    interest += int;
    if (checking < lowestChecking) {
      lowestChecking = checking;
      lowestMonth = month;
    }
    rows.push({
      month,
      partial: fraction < 1,
      income: dollars(inc),
      expenses: dollars(expenses),
      events: dollars(events),
      interest: dollars(int),
      checking: dollars(checking),
      debts: Object.fromEntries(
        Object.entries(balances).map(([id, n]) => [id, dollars(n)]),
      ),
      payments: Object.fromEntries(
        Object.entries(payments).map(([id, n]) => [id, dollars(n)]),
      ),
      belowFloor: checking < cents(p.balances.floor),
    });
  }
  return {
    rows,
    interest: dollars(interest),
    borrowed: dollars(borrowed),
    payoff,
    lowestChecking: dollars(lowestChecking),
    lowestMonth,
    end: rows.at(-1),
  };
}
