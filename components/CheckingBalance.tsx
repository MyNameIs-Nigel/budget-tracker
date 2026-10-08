"use client";
import { useEffect, useRef, useState } from "react";
import { Wallet, X, LoaderCircle } from "lucide-react";
import { money, today } from "@/lib/budget";
import { request } from "@/lib/client";
import type { CheckingBalance } from "@/lib/checking";
import type { Transaction } from "@/lib/store";

function BalanceEditor({
  balance,
  currentBalanceCents,
  onClose,
  onSaved,
}: {
  balance: CheckingBalance | null;
  currentBalanceCents: number | null;
  onClose: () => void;
  onSaved: (balance: CheckingBalance, transactions?: Transaction[]) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedBalance, setSavedBalance] = useState(false);
  useEffect(() => {
    const previous = document.activeElement;
    dialog.current?.showModal();
    return () => {
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="transaction-dialog"
      aria-labelledby="balance-title"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const data = new FormData(event.currentTarget);
          setBusy(true);
          setError("");
          try {
            const saved = await request<CheckingBalance>(
              "/api/checking",
              "PUT",
              {
                asOf: data.get("date"),
                balanceCents: Math.round(Number(data.get("amount")) * 100),
                revision: balance?.revision ?? null,
                mode: "closing",
              },
            );
            setSavedBalance(true);
            onSaved(saved);
            const transactions =
              await request<Transaction[]>("/api/transactions");
            onSaved(saved, transactions);
            onClose();
          } catch (e) {
            setError(
              e instanceof Error ? e.message : "Could not save your balance.",
            );
            setBusy(false);
          }
        }}
      >
        <div className="section-title">
          <h2 id="balance-title">
            {balance ? "Update checking balance" : "Set checking balance"}
          </h2>
          <button
            type="button"
            className="icon-btn"
            aria-label="Close balance form"
            disabled={busy}
            onClick={onClose}
          >
            <X size={19} />
          </button>
        </div>
        <p className="small muted">
          Enter the bank balance at the end of this date. Entries already logged
          that day are included once; new entries update your balance
          automatically.
        </p>
        <div className="two-columns">
          <label className="stack-field">
            <span>Balance (USD)</span>
            <input
              name="amount"
              type="number"
              inputMode="decimal"
              min="-1000000"
              max="1000000"
              step="0.01"
              required
              placeholder="0.00"
              defaultValue={
                currentBalanceCents === null ? "" : currentBalanceCents / 100
              }
              autoFocus
            />
          </label>
          <label className="stack-field">
            <span>Balance date</span>
            <input
              name="date"
              type="date"
              defaultValue={today()}
              max={today()}
              required
            />
          </label>
        </div>
        <p className="small muted">
          This sets a starting point for checking. Earlier entries help
          reconstruct history; transactions dated after today appear as
          projected balances.
        </p>
        {error && (
          <p className="error-text small" role="alert">
            {savedBalance
              ? "Balance saved. Close this form and refresh transactions to load the latest entries."
              : `${error} Close this form and refresh transactions before trying again.`}
          </p>
        )}
        <div className="button-row dialog-actions">
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={onClose}
          >
            {savedBalance ? "Close" : "Cancel"}
          </button>
          <button className="btn primary" disabled={busy || savedBalance}>
            {busy && <LoaderCircle size={16} className="spin" />}
            {savedBalance ? "Balance saved" : "Save balance"}
          </button>
        </div>
      </form>
    </dialog>
  );
}

export default function CheckingBalanceCard({
  balance,
  currentBalanceCents,
  onSaved,
  disabled = false,
}: {
  disabled?: boolean;
  balance: CheckingBalance | null;
  currentBalanceCents: number | null;
  onSaved: (balance: CheckingBalance, transactions?: Transaction[]) => void;
}) {
  const [editing, setEditing] = useState(false);
  return (
    <>
      <section className="checking-card" aria-labelledby="checking-title">
        <div className="checking-overview">
          <span className="checking-icon">
            <Wallet size={23} />
          </span>
          <div>
            <h2 id="checking-title">Checking balance</h2>
            <p className="small muted">
              Through today · from your recorded transactions
            </p>
          </div>
          <button
            className="btn"
            disabled={disabled}
            onClick={() => setEditing(true)}
          >
            {balance ? "Update balance" : "Set balance"}
          </button>
        </div>
        <strong
          className={`checking-amount ${currentBalanceCents !== null && currentBalanceCents < 0 ? "error-text" : ""}`}
        >
          {currentBalanceCents === null
            ? "Set your starting point"
            : money(currentBalanceCents / 100, true)}
        </strong>
        <p className="small muted">
          {balance ? (
            <>
              Calculated opening balance{" "}
              {money(balance.balanceCents / 100, true)} on{" "}
              {new Date(`${balance.asOf}T12:00:00Z`).toLocaleDateString(
                "en-US",
                {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                  timeZone: "UTC",
                },
              )}
              . <span>Edits and imports update the running balance.</span>
            </>
          ) : (
            "Add a bank balance to see your current and running balances. You can log or import transactions first."
          )}
        </p>
      </section>
      {editing && (
        <BalanceEditor
          balance={balance}
          currentBalanceCents={currentBalanceCents}
          onClose={() => setEditing(false)}
          onSaved={onSaved}
        />
      )}
    </>
  );
}
