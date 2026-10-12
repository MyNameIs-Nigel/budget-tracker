"use client";
import { useRef, useState } from "react";
import {
  Upload,
  Plus,
  Trash2,
  ChevronUp,
  FileCheck2,
  Download,
} from "lucide-react";
import { addMonths, demoPlan, money, totals, type Plan } from "@/lib/budget";
import { importPlan } from "@/lib/import-plan";
import { download } from "@/lib/client";
import type { UpdatePlan } from "./Dashboard";
import { NumberField, TextField } from "./Fields";
import CategorySpending from "./CategorySpending";
import type { SpendingHistory } from "@/lib/spending-history";
export default function PlanSettings({
  plan,
  spendingHistory,
  update,
  onImport,
  testMode,
}: {
  plan: Plan;
  spendingHistory: SpendingHistory;
  update: UpdatePlan;
  onImport: (p: Plan) => void;
  testMode: boolean;
}) {
  const [preview, setPreview] = useState<Plan | null>(null),
    [error, setError] = useState("");
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="view-content">
      <section className="panel import-panel">
        <div className="section-title">
          <div>
            <h2>Bring your plan with you</h2>
            <p className="small muted">
              Import your original HTML report or a Budget JSON export. You’ll
              review it before saving.
            </p>
          </div>
          <Upload size={20} className="accent" />
        </div>
        <div className="button-row">
          <button className="btn" onClick={() => file.current?.click()}>
            <Upload size={16} />
            Import a plan
          </button>
          <button
            className="btn"
            onClick={() =>
              download(
                "budget-plan.json",
                JSON.stringify(plan, null, 2),
                "application/json",
              )
            }
          >
            <Download size={16} />
            Export plan JSON
          </button>
          {testMode && (
            <button
              className="text-btn"
              onClick={() => {
                setPreview(demoPlan());
                setError("");
              }}
            >
              Load fictional example
            </button>
          )}
        </div>
        <input
          className="sr-only"
          ref={file}
          type="file"
          accept=".json,.html,.htm"
          aria-label="Import budget file"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
              if (f.size > 200_000)
                throw new Error("Choose a file smaller than 200 KB.");
              setPreview(importPlan(await f.text()));
              setError("");
            } catch (err) {
              setPreview(null);
              setError(
                err instanceof Error ? err.message : "Could not read the plan.",
              );
            }
            e.target.value = "";
          }}
        />
        {error && (
          <p role="alert" className="error-text small">
            {error}
          </p>
        )}
        {preview && (
          <div className="import-preview">
            <FileCheck2 size={20} />
            <div>
              <strong>{preview.name}</strong>
              <p className="small muted">
                {money(totals(preview).income)} monthly income ·{" "}
                {preview.categories.length} categories · {preview.debts.length}{" "}
                debts · Balances as of {preview.balances.asOf}
              </p>
              <p className="small muted">
                This replaces the plan you’re editing. Your logged transactions
                stay in place. Nothing is saved yet.
              </p>
              <div className="button-row">
                <button
                  className="btn primary"
                  onClick={() => {
                    onImport(preview);
                    setPreview(null);
                  }}
                >
                  Use this plan
                </button>
                <button className="text-btn" onClick={() => setPreview(null)}>
                  Cancel import
                </button>
              </div>
            </div>
          </div>
        )}
      </section>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>The starting point</h2>
            <p className="small muted">
              Update these when you check your accounts.
            </p>
          </div>
        </div>
        <div className="settings-grid">
          <TextField
            label="Plan name"
            value={plan.name}
            onChange={(v) =>
              update((p) => {
                p.name = v;
              })
            }
          />
          <TextField
            label="Balances as of"
            type="date"
            value={plan.balances.asOf}
            onChange={(v) =>
              update((p) => {
                p.balances.asOf = v;
                if (v && p.balances.horizon < v.slice(0, 7))
                  p.balances.horizon = addMonths(v.slice(0, 7), 11);
              })
            }
          />
          <TextField
            label="Forecast through"
            type="month"
            value={plan.balances.horizon}
            onChange={(v) =>
              update((p) => {
                p.balances.horizon = v;
              })
            }
          />
          <NumberField
            label="Checking balance"
            value={plan.balances.checking}
            min={-1_000_000}
            onChange={(n) =>
              update((p) => {
                p.balances.checking = n;
              })
            }
          />
          <NumberField
            label="Bank floor"
            value={plan.balances.floor}
            onChange={(n) =>
              update((p) => {
                p.balances.floor = n;
              })
            }
            help="Cash to protect from surplus payments"
          />
          <label className="stack-field">
            <span>Debt payoff approach</span>
            <select
              value={plan.strategy}
              onChange={(e) =>
                update((p) => {
                  p.strategy = e.target.value as Plan["strategy"];
                })
              }
            >
              <option value="priority">My card order</option>
              <option value="avalanche">Highest interest first</option>
              <option value="snowball">Smallest balance first</option>
            </select>
          </label>
        </div>
      </section>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>Cards & debts</h2>
            <p className="small muted">
              With “My card order,” the first card gets extra payments first.
              Rates switch after the promotion month.
            </p>
          </div>
        </div>
        {plan.debts.map((d, i) => (
          <fieldset className="debt-settings" key={d.id}>
            <legend className="sr-only">{d.name}</legend>
            <div className="item-heading">
              <span className="section-number">
                {String(i + 1).padStart(2, "0")}
              </span>
              <input
                aria-label={`Debt name ${i + 1}`}
                value={d.name}
                maxLength={80}
                onChange={(e) =>
                  update((p) => {
                    p.debts[i].name = e.target.value;
                  })
                }
              />
              <button
                className="icon-btn"
                aria-label={`Move ${d.name} earlier`}
                disabled={i === 0}
                onClick={() =>
                  update((p) => {
                    [p.debts[i - 1], p.debts[i]] = [p.debts[i], p.debts[i - 1]];
                  })
                }
              >
                <ChevronUp size={17} />
              </button>
              <button
                className="icon-btn"
                aria-label={`Remove ${d.name}`}
                onClick={() => {
                  if (window.confirm(`Remove ${d.name} from this plan?`))
                    update((p) => {
                      p.debts.splice(i, 1);
                    });
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
            <div className="settings-grid">
              <NumberField
                label={`${d.name} balance`}
                value={d.balance}
                onChange={(n) =>
                  update((p) => {
                    p.debts[i].balance = n;
                  })
                }
              />
              <NumberField
                label={`${d.name} minimum payment`}
                value={d.minimum}
                onChange={(n) =>
                  update((p) => {
                    p.debts[i].minimum = n;
                  })
                }
              />
              <NumberField
                label={`${d.name} standard APR`}
                value={d.apr}
                max={100}
                prefix=""
                suffix="%"
                onChange={(n) =>
                  update((p) => {
                    p.debts[i].apr = n;
                  })
                }
              />
              <NumberField
                label={`${d.name} promotional APR`}
                value={d.promoApr}
                max={100}
                prefix=""
                suffix="%"
                onChange={(n) =>
                  update((p) => {
                    p.debts[i].promoApr = n;
                  })
                }
              />
              <TextField
                label={`${d.name} promo through (optional)`}
                type="month"
                value={d.promoEnd}
                onChange={(v) =>
                  update((p) => {
                    p.debts[i].promoEnd = v;
                  })
                }
              />
            </div>
          </fieldset>
        ))}
        {!plan.debts.length && (
          <p className="muted empty-note">
            No debts added. Your cash-flow forecast still works.
          </p>
        )}
        <button
          className="btn"
          disabled={plan.debts.length >= 10}
          onClick={() =>
            update((p) => {
              p.debts.push({
                id: crypto.randomUUID(),
                name: `Card ${p.debts.length + 1}`,
                balance: 0,
                minimum: 0,
                apr: 0,
                promoApr: 0,
                promoEnd: "",
              });
            })
          }
        >
          <Plus size={16} />
          Add a debt
        </button>
      </section>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>Upcoming cash changes</h2>
            <p className="small muted">
              A refund, a tuition payment, rent, or new borrowing. Negative
              amounts are outflows.
            </p>
          </div>
        </div>
        {plan.events.map((event, i) => (
          <fieldset key={event.id} className="event-settings">
            <legend className="sr-only">Cash event {i + 1}</legend>
            <div className="item-heading">
              <input
                aria-label={`Cash event name ${i + 1}`}
                value={event.label}
                maxLength={80}
                onChange={(e) =>
                  update((p) => {
                    p.events[i].label = e.target.value;
                  })
                }
              />
              <button
                className="icon-btn"
                aria-label={`Remove ${event.label}`}
                onClick={() =>
                  update((p) => {
                    p.events.splice(i, 1);
                  })
                }
              >
                <Trash2 size={16} />
              </button>
            </div>
            <div className="settings-grid">
              <TextField
                label={`Cash event ${i + 1} month`}
                type="month"
                value={event.month}
                onChange={(v) =>
                  update((p) => {
                    p.events[i].month = v;
                  })
                }
              />
              <NumberField
                label={`Cash event ${i + 1} amount`}
                value={event.amount}
                min={-1_000_000}
                onChange={(n) =>
                  update((p) => {
                    p.events[i].amount = n;
                  })
                }
              />
            </div>
            <div className="button-row">
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={event.borrowed}
                  onChange={(e) =>
                    update((p) => {
                      p.events[i].borrowed = e.target.checked;
                    })
                  }
                />
                New borrowing
              </label>
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={event.giving}
                  onChange={(e) =>
                    update((p) => {
                      p.events[i].giving = e.target.checked;
                    })
                  }
                />
                Apply giving to this inflow
              </label>
            </div>
          </fieldset>
        ))}
        <button
          className="btn"
          disabled={plan.events.length >= 60}
          onClick={() =>
            update((p) => {
              p.events.push({
                id: crypto.randomUUID(),
                month: p.balances.asOf.slice(0, 7),
                label: "New cash event",
                amount: 0,
                borrowed: false,
                giving: false,
              });
            })
          }
        >
          <Plus size={16} />
          Add a cash event
        </button>
      </section>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>Spending categories</h2>
            <p className="small muted">
              Rename a category or add your own. Previous spending comes from
              your recorded transactions in {spendingHistory.label}.
            </p>
          </div>
        </div>
        {plan.categories.map((c, i) => (
          <div className="category-settings" key={c.id}>
            <input
              aria-label={`Category name ${i + 1}`}
              value={c.name}
              maxLength={80}
              onChange={(e) =>
                update((p) => {
                  p.categories[i].name = e.target.value;
                })
              }
            />
            <CategorySpending history={spendingHistory} categoryId={c.id} />
            <button
              className="icon-btn"
              disabled={plan.categories.length === 1}
              aria-label={`Remove category ${c.name}`}
              onClick={() => {
                if (
                  window.confirm(
                    `Remove ${c.name} from the plan? Existing transactions keep their original category.`,
                  )
                )
                  update((p) => {
                    p.categories.splice(i, 1);
                  });
              }}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
        <button
          className="btn"
          disabled={plan.categories.length >= 24}
          onClick={() =>
            update((p) => {
              p.categories.push({
                id: crypto.randomUUID(),
                name: "New category",
                amount: 0,
                baseline: null,
              });
            })
          }
        >
          <Plus size={16} />
          Add a category
        </button>
      </section>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>Monthly timing</h2>
            <p className="small muted">
              Income is split evenly across the two paydays. Choose days 1–28.
            </p>
          </div>
        </div>
        <div className="settings-grid">
          {(
            [
              ["payday1", "First payday"],
              ["payday2", "Second payday"],
              ["insuranceDay", "Insurance / bills day"],
              ["paymentDay", "Debt payment day"],
            ] as const
          ).map(([key, label]) => (
            <NumberField
              key={key}
              label={label}
              value={plan.fixed[key]}
              prefix=""
              step="1"
              min={1}
              max={28}
              onChange={(n) =>
                update((p) => {
                  p.fixed[key] = Math.round(n);
                })
              }
            />
          ))}
        </div>
      </section>
    </div>
  );
}
