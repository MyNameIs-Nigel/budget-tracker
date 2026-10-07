"use client";
import {
  AlertTriangle,
  ArrowDownRight,
  CalendarDays,
  TrendingDown,
} from "lucide-react";
import {
  money,
  monthLabel,
  planSchema,
  simulate,
  type Plan,
} from "@/lib/budget";
const colors = [
  "var(--accent)",
  "var(--chart-second)",
  "#9a73ca",
  "#d97566",
  "#6b92bb",
];
export default function Forecast({ plan }: { plan: Plan }) {
  const valid = planSchema.safeParse(plan);
  const r = valid.success ? simulate(valid.data) : null;
  if (!r || !r.end)
    return (
      <div className="notice danger">
        Check your plan settings:{" "}
        {valid.error?.issues[0]?.message ?? "Choose a valid forecast range."}
      </div>
    );
  const startingDebt = plan.debts.reduce((n, d) => n + d.balance, 0),
    endingDebt = Object.values(r.end.debts).reduce((n, b) => n + b, 0);
  const below = r.rows.filter((row) => row.belowFloor),
    dates = Object.values(r.payoff).filter((d): d is string => d !== null);
  const debtFree =
    startingDebt > 0 && endingDebt === 0 ? dates.sort().at(-1) : null;
  const points = [
    {
      month: "Start",
      debts: Object.fromEntries(plan.debts.map((d) => [d.id, d.balance])),
    },
    ...r.rows,
  ];
  const W = 720,
    H = 250,
    left = 60,
    right = 16,
    top = 18,
    bottom = 30;
  const max = Math.max(100, ...points.flatMap((p) => Object.values(p.debts)));
  const ceiling =
    Math.ceil(max / (max > 5000 ? 2000 : 500)) * (max > 5000 ? 2000 : 500);
  const X = (i: number) =>
    left + (i / Math.max(1, points.length - 1)) * (W - left - right);
  const Y = (v: number) => top + (1 - v / ceiling) * (H - top - bottom);
  return (
    <div className="view-content">
      <section className="forecast-hero">
        <div className="forecast-hero-icon">
          <TrendingDown size={26} />
        </div>
        <div>
          <p className="eyebrow">Your current plan, projected</p>
          <h2>
            {debtFree ? (
              <>
                Card debt free by{" "}
                <span className="accent">{monthLabel(debtFree)}.</span>
              </>
            ) : startingDebt === 0 ? (
              "A clear picture of your cash flow."
            ) : endingDebt < startingDebt ? (
              <>
                Your card debt could fall by{" "}
                <span className="accent">
                  {money(startingDebt - endingDebt)}.
                </span>
              </>
            ) : (
              "Your balances need a little more attention."
            )}
          </h2>
          <p className="muted">
            {startingDebt > 0
              ? `${money(startingDebt)} now → ${money(endingDebt)} at the end of ${monthLabel(r.end.month)}.`
              : "Add debts in Plan settings to see a payoff timeline."}
          </p>
        </div>
      </section>
      {below.length > 0 && (
        <div className="notice danger">
          <AlertTriangle size={19} />
          <div>
            <strong>Your bank floor needs attention.</strong>
            <p>
              Checking ends below {money(plan.balances.floor)} in{" "}
              {below.map((x) => monthLabel(x.month)).join(", ")}. Reduce
              commitments or review income and cash events.
            </p>
          </div>
        </div>
      )}
      {r.borrowed > 0 && (
        <div className="notice">
          <AlertTriangle size={19} />
          <div>
            <strong>{money(r.borrowed)} of new borrowing is included.</strong>
            <p>
              These funds reduce card balances by moving debt elsewhere. They
              remain debt; this forecast does not model the new loan’s interest
              or repayments.
            </p>
          </div>
        </div>
      )}
      <div className="forecast-stats">
        <div>
          <span className="small muted">Projected card debt</span>
          <strong>{money(endingDebt)}</strong>
          <small className="muted">At horizon end</small>
        </div>
        <div>
          <span className="small muted">Estimated card interest</span>
          <strong>{money(r.interest)}</strong>
          <small className="muted">Over {r.rows.length} months</small>
        </div>
        <div>
          <span className="small muted">Lowest checking</span>
          <strong
            className={
              r.lowestChecking < plan.balances.floor ? "error-text" : ""
            }
          >
            {money(r.lowestChecking)}
          </strong>
          <small className="muted">
            {r.lowestMonth
              ? `End of ${monthLabel(r.lowestMonth)}`
              : "Opening balance"}
          </small>
        </div>
        <div>
          <span className="small muted">Ending checking</span>
          <strong>{money(r.end.checking)}</strong>
          <small className="muted">After bills and payments</small>
        </div>
      </div>
      {plan.debts.length > 0 && (
        <section className="panel">
          <div className="section-title">
            <div>
              <h2>A smaller balance, month by month</h2>
              <p className="small muted">
                Estimated balances after each month’s payments.
              </p>
            </div>
            <ArrowDownRight size={20} className="accent" />
          </div>
          <div className="chart-legend">
            {plan.debts.map((d, i) => (
              <span key={d.id}>
                <i style={{ background: colors[i % colors.length] }} />
                <span>
                  {d.name}
                  <small>
                    {r.payoff[d.id]
                      ? `Paid off ${monthLabel(r.payoff[d.id]!)}`
                      : `${money(r.end!.debts[d.id])} at end`}
                  </small>
                </span>
              </span>
            ))}
          </div>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            className="debt-chart"
            role="img"
            aria-label={`Debt balances from ${plan.balances.asOf} to ${monthLabel(r.end.month)}. Monthly values in the table below.`}
          >
            {[0, 1, 2, 3, 4].map((i) => {
              const v = (ceiling * i) / 4;
              return (
                <g key={i}>
                  <line
                    x1={left}
                    x2={W - right}
                    y1={Y(v)}
                    y2={Y(v)}
                    stroke="var(--border)"
                    strokeDasharray={i ? "3 5" : ""}
                  />
                  <text x={left - 10} y={Y(v) + 4} textAnchor="end">
                    {money(v)}
                  </text>
                </g>
              );
            })}
            {points.map(
              (p, i) =>
                (i === 0 ||
                  i === points.length - 1 ||
                  i % Math.max(1, Math.ceil(points.length / 6)) === 0) && (
                  <text
                    key={p.month}
                    x={X(i)}
                    y={H - 7}
                    textAnchor={
                      i === 0
                        ? "start"
                        : i === points.length - 1
                          ? "end"
                          : "middle"
                    }
                  >
                    {p.month === "Start" ? "Start" : monthLabel(p.month)}
                  </text>
                ),
            )}
            {plan.debts.map((d, i) => (
              <g key={d.id}>
                <polyline
                  points={points
                    .map((p, j) => `${X(j)},${Y(p.debts[d.id] ?? 0)}`)
                    .join(" ")}
                  stroke={colors[i % colors.length]}
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                  fill="none"
                />
                <circle
                  cx={X(points.length - 1)}
                  cy={Y(r.end!.debts[d.id])}
                  r="4"
                  fill={colors[i % colors.length]}
                />
              </g>
            ))}
          </svg>
        </section>
      )}
      <section className="panel">
        <details open>
          <summary>
            <CalendarDays size={17} />
            Month by month
          </summary>
          <div
            className="table-scroll"
            tabIndex={0}
            aria-label="Monthly cash-flow table"
          >
            <table>
              <caption className="sr-only">
                Estimated monthly cash flow and remaining balances
              </caption>
              <thead>
                <tr>
                  <th scope="col">Month</th>
                  <th scope="col">Income</th>
                  <th scope="col">Bills & spending</th>
                  <th scope="col">Cash events</th>
                  <th scope="col">Payments</th>
                  <th scope="col">Interest</th>
                  <th scope="col">Checking</th>
                  {plan.debts.map((d) => (
                    <th key={d.id} scope="col">
                      {d.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {r.rows.map((row) => (
                  <tr key={row.month}>
                    <th scope="row">
                      {monthLabel(row.month)}
                      {row.partial && (
                        <small>
                          From day {Number(plan.balances.asOf.slice(8))}
                        </small>
                      )}
                    </th>
                    <td>{money(row.income, true)}</td>
                    <td>{money(row.expenses, true)}</td>
                    <td>{money(row.events, true)}</td>
                    <td>
                      {money(
                        Object.values(row.payments).reduce((n, a) => n + a, 0),
                        true,
                      )}
                    </td>
                    <td>{money(row.interest, true)}</td>
                    <td className={row.belowFloor ? "error-text" : ""}>
                      {money(row.checking, true)}
                    </td>
                    {plan.debts.map((d) => (
                      <td key={d.id}>{money(row.debts[d.id], true)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </section>
      <div className="forecast-assumptions">
        <h3>A few things behind the numbers</h3>
        <p>
          Interest is estimated monthly on opening card balances. The first
          month prorates interest and spending from your balance date. Income
          arrives in two equal installments on days {plan.fixed.payday1} and{" "}
          {plan.fixed.payday2}; insurance on day {plan.fixed.insuranceDay};
          minimums and extra payments on day {plan.fixed.paymentDay}. Cash
          events are applied once within their month. Promotions include their
          ending month.
        </p>
        <p>
          Checking is measured at month end. Review your real payment dates and
          daily cash needs before relying on this estimate. Logged spending does
          not update these balance snapshots automatically.
        </p>
      </div>
    </div>
  );
}
