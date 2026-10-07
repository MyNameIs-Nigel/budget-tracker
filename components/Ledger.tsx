"use client";
import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Download,
  Pencil,
  Trash2,
  X,
  RefreshCw,
  ReceiptText,
  LoaderCircle,
} from "lucide-react";
import { money, today, totals, type Plan } from "@/lib/budget";
import { request } from "@/lib/client";
import type { Transaction } from "@/lib/store";

function Editor({
  transaction,
  plan,
  onClose,
  onSaved,
}: {
  transaction: Transaction | null;
  plan: Plan;
  onClose: () => void;
  onSaved: (t: Transaction) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [kind, setKind] = useState<"income" | "expense">(
    transaction?.kind ?? "expense",
  );
  const [category, setCategory] = useState(
    transaction?.categoryId ?? plan.categories[0].id,
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const categories = [
    ...plan.categories,
    { id: "bills", name: "Insurance & bills" },
    { id: "giving", name: "Giving" },
    { id: "debt", name: "Debt payments" },
  ];
  // A removed category keeps its historical label; select a current category to edit.
  const effectiveCategory = categories.some((c) => c.id === category)
    ? category
    : categories[0].id;
  return (
    <dialog
      ref={dialog}
      className="transaction-dialog"
      aria-labelledby="transaction-title"
      onCancel={onClose}
      onClose={onClose}
    >
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            const value = {
              date: data.get("date"),
              kind,
              categoryId: kind === "income" ? "income" : effectiveCategory,
              description: data.get("description"),
              amountCents: Math.round(Number(data.get("amount")) * 100),
            };
            const t = await request<Transaction>(
              transaction
                ? `/api/transactions/${transaction.id}`
                : "/api/transactions",
              transaction ? "PATCH" : "POST",
              value,
            );
            onSaved(t);
            onClose();
          } catch (err) {
            setError(
              err instanceof Error
                ? err.message
                : "Could not save this transaction.",
            );
            setBusy(false);
          }
        }}
      >
        <div className="section-title">
          <h2 id="transaction-title">
            {transaction ? "Edit transaction" : "Log a transaction"}
          </h2>
          <button
            className="icon-btn"
            type="button"
            disabled={busy}
            aria-label="Close transaction form"
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        <label className="stack-field">
          <span>Description</span>
          <input
            name="description"
            defaultValue={transaction?.description ?? ""}
            required
            maxLength={160}
            placeholder="What was it for?"
            autoFocus
          />
        </label>
        <div className="two-columns">
          <label className="stack-field">
            <span>Date</span>
            <input
              type="date"
              name="date"
              defaultValue={transaction?.date ?? today()}
              required
            />
          </label>
          <label className="stack-field">
            <span>Amount (USD)</span>
            <input
              type="number"
              name="amount"
              defaultValue={transaction ? transaction.amountCents / 100 : ""}
              min="0.01"
              max="1000000"
              step="0.01"
              inputMode="decimal"
              placeholder="0.00"
              required
            />
          </label>
        </div>
        <div className="two-columns">
          <label className="stack-field">
            <span>Type</span>
            <select
              aria-label="Type"
              value={kind}
              onChange={(e) => setKind(e.target.value as "income" | "expense")}
            >
              <option value="expense">Expense</option>
              <option value="income">Income</option>
            </select>
          </label>
          {kind === "expense" && (
            <label className="stack-field">
              <span>Category</span>
              <select
                aria-label="Category"
                value={effectiveCategory}
                onChange={(e) => setCategory(e.target.value)}
              >
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
          )}
        </div>
        {error && (
          <p role="alert" className="error-text small">
            {error}
          </p>
        )}
        <div className="button-row dialog-actions">
          <button
            className="btn"
            type="button"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
          <button className="btn primary" disabled={busy}>
            {busy && <LoaderCircle className="spin" size={16} />}
            {transaction ? "Save transaction" : "Add transaction"}
          </button>
        </div>
      </form>
    </dialog>
  );
}
export default function Ledger({
  plan,
  transactions,
  onChange,
  dirty,
}: {
  plan: Plan;
  transactions: Transaction[];
  onChange: (tx: Transaction[]) => void;
  dirty: boolean;
}) {
  const [month, setMonth] = useState(today().slice(0, 7)),
    [editing, setEditing] = useState<Transaction | null | undefined>();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const rows = transactions.filter((t) => t.date.startsWith(month));
  const income =
    rows
      .filter((t) => t.kind === "income")
      .reduce((n, t) => n + t.amountCents, 0) / 100;
  const spent =
    rows
      .filter((t) => t.kind === "expense")
      .reduce((n, t) => n + t.amountCents, 0) / 100;
  const t = totals(plan);
  const cats = [
    ...plan.categories,
    { id: "bills", name: "Insurance & bills", amount: t.bills },
    { id: "giving", name: "Giving", amount: t.giving },
    { id: "debt", name: "Debt payments", amount: t.minimums + t.extra },
  ];
  const known = new Set(cats.map((c) => c.id));
  for (const row of rows)
    if (row.kind === "expense" && !known.has(row.categoryId)) {
      known.add(row.categoryId);
      cats.push({
        id: row.categoryId,
        name: `${row.categoryName} (previous category)`,
        amount: 0,
      });
    }
  return (
    <div className="view-content">
      {dirty && (
        <div className="notice">
          Comparisons use your saved plan. Save your plan changes to update
          these amounts.
        </div>
      )}
      <div className="ledger-toolbar">
        <label className="month-picker">
          <span className="small muted">Viewing month</span>
          <input
            type="month"
            value={month}
            required
            onChange={(e) => {
              if (e.target.value) setMonth(e.target.value);
            }}
          />
        </label>
        <div className="button-row">
          <a className="btn" href="/api/export" download>
            <Download size={16} />
            Export CSV
          </a>
          <button className="btn primary" onClick={() => setEditing(null)}>
            <Plus size={17} />
            Log transaction
          </button>
        </div>
      </div>
      <div className="forecast-stats ledger-stats">
        <div>
          <span className="small muted">Income logged</span>
          <strong>{money(income)}</strong>
          <small className="muted">{money(t.income)} planned monthly</small>
        </div>
        <div>
          <span className="small muted">Spent this month</span>
          <strong>{money(spent)}</strong>
          <small className="muted">Including bills and debt payments</small>
        </div>
        <div>
          <span className="small muted">Net cash flow</span>
          <strong className={income - spent < 0 ? "error-text" : "accent"}>
            {money(income - spent)}
          </strong>
          <small className="muted">Logged income minus expenses</small>
        </div>
      </div>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>How your spending compares</h2>
            <p className="small muted">
              Actual spending alongside your current monthly plan.
            </p>
          </div>
        </div>
        <div className="actual-grid">
          {cats.map((c) => {
            const actual =
                rows
                  .filter((t) => t.kind === "expense" && t.categoryId === c.id)
                  .reduce((n, t) => n + t.amountCents, 0) / 100,
              over = actual > c.amount;
            return (
              <div className="actual-category" key={c.id}>
                <div>
                  <span>{c.name}</span>
                  <span className={over ? "error-text" : ""}>
                    <strong>{money(actual)}</strong>
                    <span className="muted"> / {money(c.amount)}</span>
                  </span>
                </div>
                <div className="actual-track">
                  <span
                    style={{
                      width: `${Math.min(100, c.amount ? (actual / c.amount) * 100 : actual ? 100 : 0)}%`,
                      background: over ? "var(--danger)" : "var(--accent)",
                    }}
                  />
                </div>
                {over && (
                  <small className="error-text">
                    {money(actual - c.amount)} over plan
                  </small>
                )}
              </div>
            );
          })}
        </div>
      </section>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>Your transactions</h2>
            <p className="small muted">
              {rows.length} {rows.length === 1 ? "entry" : "entries"} this
              month.
            </p>
          </div>
          <button
            className="icon-btn"
            disabled={busy}
            aria-label="Refresh transactions"
            onClick={async () => {
              setBusy(true);
              setError("");
              try {
                onChange(await request<Transaction[]>("/api/transactions"));
              } catch (e) {
                setError(e instanceof Error ? e.message : "Could not refresh.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <RefreshCw size={17} />
          </button>
        </div>
        {error && (
          <p className="error-text small" role="alert">
            {error}
          </p>
        )}
        {!rows.length ? (
          <div className="empty-ledger">
            <ReceiptText size={27} />
            <h3>A fresh page for the month.</h3>
            <p className="muted small">
              Log your first transaction to see your progress here.
            </p>
            <button className="text-btn" onClick={() => setEditing(null)}>
              Add your first entry
            </button>
          </div>
        ) : (
          <div className="transaction-list">
            {rows.map((row) => (
              <div className="transaction-row" key={row.id}>
                <div className={`transaction-marker ${row.kind}`}>
                  {row.kind === "income" ? "+" : "−"}
                </div>
                <div className="transaction-description">
                  <strong>{row.description}</strong>
                  <span className="muted small">
                    {new Date(`${row.date}T12:00:00Z`).toLocaleDateString(
                      "en-US",
                      { month: "short", day: "numeric", timeZone: "UTC" },
                    )}{" "}
                    · {row.categoryName}
                  </span>
                </div>
                <strong className={row.kind === "income" ? "accent" : ""}>
                  {row.kind === "income" ? "+" : "−"}
                  {money(row.amountCents / 100, true)}
                </strong>
                <div className="transaction-actions">
                  <button
                    className="icon-btn"
                    aria-label={`Edit ${row.description}`}
                    onClick={() => setEditing(row)}
                  >
                    <Pencil size={15} />
                  </button>
                  <button
                    className="icon-btn"
                    disabled={busy}
                    aria-label={`Delete ${row.description}`}
                    onClick={async () => {
                      if (!window.confirm(`Delete “${row.description}”?`))
                        return;
                      setBusy(true);
                      setError("");
                      try {
                        await request(`/api/transactions/${row.id}`, "DELETE");
                        onChange(transactions.filter((t) => t.id !== row.id));
                      } catch (err) {
                        setError(
                          err instanceof Error
                            ? err.message
                            : "Could not delete.",
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
      <p className="small muted">
        These entries track actual cash flow. Update checking and card balances
        in Plan settings to refresh your forecast.
      </p>
      {editing !== undefined && (
        <Editor
          key={editing?.id ?? "new"}
          transaction={editing}
          plan={plan}
          onClose={() => setEditing(undefined)}
          onSaved={(t) =>
            onChange(
              [t, ...transactions.filter((r) => r.id !== t.id)].sort((a, b) =>
                b.date.localeCompare(a.date),
              ),
            )
          }
        />
      )}
    </div>
  );
}
