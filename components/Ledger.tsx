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
import { request, RequestError } from "@/lib/client";
import type { Transaction } from "@/lib/store";
import {
  runningBalances,
  transactionOrder,
  type CheckingBalance,
} from "@/lib/checking";
import CheckingBalanceCard from "./CheckingBalance";
import CsvImport from "./CsvImport";
import LedgerFiltersBar from "./LedgerFilters";
import CategoryPicker from "./CategoryPicker";
import {
  categoryTone,
  emptyLedgerFilters,
  matchesLedgerFilters,
  type LedgerFilters,
} from "@/lib/ledger-view";
import {
  CATEGORY_BATCH_LIMIT,
  type CategoryAssignmentResult,
} from "@/lib/category-assignment";
import { expenseCategories, fixedExpenseCategories } from "@/lib/categories";

function DescriptionMatch({
  description,
  search,
}: {
  description: string;
  search: string;
}) {
  const terms = search
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    // Longer terms first, so "mark market" highlights all of "market".
    .sort((a, b) => b.length - a.length)
    .map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  if (!terms.length) return <>{description}</>;
  const pattern = new RegExp(`(${terms.join("|")})`, "gi");
  return (
    <>
      {description
        .split(pattern)
        .map((part, index) =>
          index % 2 ? <mark key={index}>{part}</mark> : part,
        )}
    </>
  );
}

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
  const categories = expenseCategories(plan);
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
  const [categoryMessage, setCategoryMessage] = useState("");
  const [filters, setFilters] = useState<LedgerFilters>({
    ...emptyLedgerFilters,
  });
  const [selected, setSelected] = useState<string[]>([]);
  const [categorizing, setCategorizing] = useState<Transaction[] | null>(null);
  const [undo, setUndo] = useState<{ token: string; ids: string[] } | null>(
    null,
  );
  const [updatedIds, setUpdatedIds] = useState<string[]>([]);
  useEffect(() => {
    if (!undo) return;
    const timer = setTimeout(() => setUndo(null), 15 * 60_000);
    return () => clearTimeout(timer);
  }, [undo]);
  useEffect(() => {
    if (!updatedIds.length) return;
    const timer = setTimeout(() => setUpdatedIds([]), 4000);
    return () => clearTimeout(timer);
  }, [updatedIds]);
  const selectionCheckbox = useRef<HTMLInputElement>(null);
  const running = runningBalances(transactions, balance, today());
  const monthRows = transactions
    .filter((t) => !month || t.date.startsWith(month))
    .sort((a, b) => -transactionOrder(a, b));
  const rows = monthRows.filter((row) => matchesLedgerFilters(row, filters));
  const selectable = rows.filter((row) => row.kind === "expense");
  const selectedRows = selectable.filter((row) => selected.includes(row.id));
  const selectAllRows = selectable.slice(0, CATEGORY_BATCH_LIMIT);
  const allSelected =
    selectAllRows.length > 0 &&
    selectAllRows.every((row) => selected.includes(row.id));
  useEffect(() => {
    if (selectionCheckbox.current)
      selectionCheckbox.current.indeterminate =
        selectedRows.length > 0 && !allSelected;
  }, [selectedRows.length, allSelected]);
  const recordedRows = monthRows.filter((row) => row.date <= today());
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
    { id: "bills", name: fixedExpenseCategories.bills, amount: t.bills },
    { id: "giving", name: fixedExpenseCategories.giving, amount: t.giving },
    {
      id: "debt",
      name: fixedExpenseCategories.debt,
      amount: t.minimums + t.extra,
    },
  ];
  const known = new Set(cats.map((c) => c.id));
  for (const row of monthRows)
    if (row.kind === "expense" && !known.has(row.categoryId)) {
      known.add(row.categoryId);
      cats.push({
        id: row.categoryId,
        name:
          row.categoryId === "uncategorized"
            ? fixedExpenseCategories.uncategorized
            : `${row.categoryName} (previous category)`,
        amount: 0,
      });
    }
  const assignableCategories = expenseCategories(plan);
  const filterCategories = new Map(
    assignableCategories.map((category) => [category.id, category]),
  );
  filterCategories.set("income", { id: "income", name: "Income" });
  for (const row of transactions)
    if (!filterCategories.has(row.categoryId))
      filterCategories.set(row.categoryId, {
        id: row.categoryId,
        name: `${row.categoryName} (previous category)`,
      });
  // Keep an active filter selectable after its last entry is reassigned.
  if (filters.category && !filterCategories.has(filters.category))
    filterCategories.set(filters.category, {
      id: filters.category,
      name: "Previous category (no entries)",
    });
  function changeFilters(value: LedgerFilters) {
    setFilters(value);
    setSelected([]);
  }
  function mergeCategoryChanges(result: CategoryAssignmentResult) {
    const changed = new Map(result.transactions.map((row) => [row.id, row]));
    onChange(transactions.map((row) => changed.get(row.id) ?? row));
    setSelected([]);
  }
  /** Undo is withdrawn once this tab changes any row it would restore. */
  function withdrawUndoFor(id: string) {
    if (undo?.ids.includes(id)) setUndo(null);
  }
  function resetCategoryState() {
    setSelected([]);
    setUndo(null);
    setUpdatedIds([]);
    setCategoryMessage("");
  }
  async function assignCategory(categoryId: string) {
    if (!categorizing) return;
    setBusy(true);
    try {
      const result = await request<CategoryAssignmentResult>(
        "/api/transactions/categories",
        "PATCH",
        {
          categoryId,
          transactions: categorizing.map((row) => ({
            id: row.id,
            expected: row,
          })),
        },
      );
      mergeCategoryChanges(result);
      // A no-op keeps the previous Undo, which is still valid on the server.
      if (result.undoToken) {
        const ids = result.transactions.map((row) => row.id);
        setUndo({ token: result.undoToken, ids });
        setUpdatedIds(ids);
        setCategoryMessage(
          `${ids.length} ${ids.length === 1 ? "transaction" : "transactions"} assigned to ${result.transactions[0].categoryName}.`,
        );
      } else setCategoryMessage("These expenses are already in that category.");
      setError("");
    } finally {
      setBusy(false);
    }
  }
  async function undoCategoryChange() {
    if (!undo) return;
    setBusy(true);
    setError("");
    try {
      const result = await request<CategoryAssignmentResult>(
        "/api/transactions/categories",
        "POST",
        { undoToken: undo.token },
      );
      mergeCategoryChanges(result);
      setUndo(null);
      setUpdatedIds(result.transactions.map((row) => row.id));
      setCategoryMessage(
        `Restored the previous categories for ${result.transactions.length} ${result.transactions.length === 1 ? "transaction" : "transactions"}.`,
      );
    } catch (error) {
      // An expired or stale receipt will never succeed; a dropped connection may.
      if (error instanceof RequestError && error.status < 500) setUndo(null);
      setError(
        error instanceof Error ? error.message : "Could not undo. Try again.",
      );
    } finally {
      setBusy(false);
    }
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
              disabled={busy}
              onChange={(e) => {
                setMonth(e.target.value);
                setSelected([]);
              }}
            />
          </label>
          <button
            className="text-btn"
            disabled={busy}
            onClick={() => {
              setMonth("");
              changeFilters({ ...emptyLedgerFilters });
            }}
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
              {Object.values(filters).some(Boolean)
                ? ` matching out of ${monthRows.length}`
                : month
                  ? " in this month"
                  : " in your ledger"}
              .
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
                resetCategoryState();
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
        {categoryMessage && (
          <div className="notice small category-notice">
            <p role="status">{categoryMessage}</p>
            {undo && (
              <button
                className="text-btn"
                disabled={busy}
                onClick={undoCategoryChange}
              >
                Undo category change
              </button>
            )}
          </div>
        )}
        <LedgerFiltersBar
          filters={filters}
          categories={[...filterCategories.values()]}
          uncategorized={
            monthRows.filter(
              (row) =>
                row.kind === "expense" && row.categoryId === "uncategorized",
            ).length
          }
          disabled={busy}
          onChange={changeFilters}
        />
        <p className="small muted">
          Search and filters narrow the list. Checking balances use your whole
          ledger. Totals and comparisons use the selected month, or all dates.
        </p>
        {selectable.length > 0 && (
          <div className="ledger-selection">
            <label className="transaction-select">
              <input
                ref={selectionCheckbox}
                type="checkbox"
                disabled={busy}
                checked={allSelected}
                onChange={(event) =>
                  setSelected(
                    event.target.checked
                      ? selectAllRows.map((row) => row.id)
                      : [],
                  )
                }
              />
              {selectable.length > CATEGORY_BATCH_LIMIT
                ? `Select first ${CATEGORY_BATCH_LIMIT} matching expenses`
                : `Select all ${selectable.length} matching expenses`}
            </label>
            {selectedRows.length > 0 && (
              <>
                <span className="small" role="status">
                  {selectedRows.length} selected
                </span>
                <button
                  className="btn primary"
                  disabled={busy}
                  onClick={() => setCategorizing(selectedRows)}
                >
                  Assign category
                </button>
                <button
                  className="text-btn"
                  disabled={busy}
                  onClick={() => setSelected([])}
                >
                  Clear selection
                </button>
              </>
            )}
          </div>
        )}
        {error && (
          <p className="error-text small" role="alert">
            {error}
          </p>
        )}
        {!rows.length ? (
          <div className="empty-ledger">
            <ReceiptText size={27} />
            <h3>
              {transactions.length
                ? "No matching transactions."
                : "Your checking history starts here."}
            </h3>
            <p className="muted small">
              {transactions.length
                ? "Try another search or clear your filters to see more entries."
                : "Add an entry or import a CSV to start tracking your checking balance."}
            </p>
            <button
              className="text-btn"
              disabled={busy}
              onClick={() => {
                if (transactions.length) {
                  setMonth("");
                  changeFilters({ ...emptyLedgerFilters });
                } else setEditing(null);
              }}
            >
              {transactions.length
                ? "Show all transactions"
                : "Add your first entry"}
            </button>
          </div>
        ) : (
          <div className="transaction-list">
            {rows.map((row) => (
              <div
                className={`transaction-row${updatedIds.includes(row.id) ? " transaction-updated" : ""}`}
                key={row.id}
              >
                {row.kind === "expense" ? (
                  <label className="transaction-select row-select">
                    <input
                      type="checkbox"
                      aria-label={`Select ${row.description}`}
                      disabled={
                        busy ||
                        (!selected.includes(row.id) &&
                          selectedRows.length >= CATEGORY_BATCH_LIMIT)
                      }
                      checked={selected.includes(row.id)}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? [...selected, row.id]
                            : selected.filter((id) => id !== row.id),
                        )
                      }
                    />
                  </label>
                ) : (
                  <span
                    className="row-select income-selection-space"
                    aria-hidden="true"
                  />
                )}
                <div className={`transaction-marker ${row.kind}`}>
                  {row.kind === "income" ? "+" : "−"}
                </div>
                <div className="transaction-description">
                  <strong>
                    <DescriptionMatch
                      description={row.description}
                      search={filters.search}
                    />
                  </strong>
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
                    {row.date > today() && (
                      <span className="transaction-note">Scheduled</span>
                    )}
                    {balance && row.date < balance.asOf && (
                      <span className="transaction-note">
                        Before starting balance
                      </span>
                    )}
                  </span>
                  {row.kind === "expense" ? (
                    <button
                      className={`category-badge ${row.categoryId === "uncategorized" ? "category-uncategorized" : categoryTone(row.categoryId)}`}
                      aria-label={`Change category for ${row.description}, current category ${row.categoryName}`}
                      disabled={busy}
                      onClick={() => setCategorizing([row])}
                    >
                      <span className="category-dot" aria-hidden="true" />
                      {row.categoryName}
                    </button>
                  ) : (
                    <span className="category-badge category-income">
                      Income
                    </span>
                  )}
                  {updatedIds.includes(row.id) && (
                    <span className="transaction-note">Updated</span>
                  )}
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
                        withdrawUndoFor(row.id);
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
            resetCategoryState();
            setMonth("");
            setMessage(
              `Import complete: ${result.added} added, ${result.updated} updated, ${result.skipped} skipped.`,
            );
            setImporting(false);
          }}
        />
      )}
      {categorizing && (
        <CategoryPicker
          rows={categorizing}
          categories={assignableCategories}
          busy={busy}
          onClose={() => setCategorizing(null)}
          onAssign={assignCategory}
        />
      )}
      {editing !== undefined && (
        <Editor
          key={editing?.id ?? "new"}
          transaction={editing}
          plan={plan}
          onClose={() => setEditing(undefined)}
          onSaved={(t) => {
            onChange(
              [t, ...transactions.filter((r) => r.id !== t.id)].sort(
                (a, b) => -transactionOrder(a, b),
              ),
            );
            withdrawUndoFor(t.id);
          }}
        />
      )}
    </div>
  );
}
