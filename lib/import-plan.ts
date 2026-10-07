import { emptyPlan, planSchema, type Plan } from "./budget";
function validate(value: unknown) {
  const result = planSchema.safeParse(value);
  if (!result.success)
    throw new Error(
      result.error.issues[0]?.message ?? "Check the imported plan.",
    );
  return result.data;
}

/** Extract literal report data only. Never eval HTML or JavaScript. */
export function importPlan(text: string): Plan {
  if (text.length > 200_000)
    throw new Error("Choose a file smaller than 200 KB.");
  if (text.trimStart().startsWith("{")) {
    const data = JSON.parse(text);
    return validate(data.plan ?? data);
  }
  const cats = text.match(/var\s+CATS\s*=\s*\[([\s\S]*?)\];/)?.[1];
  const income = text.match(/income\s*:\s*\{([^}]*)\}/)?.[1];
  const first = text.match(/first\s*:\s*\{([^}]*)\}/)?.[1];
  const sim = text.match(/sim\s*:\s*\{([^}]*)\}/)?.[1];
  if (!cats || !income || !first || !sim)
    throw new Error(
      "Choose a Budget Tracker JSON export or the original budget HTML report.",
    );
  const number = (source: string, key: string) => {
    const value = source.match(
      new RegExp(`\\b${key}\\s*:\\s*(-?\\d+(?:\\.\\d+)?)`),
    )?.[1];
    if (value === undefined) throw new Error(`The report is missing ${key}.`);
    return Number(value);
  };
  const string = (source: string, key: string) => {
    const value = source.match(
      new RegExp(`\\b${key}\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")`),
    )?.[1];
    if (value === undefined) throw new Error(`The report is missing ${key}.`);
    return JSON.parse(value) as string;
  };
  const p = emptyPlan(string(sim, "asOf"));
  p.name = "My debt payoff plan";
  p.income = {
    pay: number(income, "pay"),
    support: number(income, "dad"),
    other: number(income, "other"),
  };
  p.fixed.givingRate = number(first, "titheRate");
  p.fixed.insurance = number(first, "insurance");
  const extra = text.match(/var\s+EXTRA\s*=\s*\{([^}]*)\}/)?.[1];
  if (!extra) throw new Error("The report is missing its extra payment.");
  p.extraPayment = number(extra, "sug");
  p.categories = [...cats.matchAll(/\{([^}]+)\}/g)].map(([, c]) => ({
    id: string(c, "k"),
    name: string(c, "name"),
    amount: number(c, "sug"),
    baseline: number(c, "was"),
  }));
  p.balances = {
    asOf: string(sim, "asOf"),
    checking: number(sim, "checking"),
    floor: number(sim, "floor"),
    horizon: string(sim, "horizon"),
  };
  p.debts = [
    {
      id: "discover",
      name: "Discover",
      balance: number(sim, "discover"),
      minimum: number(first, "discMin"),
      apr: number(sim, "discAprAfter"),
      promoApr: number(sim, "discApr"),
      promoEnd: string(sim, "discPlanLast"),
    },
    {
      id: "wells-fargo",
      name: "Wells Fargo",
      balance: number(sim, "wf"),
      minimum: number(first, "wfMin"),
      apr: number(sim, "wfAprAfter"),
      promoApr: 0,
      promoEnd: string(sim, "wfPromoLast"),
    },
  ];
  const lumps = text.match(/lumps\s*:\s*\[([\s\S]*?)\]/)?.[1];
  p.events = lumps
    ? [...lumps.matchAll(/\{([^}]+)\}/g)].map(([, e], i) => ({
        id: `event-${i}`,
        month: string(e, "month"),
        label: string(e, "label"),
        amount: number(e, "amount"),
        borrowed: /loan\s*:\s*true/.test(e),
        giving: /tithe\s*:\s*true/.test(e),
      }))
    : [];
  return validate(p);
}
