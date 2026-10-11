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
  Upload,
} from "lucide-react";
import { money, today, totals, type Plan } from "@/lib/budget";
import { request } from "@/lib/client";
import type { Transaction } from "@/lib/store";
import {
  runningBalances,
  transactionOrder,
  type CheckingBalance,
} from "@/lib/checking";
import CheckingBalanceCard from "./CheckingBalance";
import CsvImport from "./CsvImport";

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
    transaction?.categoryId ?? "uncategorized",
  );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  const categories = [
    { id: "uncategorized", name: "Uncategorized" },
    ...plan.categories,
    { id: "bills", name: "Insurance & bills" },
    { id: "giving", name: "Giving" },
    { id: "debt", name: "Debt payments" },
  ];
  if (
    transaction?.kind === "expense" &&
    !categories.some((c) => c.id === transaction.categoryId)
  )
    categories.push({
      id: transaction.categoryId,
      name: `${transaction.categoryName} (previous category)`,
    });
  const effectiveCategory = categories.some((c) => c.id === category)
    ? category
    : categories[0].id;
  return (
    <dialog
      ref={dialog}
      className="transaction-dialog"
      aria-labelledby="transaction-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
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
              ...(transaction ? { expected: transaction } : {}),
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
  balance,
  onBalanceChange,
}: {
  plan: Plan;
  transactions: Transaction[];
  onChange: (tx: Transaction[]) => void;
  dirty: boolean;
  balance: CheckingBalance | null;
  onBalanceChange: (balance: CheckingBalance | null) => void;
}) {
  const [month, setMonth] = useState(""),
    [editing, setEditing] = useState<Transaction | null | undefined>();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState("");
  const running = runningBalances(transactions, balance, today());
  const rows = transactions
    .filter((t) => !month || t.date.startsWith(month))
    .sort((a, b) => -transactionOrder(a, b));
  const recordedRows = rows.filter((row) => row.date <= today());
  const income =
    recordedRows
      .filter((t) => t.kind === "income")
      .reduce((n, t) => n + t.amountCents, 0) / 100;
  const spent =
    recordedRows
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
        name:
          row.categoryId === "uncategorized"
            ? "Uncategorized"
            : `${row.categoryName} (previous category)`,
        amount: 0,
      });
    }
  return (
    <div className="view-content">
      <CheckingBalanceCard
        balance={balance}
        currentBalanceCents={running.currentBalanceCents}
        disabled={busy}
        onSaved={(saved, tx) => {
          onBalanceChange(saved);
          if (tx) onChange(tx);
          setMessage("Checking balance saved.");
        }}
      />
      {message && (
        <p className="notice small" role="status">
          {message}
        </p>
      )}
      {dirty && (
        <div className="notice">
          Comparisons use your saved plan. Save your plan changes to update
          these amounts.
        </div>
      )}
      <div className="ledger-toolbar">
        <div className="month-picker">
          <label className="month-picker">
            <span className="small muted">Viewing month</span>
            <input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
            />
          </label>
          <button
            className="text-btn"
            onClick={() => setMonth("")}
            aria-pressed={!month}
          >
            All transactions
          </button>
        </div>
        <div className="button-row">
          <button
            className="btn"
            disabled={busy}
            onClick={() => setImporting(true)}
          >
            <Upload size={16} />
            Import CSV
          </button>
          <a className="btn" href="/api/export" download>
            <Download size={16} />
            Export CSV
          </a>
          <button
            className="btn primary"
            disabled={busy}
            onClick={() => setEditing(null)}
          >
            <Plus size={17} />
            Log transaction
          </button>
        </div>
      </div>
      <div className="forecast-stats ledger-stats">
        <div>
          <span className="small muted">Money in</span>
          <strong>{money(income, true)}</strong>
          <small className="muted">
            {month
              ? "For the selected month"
              : "Across recorded dates through today"}
          </small>
        </div>
        <div>
          <span className="small muted">Money out</span>
          <strong>{money(spent, true)}</strong>
          <small className="muted">Including bills and debt payments</small>
        </div>
        <div>
          <span className="small muted">Net cash flow</span>
          <strong className={income - spent < 0 ? "error-text" : "accent"}>
            {money(income - spent, true)}
          </strong>
          <small className="muted">
            {month
              ? "For the selected month"
              : "Across recorded dates through today"}
          </small>
        </div>
      </div>
      <section className="panel">
        <div className="section-title">
          <div>
            <h2>Your transactions</h2>
            <p className="small muted">
              {rows.length} {rows.length === 1 ? "entry" : "entries"}
              {month ? "in this month" : "in your ledger"}.
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
                const [tx, latestBalance] = await Promise.all([
                  request<Transaction[]>("/api/transactions"),
                  request<CheckingBalance | null>("/api/checking"),
                ]);
                onChange(tx);
                onBalanceChange(latestBalance);
                setMessage("");
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
            <h3>Your checking history starts here.</h3>
            <p className="muted small">
              Add an entry or import a CSV to start tracking your checking
              balance.
            </p>
            <button
              className="text-btn"
              disabled={busy}
              onClick={() => setEditing(null)}
            >
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
                      {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                        timeZone: "UTC",
                      },
                    )}{" "}
                    · {row.categoryName}
                    {row.date > today() && (
                      <span className="transaction-note">Scheduled</span>
                    )}
                    {balance && row.date < balance.asOf && (
                      <span className="transaction-note">
                        Before starting balance
                      </span>
                    )}
                  </span>
                </div>
                <strong className={row.kind === "income" ? "accent" : ""}>
                  {row.kind === "income" ? "+" : "−"}
                  {money(row.amountCents / 100, true)}
                </strong>
                <div
                  className="transaction-running"
                  aria-label={`Balance after ${row.description}`}
                >
                  <span className="muted small">
                    {row.date > today() ? "Projected balance" : "Balance after"}
                  </span>
                  <strong
                    className={running.balances[row.id] < 0 ? "error-text" : ""}
                  >
                    {balance
                      ? money(running.balances[row.id] / 100, true)
                      : "—"}
                  </strong>
                </div>
                <div className="transaction-actions">
                  <button
                    className="icon-btn"
                    aria-label={`Edit ${row.description}`}
                    disabled={busy}
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
                        await request(`/api/transactions/${row.id}`, "DELETE", {
                          expected: row,
                        });
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
        Running balances use the entire ledger, even when a month is selected.
        Entries on the same date use a consistent order. Future entries are
        projected and do not change today’s balance.
      </p>
      <details className="spending-comparison">
        <summary>Compare spending with your plan</summary>{" "}
        <section className="panel">
          <div className="section-title">
            <div>
              <h2>How your spending compares</h2>
              <p className="small muted">
                {month
                  ? "Actual spending alongside your current monthly plan."
                  : "Select a month above to compare spending with your monthly plan."}
              </p>
            </div>
          </div>
          {month && (
            <div className="actual-grid">
              {cats.map((c) => {
                const actual =
                    recordedRows
                      .filter(
                        (t) => t.kind === "expense" && t.categoryId === c.id,
                      )
                      .reduce((n, t) => n + t.amountCents, 0) / 100,
                  over = actual > c.amount;
                return (
                  <div className="actual-category" key={c.id}>
                    <div>
                      <span>{c.name}</span>
                      <span className={over ? "error-text" : ""}>
                        <strong>{money(actual, true)}</strong>
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
                        {money(actual - c.amount, true)} over plan
                      </small>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </details>
      {importing && (
        <CsvImport
          plan={plan}
          onClose={() => setImporting(false)}
          onImported={(result) => {
            onChange(result.transactions);
            setMonth("");
            setMessage(
              `Import complete: ${result.added} added, ${result.updated} updated, ${result.skipped} skipped.`,
            );
            setImporting(false);
          }}
        />
      )}
      {editing !== undefined && (
        <Editor
          key={editing?.id ?? "new"}
          transaction={editing}
          plan={plan}
          onClose={() => setEditing(undefined)}
          onSaved={(t) =>
            onChange(
              [t, ...transactions.filter((r) => r.id !== t.id)].sort(
                (a, b) => -transactionOrder(a, b),
              ),
            )
          }
        />
      )}
    </div>
  );
}
