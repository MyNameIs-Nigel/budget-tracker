"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Check,
  CircleHelp,
  Download,
  LayoutDashboard,
  ListOrdered,
  Settings2,
  TrendingDown,
  Save,
  LoaderCircle,
  ShieldCheck,
  Plus,
} from "lucide-react";
import { allocationCap, money, totals, type Plan } from "@/lib/budget";
import type { AppUser } from "@/lib/dal";
import type { Transaction } from "@/lib/store";
import type { CheckingBalance } from "@/lib/checking";
import { request, download } from "@/lib/client";
import { planSchema } from "@/lib/budget";
import { Brand } from "./Icon";
import UserMenu from "./UserMenu";
import { NumberField } from "./Fields";
import Forecast from "./Forecast";
import PlanSettings from "./PlanSettings";
import Ledger from "./Ledger";

type View = "plan" | "spending" | "forecast" | "settings";
const views = [
  { id: "spending", label: "Checking", icon: ListOrdered },
  { id: "plan", label: "Your plan", icon: LayoutDashboard },
  { id: "forecast", label: "Looking ahead", icon: TrendingDown },
  { id: "settings", label: "Plan settings", icon: Settings2 },
] as const;
export type UpdatePlan = (fn: (draft: Plan) => void) => void;
export default function Dashboard({
  user,
  initialPlan,
  revision: initialRevision,
  initialTransactions,
  initialCheckingBalance,
  testMode,
}: {
  user: AppUser;
  initialPlan: Plan;
  revision: number;
  initialTransactions: Transaction[];
  initialCheckingBalance: CheckingBalance | null;
  testMode: boolean;
}) {
  const [plan, setPlan] = useState(initialPlan),
    [revision, setRevision] = useState(initialRevision);
  const [saved, setSaved] = useState(JSON.stringify(initialPlan));
  const [transactions, setTransactions] = useState(initialTransactions);
  const [checkingBalance, setCheckingBalance] = useState(
    initialCheckingBalance,
  );
  const [view, setView] = useState<View>("spending"),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [error, setError] = useState("");
  const dirty = JSON.stringify(plan) !== saved,
    t = useMemo(() => totals(plan), [plan]);
  const update: UpdatePlan = (fn) => {
    setPlan((current) => {
      const draft = structuredClone(current);
      fn(draft);
      return draft;
    });
    setMessage("");
    setError("");
  };
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  async function save() {
    setError("");
    const valid = planSchema.safeParse(plan);
    if (!valid.success) {
      setError(valid.error.issues[0]?.message ?? "Check your settings.");
      return;
    }
    const snapshot = valid.data;
    setBusy(true);
    try {
      const r = await request<{ revision: number }>("/api/plan", "PUT", {
        plan: snapshot,
        revision,
      });
      setRevision(r.revision);
      // Normalize trimmed labels and JSONB key order without erasing edits made
      // while the save request was in flight.
      setPlan((current) =>
        JSON.stringify(current) === JSON.stringify(plan) ? snapshot : current,
      );
      setSaved(JSON.stringify(snapshot));
      setMessage("All changes saved");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not save. Please try again.",
      );
    } finally {
      setBusy(false);
    }
  }
  const segments = [
    {
      label: "Giving & bills",
      value: t.giving + t.bills,
      color: "var(--segment-bills)",
    },
    {
      label: "Debt payments",
      value: t.minimums + t.extra,
      color: "var(--accent)",
    },
    { label: "Spending", value: t.spending, color: "var(--segment-spending)" },
    {
      label: "Unassigned",
      value: Math.max(0, t.left),
      color: "var(--accent-pale)",
    },
  ];
  const scale = Math.max(1, t.income, t.income - t.left);
  return (
    <div
      onClickCapture={(e) => {
        const a = (e.target as HTMLElement).closest?.("a");
        if (
          dirty &&
          a?.getAttribute("href") === "/admin" &&
          !window.confirm("You have unsaved changes. Leave this page?")
        )
          e.preventDefault();
      }}
    >
      <header className="app-header">
        <div className="header-inner">
          <Brand />
          <span className="header-label">
            <ShieldCheck size={13} />
            Your private budget
          </span>
          <UserMenu
            user={user}
            confirmLeave={() =>
              !dirty ||
              window.confirm(
                "You have unsaved changes. Sign out and leave this page?",
              )
            }
          />
        </div>
        <nav aria-label="Budget views" className="tabs">
          {views.map((v) => (
            <button
              key={v.id}
              aria-current={view === v.id ? "page" : undefined}
              className={view === v.id ? "active" : ""}
              onClick={() => setView(v.id)}
            >
              <v.icon size={16} />
              <span>{v.label}</span>
            </button>
          ))}
        </nav>
      </header>
      <main id="main" className="dashboard">
        <div className="page-heading">
          <div>
            <p className="eyebrow">
              {view === "plan"
                ? "A purpose for every dollar"
                : view === "spending"
                  ? "Your day-to-day money"
                  : view === "forecast"
                    ? "A clear direction"
                    : "Make it yours"}
            </p>
            <h1>
              {view === "plan"
                ? "Your money, with a plan."
                : view === "spending"
                  ? "Know where your money stands."
                  : view === "forecast"
                    ? "A little more breathing room."
                    : "The details behind your plan."}
            </h1>
            <p className="muted">
              {view === "plan"
                ? "Cover the essentials. Make progress on debt. Leave room for life."
                : view === "spending"
                  ? "Set your bank balance. Add transactions. Keep the whole picture in view."
                  : view === "forecast"
                    ? "See where this plan could take you, one month at a time."
                    : "Keep your balances, rates, and upcoming cash changes up to date."}
            </p>
          </div>
          <span className="plan-name">
            {view === "spending" ? "Checking account" : plan.name}
          </span>
        </div>
        {view === "plan" && (
          <div className="view-content">
            <section
              className="allocation-card"
              aria-label="Monthly allocation"
            >
              <div className="allocation-top">
                <div>
                  <span className="eyebrow">Monthly income</span>
                  <strong>{money(t.income)}</strong>
                </div>
                <div className="allocation-remaining">
                  <span className="small muted">
                    {t.left < 0
                      ? "Over budget by"
                      : t.left === 0
                        ? "Every dollar assigned"
                        : "Left to assign"}
                  </span>
                  <strong className={t.left < 0 ? "error-text" : "accent"}>
                    {money(Math.abs(t.left))}
                  </strong>
                </div>
              </div>
              <div
                className="allocation-bar"
                role="img"
                aria-label={segments
                  .map((s) => `${s.label}: ${money(s.value)}`)
                  .join(", ")}
              >
                {segments.map((s) => (
                  <span
                    key={s.label}
                    style={{
                      width: `${(s.value / scale) * 100}%`,
                      background: s.color,
                    }}
                  />
                ))}
              </div>
              <div className="allocation-legend">
                {segments.map((s) => (
                  <span key={s.label}>
                    <i style={{ background: s.color }} />
                    {s.label}
                    <b>{money(s.value)}</b>
                  </span>
                ))}
              </div>
            </section>
            {t.left < 0 && (
              <div className="notice danger" role="status">
                Your allocations exceed income by {money(-t.left)}. Lower
                spending or payments, or update your income. You can still save
                this plan.
              </div>
            )}
            {t.income === 0 && (
              <div className="notice">
                <CircleHelp size={18} />
                <div>
                  <strong>Start with what comes in.</strong>
                  <p>
                    Add your monthly take-home income below. Already have a
                    budget report? Import it in{" "}
                    <button
                      className="inline-btn"
                      onClick={() => setView("settings")}
                    >
                      Plan settings
                    </button>
                    .
                  </p>
                </div>
              </div>
            )}
            <div className="two-columns">
              <section className="panel">
                <div className="section-title">
                  <span className="section-number">01</span>
                  <div>
                    <h2>Money coming in</h2>
                    <p className="small muted">
                      Your monthly take-home amounts.
                    </p>
                  </div>
                  <ArrowUpRight size={18} className="muted" />
                </div>
                <NumberField
                  label="Take-home pay"
                  value={plan.income.pay}
                  onChange={(n) =>
                    update((p) => {
                      p.income.pay = n;
                    })
                  }
                />
                <NumberField
                  label="Family support"
                  value={plan.income.support}
                  onChange={(n) =>
                    update((p) => {
                      p.income.support = n;
                    })
                  }
                />
                <NumberField
                  label="Other income"
                  value={plan.income.other}
                  onChange={(n) =>
                    update((p) => {
                      p.income.other = n;
                    })
                  }
                />
                <div className="total-row">
                  <span>Total monthly income</span>
                  <strong>{money(t.income)}</strong>
                </div>
              </section>
              <section className="panel">
                <div className="section-title">
                  <span className="section-number">02</span>
                  <div>
                    <h2>The essentials</h2>
                    <p className="small muted">
                      Set these aside before spending.
                    </p>
                  </div>
                </div>
                <NumberField
                  label="Giving / tithing"
                  value={plan.fixed.givingRate}
                  prefix=""
                  suffix="%"
                  max={100}
                  onChange={(n) =>
                    update((p) => {
                      p.fixed.givingRate = n;
                    })
                  }
                  help={`${money(t.giving)} of monthly income`}
                />
                <NumberField
                  label="Insurance & bills"
                  value={plan.fixed.insurance}
                  onChange={(n) =>
                    update((p) => {
                      p.fixed.insurance = n;
                    })
                  }
                />
                {plan.debts.length ? (
                  plan.debts.map((d) => (
                    <NumberField
                      key={d.id}
                      label={`${d.name} minimum`}
                      value={d.minimum}
                      onChange={(n) =>
                        update((p) => {
                          p.debts.find((x) => x.id === d.id)!.minimum = n;
                        })
                      }
                    />
                  ))
                ) : (
                  <p className="small muted empty-note">
                    Have a card to pay down?{" "}
                    <button
                      className="inline-btn"
                      onClick={() => setView("settings")}
                    >
                      Add a debt in settings.
                    </button>
                  </p>
                )}
                <div className="total-row">
                  <span>Committed each month</span>
                  <strong>{money(t.giving + t.bills + t.minimums)}</strong>
                </div>
              </section>
            </div>
            <section className="panel debt-allocation">
              <div className="section-title">
                <span className="section-number">03</span>
                <div>
                  <h2>Make room for progress</h2>
                  <p className="small muted">
                    An extra payment before you assign your spending.
                  </p>
                </div>
                <TrendingDown size={20} className="accent" />
              </div>
              <div className="slider-row">
                <div>
                  <strong>Extra toward debt</strong>
                  <p className="small muted">
                    {money(t.minimums + plan.extraPayment)} including your
                    minimums
                  </p>
                </div>
                <input
                  type="range"
                  aria-label="Extra debt payment"
                  min="0"
                  max={Math.max(100, plan.extraPayment + Math.max(0, t.left))}
                  step="1"
                  value={plan.extraPayment}
                  aria-valuetext={money(plan.extraPayment)}
                  onChange={(e) =>
                    update((p) => {
                      p.extraPayment = Math.min(
                        Number(e.target.value),
                        allocationCap(p, p.extraPayment),
                      );
                    })
                  }
                  style={
                    {
                      "--range-fill": `${(plan.extraPayment / Math.max(100, plan.extraPayment + Math.max(0, t.left))) * 100}%`,
                    } as React.CSSProperties
                  }
                />
                <NumberField
                  label="Extra payment amount"
                  value={plan.extraPayment}
                  max={allocationCap(plan, plan.extraPayment)}
                  onChange={(n) =>
                    update((p) => {
                      p.extraPayment = Math.min(
                        n,
                        allocationCap(p, p.extraPayment),
                      );
                    })
                  }
                />
              </div>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={plan.sweepSurplus}
                  onChange={(e) =>
                    update((p) => {
                      p.sweepSurplus = e.target.checked;
                    })
                  }
                />
                <span>
                  Sweep any extra cash above my {money(plan.balances.floor)}{" "}
                  bank floor toward debt.
                  <small className="muted">
                    This includes income you leave unassigned.
                  </small>
                </span>
              </label>
            </section>
            <section className="panel category-panel">
              <div className="section-title">
                <span className="section-number">04</span>
                <div>
                  <h2>Leave room for life</h2>
                  <p className="small muted">
                    Monthly amounts. Each slider stops at the income you have
                    left.
                  </p>
                </div>
                <span className="small muted">{money(t.spending)} total</span>
              </div>
              {plan.categories.map((c) => {
                const cap = allocationCap(plan, c.amount),
                  max = Math.max(100, c.amount, cap);
                return (
                  <div className="slider-row category-row" key={c.id}>
                    <div>
                      <strong>{c.name}</strong>
                      <p className="small muted">
                        About {money((c.amount * 12) / 52)} / week
                        {c.baseline !== null && (
                          <span> · previous {money(c.baseline)} / month</span>
                        )}
                      </p>
                    </div>
                    <input
                      type="range"
                      aria-label={`${c.name} budget`}
                      aria-valuetext={`${money(c.amount)} a month`}
                      min="0"
                      max={max}
                      step="1"
                      value={c.amount}
                      style={
                        {
                          "--range-fill": `${(c.amount / max) * 100}%`,
                        } as React.CSSProperties
                      }
                      onChange={(e) =>
                        update((p) => {
                          p.categories.find((x) => x.id === c.id)!.amount =
                            Math.min(
                              Number(e.target.value),
                              allocationCap(p, c.amount),
                            );
                        })
                      }
                    />
                    <NumberField
                      label={`${c.name} amount`}
                      value={c.amount}
                      max={cap}
                      onChange={(n) =>
                        update((p) => {
                          p.categories.find((x) => x.id === c.id)!.amount =
                            Math.min(n, allocationCap(p, c.amount));
                        })
                      }
                    />
                  </div>
                );
              })}
              <button className="text-btn" onClick={() => setView("settings")}>
                <Plus size={15} />
                Manage categories
              </button>
            </section>
            <button
              className="forecast-link"
              onClick={() => setView("forecast")}
            >
              <span>
                <TrendingDown size={20} />
                <span>
                  <strong>What could this plan do?</strong>
                  <small className="muted">
                    Explore your debt payoff and cash-flow forecast.
                  </small>
                </span>
              </span>
              <ArrowUpRight size={20} />
            </button>
          </div>
        )}
        {view === "forecast" && <Forecast plan={plan} />}
        {view === "settings" && (
          <PlanSettings
            plan={plan}
            update={update}
            onImport={(p) => {
              setPlan(p);
              setError("");
              setMessage(
                "Import preview loaded. Review your plan, then save to keep it.",
              );
            }}
            testMode={testMode}
          />
        )}
        {view === "spending" && (
          <Ledger
            plan={JSON.parse(saved) as Plan}
            transactions={transactions}
            onChange={setTransactions}
            dirty={dirty}
            balance={checkingBalance}
            onBalanceChange={setCheckingBalance}
          />
        )}
        <footer className="dashboard-footer">
          <ShieldCheck size={13} />
          Your budget stays yours.
          <span>
            {view === "spending"
              ? "Amounts in USD · Based on your entries"
              : "Amounts in USD · Estimates, not a bank feed."}
          </span>
        </footer>
      </main>
      {(view === "plan" || view === "settings" || dirty) && (
        <div className="save-dock">
          <div className="save-inner">
            <div className="save-status" aria-live="polite">
              {busy ? (
                <LoaderCircle size={16} className="spin" />
              ) : dirty ? (
                <span className="unsaved-dot" />
              ) : (
                <Check size={16} />
              )}
              <span>
                {busy
                  ? "Saving your plan…"
                  : dirty
                    ? "You have unsaved changes"
                    : "Your plan is saved"}
                {!dirty && message && <small>{message}</small>}
              </span>
            </div>
            <div className="save-actions">
              <button
                className="icon-btn"
                aria-label="Export current plan as JSON"
                title="Export current plan as JSON"
                onClick={() =>
                  download(
                    "budget-plan.json",
                    JSON.stringify(plan, null, 2),
                    "application/json",
                  )
                }
              >
                <Download size={18} />
              </button>
              <button
                className="btn primary"
                disabled={busy || !dirty}
                onClick={save}
              >
                {busy ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <Save size={16} />
                )}
                Save plan
              </button>
            </div>
            {error && (
              <p role="alert" className="save-error">
                {error}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
